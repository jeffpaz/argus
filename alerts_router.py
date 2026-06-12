"""Alert rules management and history endpoints."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, HTTPException, Query

from argus.config import settings
from argus.notifier import send_ntfy, THREAT_LABELS

router = APIRouter()

VALID_TRIGGER_TYPES = {
    "threat", "new_device", "device_offline", "device_online",
    "bandwidth", "dns_anomaly", "port_change", "scan_complete",
}
VALID_SEVERITIES = {"low", "medium", "high", "critical"}
VALID_PRIORITIES = {"min", "low", "default", "high", "urgent"}


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def _rule_to_dict(r: sqlite3.Row) -> dict:
    return {
        "id": r["id"],
        "name": r["name"],
        "description": r["description"],
        "enabled": bool(r["enabled"]),
        "trigger_type": r["trigger_type"],
        "filter_location": r["filter_location"],
        "filter_identity_id": r["filter_identity_id"],
        "filter_severity": r["filter_severity"],
        "filter_threat_type": r["filter_threat_type"],
        "filter_device_type": r["filter_device_type"],
        "threshold_bytes": r["threshold_bytes"],
        "active_hours_start": r["active_hours_start"],
        "active_hours_end": r["active_hours_end"],
        "ntfy_server": r["ntfy_server"],
        "ntfy_topic": r["ntfy_topic"],
        "ntfy_priority": r["ntfy_priority"],
        "ntfy_tags": r["ntfy_tags"],
        "cooldown_minutes": r["cooldown_minutes"],
        "created_at": r["created_at"],
        "updated_at": r["updated_at"],
    }


# ---------------------------------------------------------------------------
# POST /alerts/evaluate — manual trigger
# ---------------------------------------------------------------------------

@router.post("/evaluate", summary="Manually trigger rules evaluation")
def trigger_evaluate() -> dict:
    try:
        from argus.rules_engine import evaluate_rules
        count = evaluate_rules()
        return {
            "status": "ok",
            "alerts_fired": count,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# GET /alerts/rules
# ---------------------------------------------------------------------------

@router.get("/rules", summary="List all alert rules")
def list_rules() -> list[dict]:
    conn = _db()
    try:
        rows = conn.execute(
            "SELECT * FROM alert_rules ORDER BY trigger_type, name"
        ).fetchall()
        return [_rule_to_dict(r) for r in rows]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /alerts/rules
# ---------------------------------------------------------------------------

@router.post("/rules", summary="Create a new alert rule")
def create_rule(body: dict = Body(...)) -> dict:
    trigger_type = body.get("trigger_type", "")
    if trigger_type not in VALID_TRIGGER_TYPES:
        raise HTTPException(400, f"Invalid trigger_type: {trigger_type}")
    if not body.get("ntfy_topic"):
        raise HTTPException(400, "ntfy_topic is required")
    if not body.get("name"):
        raise HTTPException(400, "name is required")

    conn = _db()
    try:
        cur = conn.execute("""
            INSERT INTO alert_rules
              (name, description, enabled, trigger_type,
               filter_location, filter_identity_id, filter_severity,
               filter_threat_type, filter_device_type, threshold_bytes,
               active_hours_start, active_hours_end,
               ntfy_server, ntfy_topic, ntfy_priority, ntfy_tags,
               cooldown_minutes)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            body["name"],
            body.get("description"),
            1 if body.get("enabled", True) else 0,
            trigger_type,
            body.get("filter_location"),
            body.get("filter_identity_id"),
            body.get("filter_severity"),
            body.get("filter_threat_type"),
            body.get("filter_device_type"),
            body.get("threshold_bytes"),
            body.get("active_hours_start"),
            body.get("active_hours_end"),
            body.get("ntfy_server", "https://ntfy.sh"),
            body["ntfy_topic"],
            body.get("ntfy_priority", "default"),
            body.get("ntfy_tags", "shield"),
            body.get("cooldown_minutes", 60),
        ))
        conn.commit()
        row = conn.execute("SELECT * FROM alert_rules WHERE id=?", (cur.lastrowid,)).fetchone()
        return _rule_to_dict(row)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# PATCH /alerts/rules/{id}
