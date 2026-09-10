path = "/home/jeffpaz/argus/scheduler.py"
with open(path) as f:
    src = f.read()

# 1. Update _flow_ingestion_job to also call evaluate_rules
old_job = '''def _flow_ingestion_job() -> None:
    """Ingest Firewalla flow logs and run threat analysis. Runs every 5 minutes."""
    if not settings.firewalla_enabled:
        return
    try:
        from argus.flow_ingester import ingest_flows
        from argus.threat_analyzer import analyze_flows

        count = ingest_flows()
        logger.info("Flow ingestion: %d new flows", count)

        if count > 0:
            threats = analyze_flows(since_minutes=6)
            if threats:
                logger.info("Threat analysis: %d new threats detected", threats)
    except Exception as exc:
        logger.error("Flow ingestion job failed: %s", exc)'''

new_job = '''def _flow_ingestion_job() -> None:
    """Ingest Firewalla flow logs, run threat analysis, and evaluate alert rules."""
    if not settings.firewalla_enabled:
        return
    try:
        from argus.flow_ingester import ingest_flows
        from argus.threat_analyzer import analyze_flows
        from argus.rules_engine import evaluate_rules

        count = ingest_flows()
        logger.info("Flow ingestion: %d new flows", count)

        threats = analyze_flows(since_minutes=6)
        if threats:
            logger.info("Threat analysis: %d new threats detected", threats)

        alerts = evaluate_rules()
        if alerts:
            logger.info("Rules engine: %d alert(s) fired", alerts)
    except Exception as exc:
        logger.error("Flow ingestion job failed: %s", exc)'''

if "evaluate_rules" not in src:
    if old_job in src:
        src = src.replace(old_job, new_job)
        print("Updated _flow_ingestion_job with rules engine")
    else:
        print("ERROR: _flow_ingestion_job anchor not found")
else:
    print("_flow_ingestion_job already has rules engine")

# 2. Add rules evaluation at end of _scan_job (for new_device / offline / online triggers)
# Find the end of _scan_job — just before the detect_anomalies call or after it
old_scan_end = '''        detect_anomalies(results, run_id)

        error_summary = "; ".join(f"{k}: {v}" for k, v in errors.items()) if errors else None'''

new_scan_end = '''        detect_anomalies(results, run_id)

        # Evaluate alert rules for new_device / offline / online triggers
        try:
            from argus.rules_engine import evaluate_rules as _evaluate_rules
            _evaluate_rules()
        except Exception as _re_exc:
            logger.warning("Rules engine step failed: %s", _re_exc)

        error_summary = "; ".join(f"{k}: {v}" for k, v in errors.items()) if errors else None'''

if "_evaluate_rules" not in src:
    if old_scan_end in src:
        src = src.replace(old_scan_end, new_scan_end)
        print("Added rules evaluation to _scan_job")
    else:
        print("ERROR: _scan_job anchor not found")
else:
    print("_scan_job already calls rules engine")

with open(path, "w") as f:
    f.write(src)

import ast
ast.parse(src)
print("Syntax OK")
