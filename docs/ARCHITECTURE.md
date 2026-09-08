# Architecture

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS (Sunbuild design tokens)
- Prisma ORM
- SQLite for local MVP (`DATABASE_URL=file:./dev.db`); switch provider to `postgresql` for production
- Better Auth (email/password sessions)
- Local filesystem uploads via `UPLOAD_DIR` (S3-compatible swap later)
- Zod validation
- Server Actions + route handlers for mutations

## Folder layout

```
src/
  app/                 # routes by role
  components/          # UI shell + primitives + feature UI
  lib/                 # db, auth, session, permissions, storage, audit
prisma/                # schema + seed
docs/                  # requirements & dictionaries
uploads/               # local file storage (gitignored)
```

## Auth & authorization

1. Better Auth issues session cookies
2. `requireSession` / `requireRole` load memberships
3. `getAccessibleProjectIds` / `assertProjectAccess` enforce project isolation
4. Finance: Owner + Bookkeeper; CEO operational only (no finance)

## Photo visibility

`Photo.visibility`: `INTERNAL` | `CLIENT_VISIBLE`. Subcontractor uploads → INTERNAL. PM publish → CLIENT_VISIBLE.
