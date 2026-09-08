# Figma Screen Inventory → Routes

Source file: `o9aJzEgFusOwVJRpaOFFXZ`  
Node-level checklist: [FIGMA_NODE_INVENTORY.md](./FIGMA_NODE_INVENTORY.md)

| Figma screen | Route | Role | Visual pass |
|--------------|-------|------|-------------|
| Organization Management / Overview | `/owner` | Owner | Charts + insights |
| Internal Alerts | `/owner/alerts` | Owner | Shared shell/tokens |
| Jobs Management | `/owner/jobs` | Owner/CEO/Admin | Shared table/shell |
| Permissions | `/owner/permissions` | Owner | Shared shell/tokens |
| Settings | `/owner/settings` | Owner/Admin | Shared shell/tokens |
| CEO Overview | `/ceo` | CEO | Charts |
| CEO Approvals (new) | `/ceo/approvals` | CEO | Shared shell/tokens |
| Sales Manager Overview / Leads | `/sales`, `/sales/leads` | Sales | Charts + tables |
| PM Dashboard | `/pm` | PM | Gantt + charts + insights |
| Project Man To-Dos | `/pm/tasks` | PM | Shared table/shell |
| Daily Logs | `/pm/daily-logs` | PM | Shared table/shell |
| RFIs | `/pm/rfis` | PM | Shared table/shell |
| Change Orders | `/pm/change-orders` | PM | Shared table/shell |
| Selections | `/pm/selections` | PM | Shared table/shell |
| Schedule | `/pm/schedule` | PM | Full Gantt + Client Info + Insights |
| Job Info / Project detail | `/pm/projects/[id]` | PM | Gantt + Client Info + Insights |
| Contracts review (new) | `/pm/contracts` | PM/Owner | Shared table/shell |
| Bookkeeper Dashboard / Invoices | `/bookkeeper`, `/bookkeeper/invoices` | Bookkeeper | Charts + insights |
| Subcontractor Dashboard | `/sub` | Sub | Charts |
| Client Overview | `/client` | Client | Shared shell/tokens |
| Your Selections | `/client/selections` | Client | Shared shell/tokens |
| Client COs / Invoices / Docs / Photos / Schedule | `/client/*` | Client | Schedule uses full Gantt |
| Warranty (new, design system) | `/client/warranty`, `/pm/warranty` | Client/PM | Shared shell/tokens |
| Ops Admin Overview | `/admin` | Admin | Charts |

Login / invite / reset use shared auth screens outside the shell.

## Design system updates (2026-09)

- Tokens: `src/app/globals.css` (`--sb-gantt-*`, insights colors)
- Shell: `src/components/layout/app-shell.tsx`
- Gantt: `src/components/schedule/gantt-chart.tsx` (Day/Week/Month, deps, legend)
- Charts: `src/components/dashboard/charts.tsx` (Recharts)
- Client strip: `src/components/dashboard/client-info-strip.tsx`
- Insights: `src/components/dashboard/ai-insights.tsx` (rule-based)

**Note:** Figma MCP was rate-limited on Starter during build; pixel QA against live Figma screenshots should be re-run after Pro upgrade.
