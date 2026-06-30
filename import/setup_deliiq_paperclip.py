#!/usr/bin/env python3
import json
import urllib.request
import urllib.error
from pathlib import Path

BASE = "http://127.0.0.1:3100"
COMPANY_ID = "3ae568de-76ec-4abc-881e-8438f4f7a4c9"
CONTEXT = "/Users/alex/paperclip/import/deliiq-142-pos-context.md"


def req(method, path, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if payload is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, timeout=60) as resp:
            body = resp.read().decode()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise RuntimeError(f"{method} {path} -> {e.code}: {body}")


def first_by_name(items, name):
    return next((x for x in items if x.get("name") == name), None)


def create_or_get_agent(name, role, title, icon, capabilities, adapter_type, adapter_config, reports_to=None, permissions=None, runtime=None):
    existing = first_by_name(req("GET", f"/api/companies/{COMPANY_ID}/agents"), name)
    if existing:
        return existing
    instructions = f"""# {name} — Deli IQ Paperclip Agent

You work inside the Deli IQ / 142 + POS company.

Before acting, read:
- {CONTEXT}
- /Users/alex/142-deli/AGENTS.md when touching management/admin surfaces
- /Users/alex/pos/AGENTS.md when touching POS/register/runtime/hardware surfaces

Respect repo boundaries:
- /Users/alex/142-deli = owner tracker + admin/super-admin + management functions/migrations.
- /Users/alex/pos = cashier/register runtime + tender/card/terminal + offline/outbox + receipts/customer display.

Do concrete work, verify with real commands/tests, leave clean handoff notes, and never push unless Alex explicitly asks.
"""
    payload = {
        "name": name,
        "role": role,
        "title": title,
        "icon": icon,
        "reportsTo": reports_to,
        "capabilities": capabilities,
        "adapterType": adapter_type,
        "adapterConfig": adapter_config,
        "instructionsBundle": {"files": {"AGENTS.md": instructions}},
        "runtimeConfig": runtime or {"heartbeat": {"enabled": False, "wakeOnDemand": True}},
        "budgetMonthlyCents": 5000,
        "permissions": permissions or {"canCreateAgents": False, "canCreateSkills": True},
        "metadata": {"contextSeedPath": CONTEXT, "repos": ["/Users/alex/142-deli", "/Users/alex/pos"]},
    }
    return req("POST", f"/api/companies/{COMPANY_ID}/agents", payload)


def create_or_get_goal(title, description, level="company", parent_id=None, owner=None):
    existing = next((g for g in req("GET", f"/api/companies/{COMPANY_ID}/goals") if g.get("title") == title), None)
    if existing:
        return existing
    return req("POST", f"/api/companies/{COMPANY_ID}/goals", {"title": title, "description": description, "level": level, "status": "active", "parentId": parent_id, "ownerAgentId": owner})


def create_or_get_project(name, description, cwd, lead, goal_ids, icon):
    existing = first_by_name(req("GET", f"/api/companies/{COMPANY_ID}/projects"), name)
    if existing:
        return existing
    return req("POST", f"/api/companies/{COMPANY_ID}/projects", {
        "name": name,
        "description": description,
        "status": "in_progress",
        "leadAgentId": lead,
        "goalIds": goal_ids,
        "icon": icon,
        "workspace": {"name": f"{name} local workspace", "sourceType": "local_path", "cwd": cwd, "isPrimary": True},
        "executionWorkspacePolicy": {
            "enabled": True,
            "defaultMode": "shared_workspace",
            "allowIssueOverride": True,
            "workspaceStrategy": {"type": "project_primary"},
        },
    })


def create_issue(title, description, project_id, goal_id, assignee, priority="high"):
    issues = req("GET", f"/api/companies/{COMPANY_ID}/issues")
    if any(i.get("title") == title for i in issues):
        return next(i for i in issues if i.get("title") == title)
    return req("POST", f"/api/companies/{COMPANY_ID}/issues", {
        "title": title,
        "description": description,
        "projectId": project_id,
        "goalId": goal_id,
        "assigneeAgentId": assignee,
        "priority": priority,
        "status": "todo",
        "workMode": "standard",
    })


