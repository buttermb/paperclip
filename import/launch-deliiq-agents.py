#!/usr/bin/env python3
import json
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:3100'
COMPANY = '3ae568de-76ec-4abc-881e-8438f4f7a4c9'
ASSIGN = {
    'DEL-1': '7d508d1f-267e-4426-a843-9842e80948b2',
    'DEL-2': '8453a714-c14b-4f42-8bd5-807ec970d0a4',
    'DEL-3': 'c1f2ee16-8a09-47af-a327-2bc329301a64',
    'DEL-4': 'ffc5b417-ba64-4ac7-afa2-12edf6d31248',
}

def req(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if payload is not None:
        r.add_header('Content-Type', 'application/json')
    with urllib.request.urlopen(r, timeout=60) as resp:
        body = resp.read().decode()
        return json.loads(body) if body else None

# Unpause all agents.
for agent in req('GET', f'/api/companies/{COMPANY}/agents'):
    updated = req('PATCH', f'/api/agents/{agent["id"]}', {'status': 'idle'})
    print('agent', updated['name'], '->', updated['status'])

# Move bootstrap tasks to todo with intended assignees.
for issue in req('GET', f'/api/companies/{COMPANY}/issues'):
    assignee = ASSIGN.get(issue['identifier'], issue.get('assigneeAgentId'))
    updated = req('PATCH', f'/api/issues/{issue["id"]}', {
        'status': 'todo',
        'assigneeAgentId': assignee,
        'blockedByIssueIds': [],
        'comment': 'Full setup launch: agents unpaused and bootstrap task moved to todo for execution.'
    })
    print('task', updated['identifier'], '->', updated['status'])

print('Launched. Open http://127.0.0.1:3100')
