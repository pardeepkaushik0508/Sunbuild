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

### Demo logins (password for all: `Password123!`)

| Role | Email |
|------|-------|
| Owner | owner@sunview.homes |
| CEO | ceo@sunview.homes |
| Ops Admin | admin@sunview.homes |
| Sales | sales@sunview.homes |
| Project Manager | pm@sunview.homes |
| Bookkeeper | books@sunview.homes |
| Subcontractor | sub@sunview.homes |
| Client | client@example.com |

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