def main():
    assert Path(CONTEXT).exists(), CONTEXT
    hermes_cfg = {"persistSession": True, "toolsets": "terminal,file,web,session_search,skills,delegation,todo", "timeoutSec": 600, "hermesCommand": "/Users/alex/.local/bin/hermes", "extraArgs": ["--yolo"]}
    codex_cfg_142 = {"cwd": "/Users/alex/142-deli", "model": "gpt-5.5", "modelReasoningEffort": "high", "fastMode": True, "dangerouslyBypassApprovalsAndSandbox": True, "timeoutSec": 900}
    codex_cfg_pos = {"cwd": "/Users/alex/pos", "model": "gpt-5.5", "modelReasoningEffort": "high", "fastMode": True, "dangerouslyBypassApprovalsAndSandbox": True, "timeoutSec": 900}

    ceo = create_or_get_agent("Alex CEO", "ceo", "Chief Executive / Product Owner", "crown", "Owns Deli IQ product direction, priorities, repo-boundary decisions, certification/commercial tradeoffs, and task decomposition across management + POS.", "hermes_local", hermes_cfg, None, {"canCreateAgents": True, "canCreateSkills": True})
    cto = create_or_get_agent("Deli IQ CTO", "cto", "Technical Lead", "circuit-board", "Owns architecture across Supabase, 142-deli, POS, CI/testing, release gates, and engineering task routing.", "codex_local", {**codex_cfg_pos, "cwd": "/Users/alex"}, ceo["id"], {"canCreateAgents": True, "canCreateSkills": True})
    mgmt = create_or_get_agent("142 Management Engineer", "engineer", "142-deli Admin/Management Engineer", "globe", "Implements owner tracker, admin/super-admin, tenant activation, billing, management Supabase functions, and launch-day owner workflows.", "codex_local", codex_cfg_142, cto["id"])
    pos = create_or_get_agent("POS Runtime Engineer", "engineer", "POS Register / Hardware Engineer", "terminal", "Implements cashier register, tender/card terminal flows, Datacap/PAX, offline/outbox sync, receipts, native Android/Capacitor and customer display.", "codex_local", codex_cfg_pos, cto["id"])
    qa = create_or_get_agent("Release QA", "qa", "Release Gate / E2E QA", "shield", "Verifies 142 + POS changes with targeted tests, smoke/e2e runs, release gates, evidence capture, and regression risk reports.", "codex_local", {**codex_cfg_pos, "cwd": "/Users/alex"}, cto["id"])

    g_company = create_or_get_goal("Ship Deli IQ 142 + POS to reliable pilot", "Make Deli IQ production-ready for 142 Deli with management hub, POS runtime, live sync, payment terminal readiness, admin/super-admin controls, and clear release gates.", "company", None, ceo["id"])
    g_terminal = create_or_get_goal("Certify first POS payment terminal path", "Drive Datacap/PAX A30/A920Pro first-cert path with card/tap/swipe/PIN/EBT, dual pricing, and compliance guardrails.", "team", g_company["id"], pos["id"])
    g_admin = create_or_get_goal("Make 142 management/admin launch-ready", "Harden owner/admin/super-admin workflows: signup, tenant activation, billing, catalog, shifts, reporting, hardware pairing, and launch runbook.", "team", g_company["id"], mgmt["id"])

    p_overall = create_or_get_project("Deli IQ CEO Operating Room", "CEO-level operating room seeded with Hermes conversation context at " + CONTEXT, "/Users/alex/142-deli", ceo["id"], [g_company["id"]], "target")
    p_142 = create_or_get_project("142-deli Management Hub", "Owner tracker + React admin/super-admin + management functions. Start with /Users/alex/142-deli/AGENTS.md and context seed.", "/Users/alex/142-deli", mgmt["id"], [g_admin["id"]], "globe")
    p_pos = create_or_get_project("Deli IQ POS Runtime", "Cashier/register runtime + Datacap/PAX + Android/Capacitor + offline/outbox. Start with /Users/alex/pos/AGENTS.md and context seed.", "/Users/alex/pos", pos["id"], [g_terminal["id"]], "terminal")

    create_issue("CEO: read full Deli IQ context seed and produce operating priorities", f"Read `{CONTEXT}`, `/Users/alex/142-deli/AGENTS.md`, `/Users/alex/pos/AGENTS.md`, and current project docs. Produce a concise priority map: launch blockers, repo ownership, terminal certification path, and next tasks. Do not code.", p_overall["id"], g_company["id"], ceo["id"], "critical")
    create_issue("142: audit management/admin launch blockers from seeded context", f"Read `{CONTEXT}` and `/Users/alex/142-deli/AGENTS.md`. Audit the current management/admin state and list concrete launch blockers with file/test references.", p_142["id"], g_admin["id"], mgmt["id"], "high")
    create_issue("POS: audit terminal/payment and native register launch blockers", f"Read `{CONTEXT}`, `/Users/alex/pos/AGENTS.md`, Datacap/PAX runbooks, and POS plans. Identify concrete blockers for PAX A30/A920Pro + dual pricing + EBT/PIN debit + native register reliability.", p_pos["id"], g_terminal["id"], pos["id"], "critical")
    create_issue("QA: define release gate matrix for 142 + POS pilot", f"Read `{CONTEXT}` and both repo AGENTS files. Define targeted verification commands and manual smoke gates for management hub, POS runtime, sync, and payment terminal readiness.", p_overall["id"], g_company["id"], qa["id"], "high")

    print(json.dumps({"companyId": COMPANY_ID, "agents": {"ceo": ceo["id"], "cto": cto["id"], "management": mgmt["id"], "pos": pos["id"], "qa": qa["id"]}, "goals": [g_company["id"], g_terminal["id"], g_admin["id"]], "projects": [p_overall["id"], p_142["id"], p_pos["id"]]}, indent=2))

if __name__ == "__main__":
    main()
