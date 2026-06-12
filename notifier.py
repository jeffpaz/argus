"""NTFY notification sender for the alert rules engine.

Wraps the raw ntfy HTTP call with cooldown checking and alert_history logging.
The existing notify.py is used by the scanner for system alerts;
this module is used by the rules engine for user-configurable rule alerts.
"""

from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

DB_PATH = "/home/jeffpaz/argus/argus.db"

NTFY_PRIORITY: dict[str, int] = {
    "min": 1, "low": 2, "default": 3, "high": 4, "urgent": 5
}

THREAT_LABELS: dict[str, str] = {
    "malicious_ip":  "🚨 Malicious IP Contact",
    "port_scan":     "🔍 Port Scan Detected",
    "cleartext":     "🔓 Cleartext Traffic",
    "unusual_hours": "🌙 Unusual Hour Activity",
    "rogue_dhcp":    "⚠️ Rogue DHCP Server",
    "internal_scan": "🔍 Internal Network Scan",
    "dns_anomaly":   "🔍 DNS Anomaly",
    "new_device":    "🆕 New Device Detected",
    "device_offline": "📴 Device Offline",
    "device_online":  "✅ Device Online",
    "bandwidth":     "📊 Bandwidth Alert",
    "port_change":   "🔌 Port Change Detected",
}


def send_ntfy(
    server: str,
    topic: str,
    title: str,
    message: str,
    priority: str = "default",
    tags: str = "shield",
    click_url: str = "https://argus.pazlabs.io",
    auth_token: Optional[str] = None,
) -> int:
    """Send a ntfy notification. Returns HTTP status code (0 on connection error)."""
    # HTTP headers must be ASCII — strip non-ASCII from title (emoji stay in body)
    ascii_title = title.encode("ascii", errors="ignore").decode("ascii").strip() or "Argus Alert"
    headers: dict[str, str] = {
        "X-Title": ascii_title,
        "X-Priority": str(NTFY_PRIORITY.get(priority, 3)),
        "X-Tags": tags,
        "X-Click": click_url,
        "Content-Type": "text/plain; charset=utf-8",
    }
    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    try:
        resp = httpx.post(
            f"{server.rstrip('/')}/{topic}",
            content=message.encode("utf-8"),
            headers=headers,
            timeout=10,
        )
        logger.debug("ntfy %s → HTTP %d", title, resp.status_code)
        return resp.status_code
    except Exception as e:
        logger.warning("ntfy send error (%r): %s", title, e)
        return 0


def is_in_cooldown(
    db: sqlite3.Connection,
    rule_id: int,
    identity_id: Optional[str],
    cooldown_minutes: int,
) -> bool:
    """Return True if this rule+device already fired within the cooldown window."""
    since = (datetime.utcnow() - timedelta(minutes=cooldown_minutes)).isoformat()
    row = db.execute(
        """
        SELECT id FROM alert_history
        WHERE rule_id = ?
          AND (identity_id = ? OR (identity_id IS NULL AND ? IS NULL))
          AND fired_at >= ?
        LIMIT 1
        """,
        (rule_id, identity_id, identity_id, since),
    ).fetchone()
    return row is not None


def log_alert(
    db: sqlite3.Connection,
    rule_id: int,
    rule_name: str,
    identity_id: Optional[str],
    device_name: str,
    location: str,
    trigger_type: str,
    detail: str,
    ntfy_topic: str,
    ntfy_status: int,
) -> None:
    db.execute(
        """
        INSERT INTO alert_history
          (rule_id, rule_name, identity_id, device_name,
           location, trigger_type, detail, ntfy_topic, ntfy_status)
        VALUES (?,?,?,?,?,?,?,?,?)
        """,
        (rule_id, rule_name, identity_id, device_name,
         location, trigger_type, detail, ntfy_topic, ntfy_status),
    )
    db.commit()


def format_bytes(b: int) -> str:
    if b < 1024:
        return f"{b} B"
    if b < 1_048_576:
        return f"{b / 1024:.1f} KB"
    if b < 1_073_741_824:
        return f"{b / 1_048_576:.1f} MB"
    return f"{b / 1_073_741_824:.2f} GB"
