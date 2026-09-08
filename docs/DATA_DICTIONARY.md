# Data Dictionary (MVP)

| Entity | Purpose |
|--------|---------|
| Company | Builder brand (Sunview seeded) |
| User / Membership | Identity + company role + flags |
| ProjectAccess | Project-scoped membership |
| Lead / LeadActivity | Simple sales pipeline |
| Buyer | Homeowner/client record |
| Project | Build job |
| PurchaseContract | Uploaded PDF + manually reviewed fields |
| Deposit / Condition | Contract-derived tracking |
| Task | Assignable work items |
| Milestone / ScheduleItem | Timeline / Gantt |
| SelectionPackage / Section / Item / Approval | Digital selections |
| ChangeOrder | Scope/price changes |
| RFI | Requests for information |
| DailyLog | Field daily records |
| Document | Versioned files |
| Photo | Media with visibility |
| Invoice | Bookkeeper uploads |
| CompletionDocument | CEO approval gate |
| WarrantyTicket | Post-handover service |
| AuditLog | Important action history |

Statuses are defined as Prisma enums in `prisma/schema.prisma`.
