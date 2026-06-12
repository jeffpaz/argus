"""Alert rules engine — evaluates enabled rules against recent data and fires NTFY.

Call evaluate_rules() after each scan cycle and each flow ingestion cycle.
It reads alert_rules, checks cooldowns via alert_history, and POSTs to ntfy
for any matches. All notification delivery is logged back to alert_history.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from typing import Optional

from argus.notifier import (
    THREAT_LABELS,
    format_bytes,
    is_in_cooldown,
    log_alert,
    send_ntfy,
)

logger = logging.getLogger(__name__)

DB_PATH = "/home/jeffpaz/argus/argus.db"

SEVERITY_ORDER = ["low", "medium", "high", "critical"]


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _current_hour() -> int:
    return datetime.utcnow().hour


def _in_active_hours(rule: sqlite3.Row) -> bool:
    start = rule["active_hours_start"]
    end = rule["active_hours_end"]
    if start is None or end is None:
        return True
    hour = _current_hour()
    if start <= end:
        return start <= hour <= end
    return hour >= start or hour <= end   # wraps midnight


def _ntfy(db: sqlite3.Connection, rule: sqlite3.Row, identity_id: Optional[str],
          device_name: str, location: str, trigger_type: str,
          title: str, message: str, click_url: str = "https://argus.pazlabs.io") -> None:
    status = send_ntfy(
        server=rule["ntfy_server"],
        topic=rule["ntfy_topic"],
        title=title,
        message=message,
        priority=rule["ntfy_priority"],
        tags=rule["ntfy_tags"] or "shield",
        click_url=click_url,
    )
    log_alert(
        db, rule["id"], rule["name"], identity_id, device_name,
        location, trigger_type, message, rule["ntfy_topic"], status,
    )
    logger.info("Alert fired: rule=%r device=%r status=%d", rule["name"], device_name, status)


def evaluate_rules(db: Optional[sqlite3.Connection] = None) -> int:
    """Evaluate all enabled rules. Returns count of alerts fired."""
    close_db = False
    if db is None:
        db = _db()
        close_db = True

    alerts_fired = 0

    try:
        rules = db.execute("SELECT * FROM alert_rules WHERE enabled=1").fetchall()

        for rule in rules:
            if not _in_active_hours(rule):
                continue

            trigger = rule["trigger_type"]

            # ── THREAT ───────────────────────────────────────────────────────
            if trigger == "threat":
                query = """
                    SELECT tm.*, di.display_name, di.location
                    FROM threat_matches tm
                    LEFT JOIN device_identities di ON tm.identity_id = di.id
                    WHERE tm.resolved = 0
                      AND tm.timestamp >= datetime('now', '-10 minutes')
                """
                params: list = []

                if rule["filter_severity"] and rule["filter_severity"] in SEVERITY_ORDER:
                    min_idx = SEVERITY_ORDER.index(rule["filter_severity"])
                    allowed = SEVERITY_ORDER[min_idx:]
                    placeholders = ",".join("?" * len(allowed))
                    query += f" AND tm.severity IN ({placeholders})"
                    params.extend(allowed)

                if rule["filter_threat_type"]:
                    query += " AND tm.threat_type = ?"
                    params.append(rule["filter_threat_type"])

                if rule["filter_location"]:
                    query += " AND di.location = ?"
                    params.append(rule["filter_location"])

                for threat in db.execute(query, params).fetchall():
                    identity_id = threat["identity_id"]
                    if is_in_cooldown(db, rule["id"], identity_id, rule["cooldown_minutes"]):
                        continue

                    device_name = threat["display_name"] or threat["src_ip"] or "Unknown"
                    location = threat["location"] or "?"
                    label = THREAT_LABELS.get(threat["threat_type"], threat["threat_type"])
                    title = f"{label} — {device_name}"
                    message = (
                        f"Device: {device_name} ({location})\n"
                        f"Severity: {threat['severity'].upper()}\n"
                        f"Detail: {threat['detail']}\n"
                        f"Time: {threat['timestamp']}"
                    )
                    click = (
                        f"https://argus.pazlabs.io/device?identity_id={identity_id}"
                        if identity_id else "https://argus.pazlabs.io"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message, click)
                    alerts_fired += 1

            # ── NEW DEVICE ────────────────────────────────────────────────────
            elif trigger == "new_device":
                for device in db.execute("""
                    SELECT id, display_name, location, device_type, first_seen
                    FROM device_identities
                    WHERE first_seen >= datetime('now', '-10 minutes')
                """).fetchall():
                    if rule["filter_location"] and device["location"] != rule["filter_location"]:
                        continue
                    if rule["filter_device_type"] and device["device_type"] != rule["filter_device_type"]:
                        continue

                    identity_id = device["id"]
                    if is_in_cooldown(db, rule["id"], identity_id, rule["cooldown_minutes"]):
                        continue

                    device_name = device["display_name"] or "Unknown"
                    location = device["location"] or "?"
                    title = f"🆕 New Device — {device_name}"
                    message = (
                        f"New device on {location} network\n"
                        f"Name: {device_name}\n"
                        f"Type: {device['device_type'] or 'Unknown'}\n"
                        f"First seen: {device['first_seen']}"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message,
                          f"https://argus.pazlabs.io/device?identity_id={identity_id}")
                    alerts_fired += 1

            # ── DEVICE OFFLINE ────────────────────────────────────────────────
            elif trigger == "device_offline":
                for event in db.execute("""
                    SELECT ue.identity_id, ue.timestamp,
                           di.display_name, di.location, di.device_type
                    FROM identity_uptime_events ue
                    JOIN device_identities di ON ue.identity_id = di.id
                    WHERE ue.event = 'offline'
                      AND ue.timestamp >= datetime('now', '-10 minutes')
                """).fetchall():
                    if rule["filter_location"] and event["location"] != rule["filter_location"]:
                        continue

                    identity_id = event["identity_id"]
                    if is_in_cooldown(db, rule["id"], identity_id, rule["cooldown_minutes"]):
                        continue

                    device_name = event["display_name"] or "Unknown"
                    location = event["location"] or "?"
                    title = f"📴 Offline — {device_name}"
                    message = (
                        f"{device_name} went offline\n"
                        f"Location: {location}\n"
                        f"Time: {event['timestamp']}"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message)
                    alerts_fired += 1

            # ── DEVICE ONLINE ─────────────────────────────────────────────────
            elif trigger == "device_online":
                for event in db.execute("""
                    SELECT ue.identity_id, ue.timestamp,
                           di.display_name, di.location
                    FROM identity_uptime_events ue
                    JOIN device_identities di ON ue.identity_id = di.id
                    WHERE ue.event = 'online'
                      AND ue.timestamp >= datetime('now', '-10 minutes')
                """).fetchall():
                    if rule["filter_location"] and event["location"] != rule["filter_location"]:
                        continue

                    identity_id = event["identity_id"]
                    if is_in_cooldown(db, rule["id"], identity_id, rule["cooldown_minutes"]):
                        continue

                    device_name = event["display_name"] or "Unknown"
                    location = event["location"] or "?"
                    title = f"✅ Online — {device_name}"
                    message = (
                        f"{device_name} is back online\n"
                        f"Location: {location}\n"
                        f"Time: {event['timestamp']}"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message)
                    alerts_fired += 1

            # ── BANDWIDTH ─────────────────────────────────────────────────────
            elif trigger == "bandwidth":
                threshold = rule["threshold_bytes"] or 10_737_418_240  # 10 GB default
                for row in db.execute("""
                    SELECT identity_id, SUM(bytes_in + bytes_out) as total_bytes
                    FROM identity_bandwidth_snapshots
                    WHERE timestamp >= datetime('now', '-24 hours')
                    GROUP BY identity_id
                    HAVING total_bytes >= ?
                """, (threshold,)).fetchall():
                    identity_id = row["identity_id"]
                    if is_in_cooldown(db, rule["id"], identity_id, rule["cooldown_minutes"]):
                        continue

                    dev = db.execute(
                        "SELECT display_name, location FROM device_identities WHERE id=?",
                        (identity_id,)
                    ).fetchone()
                    if not dev:
                        continue
                    if rule["filter_location"] and dev["location"] != rule["filter_location"]:
                        continue

                    device_name = dev["display_name"] or "Unknown"
                    location = dev["location"] or "?"
                    total_str = format_bytes(row["total_bytes"])
                    thresh_str = format_bytes(threshold)
                    title = f"📊 Bandwidth Alert — {device_name}"
                    message = (
                        f"{device_name} used {total_str} in 24h\n"
                        f"Threshold: {thresh_str}\n"
                        f"Location: {location}"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message,
                          f"https://argus.pazlabs.io/device?identity_id={identity_id}")
                    alerts_fired += 1

            # ── DNS ANOMALY ───────────────────────────────────────────────────
            elif trigger == "dns_anomaly":
                for anomaly in db.execute("""
                    SELECT da.mac, da.domain, da.flag_reason, da.query_count,
                           da.timestamp, da.location,
                           d.firewalla_name, d.hostname, d.identity_id,
                           di.display_name
                    FROM dns_anomalies da
                    LEFT JOIN devices d ON da.mac = d.mac
                    LEFT JOIN device_identities di ON d.identity_id = di.id
                    WHERE da.flagged = 1
                      AND da.timestamp >= datetime('now', '-10 minutes')
                """).fetchall():
                    if rule["filter_location"] and anomaly["location"] != rule["filter_location"]:
                        continue

                    identity_id = anomaly["identity_id"]
                    if is_in_cooldown(db, rule["id"], identity_id or anomaly["mac"],
                                      rule["cooldown_minutes"]):
                        continue

                    device_name = (anomaly["display_name"] or anomaly["firewalla_name"]
                                   or anomaly["hostname"] or anomaly["mac"])
                    location = anomaly["location"] or "?"
                    title = f"🔍 DNS Anomaly — {device_name}"
                    message = (
                        f"Device: {device_name} ({location})\n"
                        f"Domain: {anomaly['domain']}\n"
                        f"Reason: {anomaly['flag_reason'] or 'flagged'}\n"
                        f"Queries: {anomaly['query_count']}"
                    )
                    _ntfy(db, rule, identity_id, device_name, location, trigger, title, message)
                    alerts_fired += 1

    finally:
        if close_db:
            db.close()

    if alerts_fired:
        logger.info("Rules engine: %d alert(s) fired", alerts_fired)
    return alerts_fired
