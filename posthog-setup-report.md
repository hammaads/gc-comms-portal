# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into the Grand Citizens Iftaar Drive Management platform. Here's a summary of all changes made:

**Infrastructure:**
- Installed `posthog-js` (client-side) and `posthog-node` (server-side) packages via npm
- Added PostHog init to `instrumentation-client.ts` alongside the existing Sentry init, using the `defaults: "2026-01-30"` preset and `capture_exceptions: true` for automatic error tracking
- Created `lib/posthog-server.ts` — a singleton server-side PostHog client used by API routes
- Added `/ingest` reverse proxy rewrites to `next.config.ts` to route PostHog requests through Next.js (bypasses ad blockers), with `skipTrailingSlashRedirect: true`
- Set `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `.env.local`

**Event tracking (13 events across 9 files):** Users are identified via `posthog.identify()` on login, and server-side events carry the authenticated user's email as `distinctId` for cross-domain correlation.

| Event | Description | File |
|---|---|---|
| `admin_logged_in` | Admin successfully logs in via email+password; triggers `identify()` | `components/login-form.tsx` |
| `admin_login_failed` | Admin login attempt fails; records error message | `components/login-form.tsx` |
| `drive_created` | A new iftaar drive is created; records date, daig count, volunteer target, status, and whether a map location was set | `app/(dashboard)/drives/new/page.tsx` |
| `drive_status_changed` | Drive status transitions (e.g. draft → open → completed); records from/to status and drive ID | `app/(dashboard)/drives/[id]/drive-status-control.tsx` |
| `drive_deleted` | A drive is deleted; records drive name, status at time of deletion, and assignment count | `app/(dashboard)/drives/[id]/page.tsx` |
| `auto_assign_triggered` | Auto-assign is run from the Duty Board; records drive ID and volunteer count assigned | `app/(dashboard)/drives/[id]/assignments/page.tsx` |
| `volunteer_manually_added_to_drive` | A volunteer is added to a drive from the Duty Board; records mode (existing/new) and assignment status | `app/(dashboard)/drives/[id]/assignments/page.tsx` |
| `volunteer_reassigned_via_drag` | A volunteer is dragged between duty columns on the Duty Board; records from/to duty IDs | `app/(dashboard)/drives/[id]/assignments/page.tsx` |
| `volunteer_added_to_system` | A coordinator manually adds a volunteer via the admin form; records gender, source, and org presence | `app/(dashboard)/volunteers/new/page.tsx` |
| `public_volunteer_registered` | A volunteer self-registers via the public sign-up form (server-side); records gender, drive count, and assignments count | `app/api/public/volunteer-register/route.ts` |
| `batch_auto_assign_completed` | Batch auto-assign API completes; records drive ID, total assigned, newly assigned, and promoted from waitlist counts | `app/api/assignments/batch/route.ts` |
| `manual_assignment_completed` | Manual assignment API completes; records drive ID, volunteer ID, mode, assignment status, and duty name | `app/api/assignments/manual/route.ts` |
| `ai_calls_triggered` | AI calling is triggered for a batch of volunteers; records drive ID, volunteer count, and provider | `app/api/calls/trigger/route.ts` |

## Next steps

We've built a pinned **Analytics basics** dashboard and 5 insights to track the most important user behaviours from day one:

- 📊 **Dashboard:** [Analytics basics](https://us.posthog.com/project/275173/dashboard/1293377)
- 📈 [Volunteer Registrations Over Time](https://us.posthog.com/project/275173/insights/A2kNSxzd) — Daily public sign-ups vs manual additions
- 🔄 [Drive Lifecycle: Status Changes](https://us.posthog.com/project/275173/insights/QdPjHmAX) — Drive creation, status transitions, and deletions over time
- 📊 [Assignment Methods: Auto vs Manual](https://us.posthog.com/project/275173/insights/4EPOqzv8) — Compares auto-assign runs vs manual Duty Board operations
- 🎯 [Volunteer Registration Funnel](https://us.posthog.com/project/275173/insights/kRkNyANJ) — Conversion from page view to completed sign-up on the public form
- 🔐 [Admin Login Success vs Failure](https://us.posthog.com/project/275173/insights/zOjQHlZd) — Login health and security anomaly detection

### Agent skill

We've left an agent skill folder in your project at `.claude/skills/posthog-integration-nextjs-app-router/`. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
