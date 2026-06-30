# Deli IQ / 142 + POS Paperclip integration

This folder captures the local Paperclip setup for Alex's Deli IQ operating room.

## What is integrated

- Paperclip company: `Deli IQ / 142 + POS`
- Company ID: `3ae568de-76ec-4abc-881e-8438f4f7a4c9`
- Repos:
  - `/Users/alex/142-deli` — management hub, owner/admin/super-admin, activation, pairing, billing, reporting.
  - `/Users/alex/pos` — cashier/register runtime, tender/card terminal, Datacap/PAX, offline/outbox, receipts, customer display.
- Context seed:
  - `deliiq-142-pos-context.md` — compact operating context from repo docs, Hermes memory, and relevant sessions.
  - `deliiq-142-pos-conversations.jsonl` — fuller export of 60 relevant Hermes sessions for raw replay.

## Agents

- Alex CEO — CEO / product owner (`hermes_local`)
- Deli IQ CTO — architecture / engineering lead (`codex_local`)
- 142 Management Engineer — `/Users/alex/142-deli` implementation (`codex_local`)
- POS Runtime Engineer — `/Users/alex/pos` implementation (`codex_local`)
- Release QA — cross-repo release gate / e2e QA (`codex_local`)

## Commands

From `/Users/alex/paperclip`:

```sh
pnpm deliiq:start   # start Paperclip local dev server
pnpm deliiq:status  # print company/agent/project/task status
pnpm deliiq:setup   # idempotently create/update company, agents, goals, projects, bootstrap tasks
pnpm deliiq:launch  # unpause agents and move bootstrap tasks to todo
```

The setup is local-only and uses the Paperclip API at `http://127.0.0.1:3100`.

## Current verified state at setup time

- Paperclip health: ok
- UI: http://127.0.0.1:3100
- 5 agents enabled
- 3 projects
- 3 goals
- 4 bootstrap tasks completed

## Safety notes

- No git push is performed by these scripts.
- Agents are configured with local repo paths and should respect each repo's `AGENTS.md`.
- The context export may contain sensitive local conversation content; keep this folder private.