# ---------------------------------------------------------------------------

@router.patch("/rules/{rule_id}", summary="Update an alert rule")
def update_rule(rule_id: int, body: dict = Body(...)) -> dict:
    conn = _db()
    try:
        existing = conn.execute("SELECT * FROM alert_rules WHERE id=?", (rule_id,)).fetchone()
        if not existing:
            raise HTTPException(404, f"Rule {rule_id} not found")

        allowed_fields = {
            "name", "description", "enabled", "trigger_type",
            "filter_location", "filter_identity_id", "filter_severity",
            "filter_threat_type", "filter_device_type", "threshold_bytes",
            "active_hours_start", "active_hours_end",
            "ntfy_server", "ntfy_topic", "ntfy_priority", "ntfy_tags",
            "cooldown_minutes",
        }
        updates = {k: v for k, v in body.items() if k in allowed_fields}
        if not updates:
            raise HTTPException(400, "No valid fields to update")

        updates["updated_at"] = datetime.utcnow().isoformat()
        set_clause = ", ".join(f"{k}=?" for k in updates)
        values = list(updates.values()) + [rule_id]
        conn.execute(f"UPDATE alert_rules SET {set_clause} WHERE id=?", values)
        conn.commit()

        row = conn.execute("SELECT * FROM alert_rules WHERE id=?", (rule_id,)).fetchone()
        return _rule_to_dict(row)
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# DELETE /alerts/rules/{id}
# ---------------------------------------------------------------------------

@router.delete("/rules/{rule_id}", summary="Delete an alert rule")
def delete_rule(rule_id: int) -> dict:
    conn = _db()
    try:
        existing = conn.execute("SELECT id FROM alert_rules WHERE id=?", (rule_id,)).fetchone()
        if not existing:
            raise HTTPException(404, f"Rule {rule_id} not found")
        conn.execute("DELETE FROM alert_history WHERE rule_id=?", (rule_id,))
        conn.execute("DELETE FROM alert_rules WHERE id=?", (rule_id,))
        conn.commit()
        return {"status": "deleted", "id": rule_id}
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# GET /alerts/history
# ---------------------------------------------------------------------------

@router.get("/history", summary="Alert firing history")
def alert_history(
    limit: int = Query(50, ge=1, le=500),
    rule_id: Optional[int] = Query(None),
) -> list[dict]:
    conn = _db()
    try:
        if rule_id is not None:
            rows = conn.execute(
                "SELECT * FROM alert_history WHERE rule_id=? ORDER BY fired_at DESC LIMIT ?",
                (rule_id, limit)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM alert_history ORDER BY fired_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
        return [
            {
                "id": r["id"],
                "rule_id": r["rule_id"],
                "rule_name": r["rule_name"],
                "identity_id": r["identity_id"],
                "device_name": r["device_name"],
                "location": r["location"],
                "trigger_type": r["trigger_type"],
                "detail": r["detail"],
                "ntfy_topic": r["ntfy_topic"],
                "ntfy_status": r["ntfy_status"],
                "fired_at": r["fired_at"],
            }
            for r in rows
        ]
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# POST /alerts/test/{rule_id}
# ---------------------------------------------------------------------------

@router.post("/test/{rule_id}", summary="Send test notification for a rule")
def test_rule(rule_id: int) -> dict:
    conn = _db()
    try:
        rule = conn.execute("SELECT * FROM alert_rules WHERE id=?", (rule_id,)).fetchone()
        if not rule:
            raise HTTPException(404, f"Rule {rule_id} not found")

        title = f"🧪 Test — {rule['name']}"
        message = (
            f"Test notification for rule: {rule['name']}\n"
            f"Trigger: {rule['trigger_type']}\n"
            f"This is a test — no real event occurred."
        )
        status = send_ntfy(
            server=rule["ntfy_server"],
            topic=rule["ntfy_topic"],
            title=title,
            message=message,
            priority=rule["ntfy_priority"],
            tags=rule["ntfy_tags"] or "shield",
        )
        return {
            "status": "sent" if status == 200 else "failed",
            "ntfy_status": status,
            "rule_id": rule_id,
            "rule_name": rule["name"],
        }
    finally:
        conn.close()
