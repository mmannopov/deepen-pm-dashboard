# Deepen PM Hub

Standalone PM control center for Deepen ERP and Deepen Well.

## Automatic monitoring
- Pulls the Deepen ClickUp Workspace hierarchy automatically.
- Collects primary/parent tasks only (subtasks=false).
- Refreshes every 15 minutes through GitHub Actions.
- Calculates active/completed/overdue/stale tasks, workload, status distribution and potential queue signals.
- Dashboard is available in Uzbek, Russian and English.
- ClickUp token is never exposed to the browser; it is stored as a GitHub Actions repository secret.

## Required secret
In Settings → Secrets and variables → Actions → New repository secret create:
- Name: CLICKUP_API_TOKEN
- Value: your ClickUp Personal API Token (starts with pk_).

## Short domain
Recommended company URL: pm.deepen.uz

In Settings → Pages → Custom domain, enter pm.deepen.uz.
At the DNS provider create:
- Type: CNAME
- Name: pm
- Target: mmannopov.github.io

## Data methodology
1 Primary/Parent Task = 1 reporting unit.
Subtasks are excluded from Sprint KPIs.
A large status queue is shown as a potential bottleneck signal only; task count alone does not prove a bottleneck.

## Architecture
ClickUp → GitHub Actions sync → data.json → GitHub Pages dashboard.
