# Figma Node → Route Inventory

File: `o9aJzEgFusOwVJRpaOFFXZ`  
Access note: Starter MCP rate-limited at implementation start; mapping from linked URLs + design screenshot refs. Re-verify with MCP after Pro upgrade.

## Batch A (project / schedule / dashboard)

| Node | Likely screen | Route | Status |
|------|---------------|-------|--------|
| 1:3397 | Frame / chrome | shell | Done |
| 1:3398 | Frame variant | shell | Done |
| 1:3399 | PM / schedule cluster | `/pm/schedule` | Done |
| 1:3844 | Gantt / timeline | `/pm/schedule` | Done |
| 1:4465 | Gantt + Client Info + AI Insights | `/pm/schedule`, `/pm/projects/[id]` | Done |

## Batch B (role screens — unique nodes)

| Node | Mapped route (primary) | Status |
|------|------------------------|--------|
| 4:1660 | `/owner` | Done (charts + insights) |
| 4:2110 | `/owner/jobs` | Done (shared visual system) |
| 4:2328 | `/owner/alerts` | Done (shared visual system) |
| 4:2581 | `/owner/permissions` | Done (shared visual system) |
| 4:2769 | `/owner/settings` | Done (shared visual system) |
| 4:3717 | `/owner/users` | Done (shared visual system) |
| 4:5583 | `/ceo` | Done (charts) |
| 4:6679 | `/ceo/approvals` | Done (shared visual system) |
| 4:7282 | `/sales` | Done (charts) |
| 4:7878 | `/sales/leads` | Done (tables) |
| 4:8474 | `/sales/leads/[id]` | Done (shared visual system) |
| 4:9037 | `/pm` | Done (Gantt + charts + insights) |
| 4:9602 | `/pm/projects` | Done (shared visual system) |
| 4:10194 | `/pm/projects/[id]` | Done |
| 4:10807 | `/pm/tasks` | Done (shared visual system) |
| 4:11490 | `/pm/schedule` | Done |
| 4:12077 | `/pm/daily-logs` | Done (shared visual system) |
| 4:12664 | `/pm/rfis` | Done (shared visual system) |
| 4:12857 | `/pm/change-orders` | Done (shared visual system) |
| 4:13474 | `/pm/selections` | Done (shared visual system) |
| 4:14088 | `/pm/documents` | Done (shared visual system) |
| 4:14701 | `/pm/photos` | Done (shared visual system) |
| 4:15314 | `/pm/contracts` | Done (shared visual system) |
| 4:15877 | `/pm/warranty` | Done (shared visual system) |
| 4:16661 | `/bookkeeper` | Done (charts + insights) |
| 4:18192 | `/bookkeeper/invoices` | Done (tables) |
| 4:18839 | `/sub` | Done (charts) |
| 4:19579 | `/client` | Done (shared visual system) |
| 4:20363 | `/client/selections` | Done (shared visual system) |
| 4:21047 | `/client/schedule` | Done (full Gantt) |
| 4:21723 | `/client/change-orders` | Done (shared visual system) |
| 4:22398 | `/client/documents` | Done (shared visual system) |
| 4:23040 | `/client/photos` | Done (shared visual system) |
| 4:23689 | `/client/invoices` | Done (shared visual system) |
| 4:24303 | `/client/warranty` | Done (shared visual system) |
| 4:24951 | `/admin` | Done (charts) |
| 4:25540 | Auth / shared | `/login` | Shared auth |
| 4:26103 | `/pm/contracts/new` | Done (shared visual system) |
| 4:26700 | Detail variants | module detail | Shared primitives |
| 4:27633 | Detail variants | module detail | Shared primitives |
| 4:28210 | Detail variants | module detail | Shared primitives |
| 4:28789 | Detail variants | module detail | Shared primitives |
| 4:29425 | Warranty detail | `/client/warranty/[id]` | Shared primitives |
| 4:30263 | Sub job detail | `/sub/jobs/[id]` | Shared primitives |
| 4:30481 | Contract detail | `/pm/contracts/[id]` | Shared primitives |
| 4:30727 | Selection detail | `/pm/selections/[id]` | Shared primitives |
| 4:30864 | Forms / modals | shared | Shared form primitives |
| 4:31023 | Tables / lists | shared | DataTable updated |
| 4:31936 | Charts / widgets | dashboard widgets | Done |
| 4:32235 | Insights strip | shared insights | Done |
| 4:32556 | Client info strip | shared | Done |
| 4:32771 | Status legend / progress | shared | Done (Gantt footer) |
