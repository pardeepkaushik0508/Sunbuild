# Sunbuild CRM

Production-oriented MVP for **Sunview Homes** custom-home construction management.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Prisma + SQLite (local). Switch to PostgreSQL for production.
- Better Auth (email/password)
- Local file uploads in `/uploads`

## Quick start

```bash
npm install
npx prisma db push
npm run db:seed
npm run dev
```

Open http://localhost:3000

### Demo logins — Master Test Data v2.2 (password for all: `Password123!`)

| Role | Email |
|------|-------|
| All roles (switch in profile) | justin.amaldas@gmail.com |
| Owner | sunny@sunviewhomes.ca |
| CEO | anjali@sunviewhomes.ca |
| Ops Admin | dale@sunviewhomes.ca |
| Sales | gary@sunviewhomes.ca |
| Project Manager (SV-1001) | michael@sunviewhomes.ca |
| Project Manager (SV-1002/1003) | elena@sunviewhomes.ca |
| Bookkeeper | sjenkins@sunviewhomes.ca |
| Selections / Warranty | robyn@sunviewhomes.ca |
| Client — Thompson (SV-1001) | thompson.household@example.ca |
| Client — Chen (SV-1002) | d.chen@example.ca |
| Client — Patel (SV-1003) | patel.household@example.ca |
| Client — Jenkins (SV-1004) | e.jenkins@example.ca |
| Sub — Framing (SV-1001 only) | dev@bowriverframing.ca |
| Sub — Cabinetry (SV-1001+1002) | lucia@bowvalleycabinets.ca |

## Docs

- [PROJECT_REQUIREMENTS.md](docs/PROJECT_REQUIREMENTS.md)
- [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md)
- [ROLE_PERMISSIONS.md](docs/ROLE_PERMISSIONS.md)
- [FIGMA_SCREEN_INVENTORY.md](docs/FIGMA_SCREEN_INVENTORY.md)

## MVP highlights

- Manual Purchase Contract upload + review → project init
- Role-based dashboards and server-side project isolation
- Selections, Change Orders, RFIs, Daily Logs, Documents, Photos
- Photo rule: subcontractor uploads stay INTERNAL until PM publishes
- Bookkeeper invoice upload; client can view own invoices
- CEO completion approval → handover + warranty
- Client warranty tickets

## Production notes

1. Set strong `BETTER_AUTH_SECRET`
2. Change Prisma datasource to `postgresql` and set `DATABASE_URL`
3. Replace local uploads with S3/R2 behind `src/lib/storage.ts`
