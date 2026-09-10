import sqlite3

DB_PATH = "/home/jeffpaz/argus/argus.db"
conn = sqlite3.connect(DB_PATH)

conn.executescript("""
INSERT OR IGNORE INTO alert_rules
  (name, description, trigger_type, filter_location,
   ntfy_topic, ntfy_priority, ntfy_tags,
   cooldown_minutes, threshold_bytes)
VALUES
  ('New Cabin Device',
   'New device appears at cabin when you may not be there',
   'new_device', 'CBN',
   'argus-pazlabs', 'high', 'house,new', 60, NULL),

  ('Cabin Router Offline',
   'Firewalla at cabin goes offline',
   'device_offline', 'CBN',
   'argus-pazlabs', 'urgent', 'warning,house', 30, NULL),

  ('PHX Device Offline',
   'Any Phoenix device goes offline unexpectedly',
   'device_offline', 'PHX',
   'argus-pazlabs', 'default', 'warning', 120, NULL),

  ('Bandwidth Spike',
   'Any device exceeds 5 GB in 24 hours',
   'bandwidth', NULL,
   'argus-pazlabs', 'high', 'chart_with_upwards_trend', 360,
   5368709120),

  ('DNS Anomaly Alert',
   'Flagged DNS query pattern detected',
   'dns_anomaly', NULL,
   'argus-pazlabs', 'high', 'mag,warning', 60, NULL),

  ('Critical Threat',
   'Critical severity threat detected on any network',
   'threat', NULL,
   'argus-pazlabs', 'urgent', 'rotating_light,sos', 15, NULL);
""")

# Fix Critical Threat rule filter_severity
conn.execute("UPDATE alert_rules SET filter_severity='critical' WHERE name='Critical Threat'")
conn.commit()

rules = conn.execute("SELECT id, name, trigger_type FROM alert_rules").fetchall()
print(f"Total rules: {len(rules)}")
for r in rules:
    print(f"  [{r[0]}] {r[1]} ({r[2]})")
conn.close()
