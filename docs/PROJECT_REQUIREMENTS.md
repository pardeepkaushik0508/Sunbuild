# Sunbuild CRM — MVP Project Requirements

Source: Client requirements document (Sunbuild Personal Pardeep) + confirmed MVP clarifications.

## Product

Sunbuild is a cloud construction CRM for custom homes. **MVP scope: Sunview Homes only**, with `companyId` architecture ready for Aspen Living and Brilliance Homes later.

## Non-negotiables

- Figma is UI/UX source of truth
- Requirements doc is business/functional source of truth
- Every screen uses live database data (no hard-coded clients/projects)
- Server-side authorization (not UI-only)
- Manual Purchase Contract entry (no AI/OCR in MVP)
- Subcontractor photos default INTERNAL; PM publishes for CLIENT_VISIBLE
- CEO approves Contract Completed documents
- Warranty tickets after project handover (~1 year)

## Roles

Owner, CEO, Operations Admin, Sales Manager, Project Manager, Bookkeeper, Subcontractor, Client

## Core modules (MVP)

Auth, users, leads (simple), purchase contracts, projects, PM dashboard, tasks, schedule, selections, change orders, RFIs, daily logs, documents, photos, invoices (upload/view), client portal, subcontractor portal, CEO completion approval, warranty tickets.

## Explicitly out of MVP

AI, Aspen/Brilliance rollout UI, QuickBooks, bank sync, Google Calendar, Microsoft To Do/Teams, payment gateway, lead scoring, email marketing, historical migration, internal chat.
