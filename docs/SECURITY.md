# SUNBUILD Security Notes

This document summarizes the security model implemented in the CRM and remaining
provider/environment steps for production.

## Authorization model

Every protected mutation follows:

1. Authenticate session (Better Auth)
2. Load active user + company membership from the database (never from the client)
3. Resolve role/permissions from membership
4. Assert company + project object access
5. Validate input (Zod / whitelist)
6. Execute business logic (transactions where multi-write)
7. Write audit log for sensitive actions
8. Return minimum necessary data

Helpers live in:

- `src/lib/session.ts` — session, project/company/lead/contract asserts
- `src/lib/authorization.ts` — capability / RBAC matrix
- `src/lib/file-access.ts` — private file ACL before download
- `src/lib/rate-limit.ts` — action / upload throttles
- `src/lib/safe-redirect.ts` — post-login redirect allowlist

## Public signup

Email/password self-registration is **disabled** (`disableSignUp: true`).
Users are invite-only via Owner / Operations Admin.

## Tests

```bash
npm run test:security
```

## Production checklist (provider/env)

- [ ] PostgreSQL (not SQLite) with automated backups
- [ ] Strong unique `BETTER_AUTH_SECRET`
- [ ] HTTPS + `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` on https
- [ ] Wire `sendResetPassword` to a real email provider
- [ ] Object storage with private buckets + signed URLs (replace local `uploads/`)
- [ ] Redis (or equivalent) rate limiting for multi-instance deploys
- [ ] MFA enabled for Owner / CEO / Ops / Bookkeeper via Better Auth plugin
- [ ] Separate staging vs production databases and storage
