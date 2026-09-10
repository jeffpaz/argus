import sqlite3

DB_PATH = "/home/jeffpaz/argus/argus.db"
conn = sqlite3.connect(DB_PATH)

conn.executescript("""
CREATE TABLE IF NOT EXISTS alert_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    trigger_type TEXT NOT NULL,
    filter_location TEXT,
    filter_identity_id TEXT,
    filter_severity TEXT,
    filter_threat_type TEXT,
    filter_device_type TEXT,
    threshold_bytes INTEGER,
    active_hours_start INTEGER,
    active_hours_end INTEGER,
    ntfy_server TEXT NOT NULL DEFAULT 'https://ntfy.sh',
    ntfy_topic TEXT NOT NULL,
    ntfy_priority TEXT DEFAULT 'default',
    ntfy_tags TEXT DEFAULT 'shield',
    cooldown_minutes INTEGER DEFAULT 60,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER REFERENCES alert_rules(id),
    rule_name TEXT,
    identity_id TEXT,
    device_name TEXT,
    location TEXT,
    trigger_type TEXT,
    detail TEXT,
    ntfy_topic TEXT,
    ntfy_status INTEGER,
    fired_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule
    ON alert_history(rule_id, fired_at);
CREATE INDEX IF NOT EXISTS idx_alert_history_identity
    ON alert_history(identity_id, fired_at);

INSERT OR IGNORE INTO alert_rules
  (name, description, trigger_type, filter_severity,
   ntfy_topic, ntfy_priority, ntfy_tags, cooldown_minutes)
VALUES
  ('High Severity Threat', 'Any high or critical threat detected',
   'threat', 'high',
   'argus-pazlabs', 'urgent', 'warning,shield', 30),

  ('New Unknown Device', 'Unknown device joins any network',
   'new_device', NULL,
   'argus-pazlabs', 'high', 'new,computer', 1440),

  ('Malicious IP Contact', 'Any device contacts known malicious IP',
   'threat', NULL,
   'argus-pazlabs', 'urgent', 'rotating_light,shield', 15),

  ('Port Scan Detected', 'Internal port scanning detected',
   'threat', NULL,
   'argus-pazlabs', 'urgent', 'rotating_light', 60),

  ('Cabin Device Offline', 'Any cabin device goes offline',
   'device_offline', NULL,
   'argus-pazlabs', 'default', 'warning', 120);
""")

# Fix: 'Malicious IP' and 'Port Scan' rules need filter_threat_type
conn.execute("UPDATE alert_rules SET filter_threat_type='malicious_ip' WHERE name='Malicious IP Contact'")
conn.execute("UPDATE alert_rules SET filter_threat_type='port_scan', filter_location='MSP' WHERE name='Port Scan Detected'")
conn.execute("UPDATE alert_rules SET filter_location='CBN' WHERE name='Cabin Device Offline'")
conn.commit()

tables = conn.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('alert_rules','alert_history')"
).fetchall()
print("Tables:", [t[0] for t in tables])

rules = conn.execute("SELECT id, name, trigger_type, ntfy_topic FROM alert_rules").fetchall()
print(f"Rules inserted: {len(rules)}")
for r in rules:
    print(f"  [{r[0]}] {r[1]} ({r[2]}) → {r[3]}")

conn.close()
print("Phase 2 PASS")
