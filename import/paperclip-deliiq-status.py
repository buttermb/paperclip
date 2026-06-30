#!/usr/bin/env python3
import json
import urllib.request

BASE = 'http://127.0.0.1:3100'
COMPANY = '3ae568de-76ec-4abc-881e-8438f4f7a4c9'

def get(path):
    return json.load(urllib.request.urlopen(BASE + path, timeout=30))

print('Paperclip:', get('/api/health')['status'], BASE)
print('Company:', COMPANY)
for name, path in [('Agents','agents'), ('Projects','projects'), ('Goals','goals'), ('Tasks','issues')]:
    rows = get(f'/api/companies/{COMPANY}/{path}')
    print(f'\n{name}: {len(rows)}')
    for row in rows:
        label = row.get('identifier') or ''
        title = row.get('name') or row.get('title')
        status = row.get('status') or ''
        role = row.get('role') or ''
        print(' -', label, title, status, role)
