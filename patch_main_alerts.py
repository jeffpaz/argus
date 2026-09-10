path = "/home/jeffpaz/argus/api/main.py"
with open(path) as f:
    src = f.read()

old_import = "from argus.api.routers import devices, firewalla, reports, scans, network, identities, flows"
new_import = "from argus.api.routers import devices, firewalla, reports, scans, network, identities, flows, alerts"

if "alerts" not in src:
    src = src.replace(old_import, new_import)
    print("Updated import")
else:
    print("alerts already imported")

old_router = 'app.include_router(flows.router, prefix="/flows", tags=["flows"], dependencies=_auth)'
new_router = '''app.include_router(flows.router, prefix="/flows", tags=["flows"], dependencies=_auth)
app.include_router(alerts.router, prefix="/alerts", tags=["alerts"], dependencies=_auth)'''

if 'prefix="/alerts"' not in src:
    src = src.replace(old_router, new_router)
    print("Registered alerts router")
else:
    print("alerts router already registered")

with open(path, "w") as f:
    f.write(src)

import ast; ast.parse(src)
print("Syntax OK")
