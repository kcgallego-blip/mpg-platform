# Attendance Management Guide

This guide explains how the attendance workspace works, how schedules and shift dates are resolved, how to test the feature, and which database migration must be applied.

## What this feature does

The existing `/attendance` page is the single attendance workspace.

### Agent access

Users with the `Agent` role see only their own monthly attendance calendar. Each calendar date combines the agent's actual attendance with the schedule that was effective on that date.

Possible calendar statuses are:

- Scheduled
- Currently Working
- Complete
- Missing Time In
- Missing Time Out
- No attendance record
- Awaiting Time In
- Absence Confirmation Required
- Not Absent - Missing Attendance
- Day Off
- Holiday Off
- Vacation Leave
- Sick Leave
- Transition Off
- Absent (manager-confirmed only)
- RDOT - Currently Working
- RDOT - Complete
- RDOT - Missing Time In
- RDOT - Missing Time Out

The attendance system does not automatically finalize an agent as `Absent`. After the scheduled start plus the one-hour grace period, a no-clock shift becomes `Absence Confirmation Required`. A Team Leader or higher must explicitly confirm Absent or mark the agent Not absent. This is an audited attendance outcome, not a Date Exception.

### Management access

The following roles can manage attendance for all active roster agents:

- Admin
- Manager
- Operations Manager
- Supervisor
- Team Leader

They receive these tabs:

- **Daily Log:** Review resolved attendance and copy a tracker column.
- **Agent Calendars:** Select any active roster agent and view the same resolved monthly calendar available to that agent.
- **Import Attendance:** Paste Google Form response rows for one shift date.
- **Schedule:** Create effective-dated schedule snapshots and date exceptions.
- **Tracker Order:** Save the exact agent order used by the external Google Sheet.
- **Manual Entry:** Enter or paste Time In and Time Out values for one shift date.
- **Clocking Policy:** Mark active roster Agents as Office or WFH and see who is in the Admin pilot.

Permissions are enforced by the server routes, not only by hiding interface controls.

### Local development visibility

When the app runs through `npm run dev`, Attendance is always visible to every authenticated user with an assigned role, even when the Admin Attendance toggle is off. This makes local role testing possible without changing the saved production setting.

The override is limited to `NODE_ENV=development`. Production continues to follow the Admin toggle, and the development override does not grant attendance-management permissions to roles that do not normally have them.

## Agent self-service pilot

An Admin manages the production allowlist under **Utilities → Controls → Attendance self-service pilot**. The searchable selector supports selecting the filtered roster, clearing the list, and saving the complete enabled-Agent list. Only active roster Agents with a unique normalized email are accepted. The same section stores labeled office IPv4, IPv6, or CIDR networks and shows the most recent policy audit information.

Pilot-enabled Agents can open Attendance and self-clock even when the global Attendance route is disabled. Non-pilot Agents continue following the global toggle, and only pilot Agents see the Home clock card. If at least one pilot Agent exists, Team Leader-and-above roles retain the Attendance workspace needed for WFH policy, attendance review, and OT decisions. Admin access is always retained.

Team Leader and above use **Attendance → Clocking Policy** to mark active Agents as Office or WFH. WFH Agents may clock anywhere without an offsite warning. Office Agents outside configured CIDRs are accepted and marked `Offsite IP — Review`; a missing client IP is accepted as `Unknown IP — Review`. If no office network exists, clocks remain available and record `Network detection not configured`. Each event permanently records its network classification, server timestamp, bounded browser description, and raw IP; later policy edits do not rewrite it.

The server—not the browser—chooses the Agent, attendance date, and clock value. It preserves an unfinished Time In until the next scheduled shift starts or 24 hours pass, keeps cross-midnight Graveyard work on the previous attendance date, and gives Overnight work its actual following calendar date. A rest-day action is labeled RDOT In/RDOT Out. Holiday, leave, sick/vacation leave, and transition-off dates are protected. Every action shows a confirmation and uses a unique request ID to prevent duplicate writes. A Time In entered after confirmed absence clears that outcome atomically and records both changes in audit history.

Self-service clocks at least 120 minutes before start or after end create a pending OT review. Agents see that the result is pending. Team Leader and above approve or reject it in Daily Log. Late and undertime remain calculated without approval, and RDOT is not compared with the ordinary roster schedule.

## Shift-date rules

Date selectors use an operational business date in `America/New_York`. The date changes at 6:00 AM Eastern, so an upload at 2:00 AM on September 7 still defaults to the September 6 business shift. This automatically uses UTC−4 during daylight saving time and UTC−5 during standard time.

The manager-selected date is the authoritative **business shift date**. Normal/Graveyard agents use that calendar date. Overnight agents, whose scheduled start is after midnight, use the following calendar date. The date inside a Google Form timestamp does not independently choose the record date.

Example:

```text
Selected shift date: 2026-09-07
Form response:       9/8/2026 8:07:28 | agent@example.com | Agent Name | Time OUT | Team Leader
```

For a Normal/Graveyard agent, the displayed `08:07:28` clock is preserved under September 7. For an Overnight agent, it is preserved under September 8. Daily Log, Import Attendance, Manual Entry, conflict checks, and tracker output all apply this same cohort-aware mapping.

Times are not timezone-converted.

## How schedule history works

A schedule snapshot has an `effective_from` date but no end date.

For every agent and attendance date, the system resolves the schedule in this order:

1. An exact agent/date exception.
2. The newest full-roster snapshot where `effective_from` is on or before the attendance date.
3. Current roster values when no baseline schedule snapshot exists.

Off 1 and Off 2 accept both full weekday names and common abbreviations, including `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, and `Sun`.

Saving a newer snapshot does not edit or delete an older one. This keeps completed historical months stable.

If multiple corrections use the same effective date, the most recently created version wins. Earlier versions remain in the database for audit history.

### Full-roster snapshots and selected-agent editing

Every saved version contains the entire active Agent roster. The editor can apply a change only to selected agents, but unchanged agents are carried forward into the new full snapshot.

This means selecting September 14 for one cohort does not reset every agent. It creates a complete September 14 snapshot where only the selected agents have changed values.

### Import a CSV or Excel schedule

The Effective schedule editor accepts `.csv`, `.xls`, and `.xlsx` files. It locates the first readable sheet and recognizes either:

- Agent Name, Start Shift, End Shift, Off 1, and Off 2 columns; or
- Agent Name, a combined Shift Schedule column, and a combined Days Off column.

Other spreadsheet fields, including email, role, team leader, and comments, are ignored. If the file has no recognized off-day columns, existing Off 1 and Off 2 values remain unchanged. Team leader and shift-group values are never changed by file import.

Before choosing the file, select **All agents**, **Normal / Graveyard**, or **Overnight**. Matching and prefilling are limited to that roster group. Exact normalized name matches are automatic. Unique tokenized fuzzy matches are clearly labeled and require uploader approval; unresolved names are listed and skipped.

After reviewing the match table, click **Prefill matched schedules**. This updates shift start, shift end, Off 1, and Off 2 in the existing editor and selects the affected roster agents. It does not write to the database. Review the resulting grid, effective date, and snapshot note before clicking **Save complete snapshot**.

### Normal/Graveyard and Overnight cohorts

Each schedule entry stores one of these groups:

- `normal_graveyard`
- `overnight`

When no schedule snapshot exists yet, starts from midnight through 5:59 AM are initially inferred as Overnight. Other starts are initially Normal/Graveyard. Managers can correct the group in the schedule grid.

For a temporary schedule that covers the September 7–13 business period, use staggered snapshots when Overnight agents use the following shift date:

| Effective date | Normal/Graveyard | Overnight |
|---|---|---|
| September 7 | Temporary schedule begins | Old schedule continues |
| September 8 | Temporary schedule continues | Temporary schedule begins |
| September 14 | Regular schedule returns | Temporary schedule continues |
| September 15 | Regular schedule | Regular schedule returns |

Suggested workflow:

1. On September 7, select Normal/Graveyard, apply their temporary values, and save the complete snapshot.
2. Change the effective date to September 8.
3. Select Overnight, apply their temporary values, and save. The September 7 changes for other agents are carried forward.
4. Change the effective date to September 14, open **Recent immutable versions**, and click **Prepare revert** on the September 7 temporary version.
5. Review the automatically selected Normal/Graveyard agents and restored values, then save the complete September 14 snapshot.
6. Change the effective date to September 15 and prepare a revert from the September 8 Overnight temporary version.
7. Review the selected Overnight agents and save the complete September 15 snapshot.

Future snapshots can be created in advance when a reversion date is already known.

### Prepare revert

Prepare revert compares the selected schedule version with the version immediately before it. Only active agents whose shift start, shift end, Off 1, Off 2, or shift group changed are restored and selected in the existing editor. Other agents keep the schedule already effective on the chosen return date.

Preparing does not write to the database. The manager must review the selected rows, return effective date, and generated note before clicking **Save complete snapshot**. The first schedule version cannot be reverted because it has no prior saved snapshot; use roster defaults for that case.

## Date exceptions

Exceptions override the effective schedule for one agent on one shift date.

Supported exceptions are:

- Holiday Off
- Vacation Leave
- Sick Leave
- Transition Off
- Day Off
- One-day scheduled shift

### Holiday example

Suppose Monday, September 7 is a holiday, but the related Overnight shift uses September 8:

1. Open **Attendance → Schedule → Date exceptions**.
2. Set the holiday/base date to September 7.
3. Choose `Holiday Off`.
4. Select Normal/Graveyard agents. Their default exception date is September 7.
5. Select Overnight agents. Their default exception date is September 8.
6. Review every selected agent and date before saving.

The Overnight `+1` value is only a default. Every agent's shift date remains editable before the exceptions are saved.

### Transition Off

Transition Off is an individual agent/date decision:

1. Select the affected agent.
2. Choose the exact shift date.
3. Choose `Transition Off`.
4. Add an optional reason.
5. Save the exception.

Multiple agents may be selected, but the page warns that every Transition Off date should be reviewed individually.

An off-type exception suppresses missing-attendance warnings. Tracker output puts the exception label on the Time In row and leaves the Time Out row blank.

### Rest Day Overtime (RDOT)

A normal weekly rest day remains `Day Off` while it has no attendance. If a Time In or Time Out is saved on that date, the status automatically changes to the appropriate RDOT status. RDOT does not require a database exception and does not assume the agent followed their usual shift; the submitted clocks are preserved.

Holiday Off, Vacation Leave, Sick Leave, and Transition Off remain protected and are not automatically converted to RDOT. If an agent should work one of those dates, correct the exception or create a one-day scheduled shift first.

### Leave and confirmed absence

Team Leader and above can open **Attendance → Schedule → Date exceptions**, select one or more agents, choose the exact shift date, and assign Vacation Leave or Sick Leave. These planned statuses suppress missing-attendance warnings for that date.

Absent is managed under Import Attendance or Manual Entry. It is never created as a new Date Exception. Existing Absent exceptions are converted to audited attendance outcomes by migration 32.

Calendar colors use theme-aware semantic tokens in both agent and management views:

- Scheduled and regular attendance: normal calendar surface
- Day Off, Holiday Off, and Transition Off: gray
- RDOT: green
- Vacation Leave: blue
- Sick Leave: orange
- Confirmed Absent: red

Non-working off dates show only their status and omit empty Time In/Time Out labels. RDOT remains green and continues to display its actual clocks. Calendar clocks use 12-hour AM/PM formatting, while imported values, database values, and tracker output retain their original 24-hour wall-clock representation.

The highlighted **Current** date is agent-specific in both the personal calendar and Team Leader Agent Calendars view. Normal/Graveyard agents highlight the current business shift date. Overnight agents highlight the following `+1` calendar date, based on the schedule effective for that agent. The **Today** button opens the month containing that agent-specific marked date.

For regular scheduled shifts, the calendar also compares actual clocks with the effective schedule for that exact date:

- Approved Pre-shift OT and Post-shift OT labels are green.
- A late Time In label is yellow and shows the number of late minutes.
- An undertime Time Out label is yellow and shows the number of undertime minutes.
- When a duration exceeds 60 minutes, hovering its label shows the hours/minutes conversion and the total minute count.

RDOT does not receive late, undertime, or Pre/Post-shift OT labels because rest-day work may follow a different covered shift.

## Tracker order

The global tracker order must contain every active roster Agent exactly once.

Paste one agent name per line. Empty spreadsheet spacer rows are ignored.

Matching ignores surrounding spaces, capitalization, and punctuation. Exact names are accepted immediately. For shortened names, reordered name parts, missing middle names, or small spelling differences, the page displays ranked fuzzy roster suggestions. A Team Leader must review the suggested mapping before saving.

The complete replacement is rejected when any row is:

- Left without a confirmed roster match
- Duplicated
- Ambiguous after normalization
- Missing from the pasted order

The saved record uses the normalized roster email, so a later display-name correction does not lose that agent's position.

Attendance import, Manual Entry, and tracker output are blocked until the saved order matches the active roster.

## Pasting Google Form attendance

No Google API, Google Cloud project, card, or file upload is required. Copy response cells from Google Sheets and paste them into the app.

Accepted columns are:

```text
Timestamp | Email | Agent Name | Action | Team Leader
```

Headers are optional. Tab-separated spreadsheet cells and pipe-separated rows are accepted.

Accepted actions are `Time IN`, `Time OUT`, `OVERTIME IN`, and `OVERTIME OUT`, case-insensitively. Overtime actions use the same Time In and Time Out attendance fields because the external tracker has one pair of rows per agent.

Example:

```text
9/6/2026 8:07:28	mldevera@m-piece.com	Maria Luisa De Vera	Time OUT	Charlene Esparza
```

Import workflow:

1. Confirm the selected Eastern shift date.
2. Paste only responses belonging to that shift date.
3. Select **Preview attendance**.
4. Review matched names, missing pairs, duplicates, possible incorrect tags, overtime candidates, and existing-value conflicts.
5. Approve any fuzzy name fallback, possible incorrect-tag interpretation, or overtime decision, then refresh the preview.
6. Existing values remain selected by default.
7. Choose **Replace explicitly** only for a field that should be overwritten.
8. Save the accepted rows.

Agents are matched by normalized email first. If a valid pasted email is not in the roster, the importer ranks tokenized fuzzy matches using the pasted agent name. It never applies that fallback silently: the uploader must select and approve the roster agent before saving. Invalid email syntax remains a malformed-row error. A pasted-name difference produces a warning, while the roster name is used for display and tracker output.

If the submitted email belongs to one roster agent but the name strongly matches another, the import is blocked for identity review. The uploader may choose either candidate, select another roster agent, or reject those pasted rows. The review displays:

- Exact-email evidence
- Tokenized name-match score
- Team-leader match or mismatch
- Effective schedule or off status for the selected shift date
- Distance from the scheduled Time In or Time Out

Schedule and time proximity are context only. They never choose an identity automatically because temporary schedules, shift coverage, and RDOT can legitimately differ from the normal roster schedule. A scheduled Day Off is shown as `possible RDOT`, not as a disqualifying mismatch.

Duplicate actions are reduced consistently: the latest Time In is selected, and the earliest Time Out is selected. This also applies when regular and overtime labels are mixed.

When an agent has multiple submissions of only one action and the earliest and latest are at least 120 minutes apart, the importer marks them as a possible incorrect tag. The uploader must approve one of two choices:

- **Real duplicates:** keep the normal duplicate rule.
- **Incorrect tags:** reinterpret the earlier submission as Time In and the later submission as Time Out.

This time-range check is a review aid, not an automatic correction. Closely spaced duplicate submissions are treated as ordinary duplicate clicks and do not require an incorrect-tag decision.

### Pre-shift and Post-shift overtime

On a regular scheduled day, the importer compares the selected clocks with the schedule effective for that agent and calendar date. A Time In at least 120 minutes before scheduled start becomes a **possible Pre-shift OT** review. A Time Out at least 120 minutes after scheduled end becomes a **possible Post-shift OT** review. Cross-midnight Graveyard schedules and the `+1` calendar date for Overnight agents are included in this calculation.

The uploader must explicitly choose one of these options for every candidate:

- **Confirm Pre/Post-shift OT:** save the approval and show the green calendar label.
- **Not OT:** retain the clock but do not label it as overtime.

The threshold only opens a review; it never confirms overtime automatically. Early arrivals and late departures below 120 minutes remain ordinary clocks. Late Time In and undertime Time Out minute counts are calculated independently and do not require approval.

### One-hour Time In grace and absence confirmation

The server compares its current Eastern wall clock with each agent's effective scheduled start on the selected business shift:

- Before scheduled start: `Scheduled`
- During the first 60 minutes after scheduled start: `Awaiting Time In`
- At 60 minutes after scheduled start with no attendance: `Absence Confirmation Required`

Import Attendance lists agents in the last group even when they were not present in the pasted rows. The uploader must choose **Confirm Absent** or **Not absent — keep attendance pending** before committing the import. Agents with pasted Time In or Time Out are excluded from absence confirmation.

The calculation follows the shift-date timeline across midnight. For example, at 2:00 AM September 7, a September 6 shift scheduled for 10:00 PM is four hours beyond its start and requires confirmation. The business-date selector still defaults to September 6 until the 6:00 AM Eastern rollover.

The database checks each row again at commit time. If another manager changed attendance after the preview, the entire operation is rolled back and the manager must preview again.

## Tracker output

Daily Log generates one plain-text vertical column in saved tracker order.

Each agent always occupies two rows:

1. Time In
2. Time Out

For Day Off, Holiday Off, Vacation Leave, Sick Leave, Transition Off, or confirmed Absent, the first row contains the status and the second row is blank. RDOT outputs its actual Time In and Time Out values. Missing attendance remains blank and is identified by the Daily Log status.

Use **Copy tracker column**, then paste into a single date column in Google Sheets.

## Manual entry and September 2026 backfill

Manual Entry uses the same validation, concurrency checking, and audit path as Form imports.

Changing a clock manually clears the stale overtime decision attached to that field and recalculates it. A corrected regular-shift clock at least 120 minutes outside the schedule becomes pending management review; a smaller variance becomes `not_required`. Unchanged clock fields keep their existing decision. Import Attendance stores the uploader's explicit Confirm OT or Not OT decision as approved or rejected.

The **Attendance outcome** column allows a manager to select Confirm Absent, Not absent, or No decision. Confirmed Absent is rejected when a Time In or Time Out is present. Planned off and leave dates remain controlled by Date Exceptions, while Day Off attendance remains available for RDOT entry.

To backfill September 1–6, 2026:

1. Save the global tracker order.
2. Select September 1.
3. Paste Time In and Time Out as two columns, or edit individual cells.
4. Save changed agents.
5. Repeat one date at a time through September 6.
6. Verify representative Agent accounts after every date.

Day Off rows remain editable so managers can enter RDOT. Once attendance is saved, the resolved status becomes RDOT. Holiday Off, Vacation Leave, Sick Leave, and Transition Off remain disabled; correct the planned exception first. A confirmed absence can be changed by selecting No decision or Not absent before entering corrected clocks.

## Database migration

The base attendance-management SQL is:

[`sql_migrations/26_create_attendance_management.sql`](../sql_migrations/26_create_attendance_management.sql)

The application routes require this migration before the new page can be used.

If migration 26 was applied before the roster-based foreign-key correction, also apply:

[`sql_migrations/28_remove_attendance_agent_foreign_key.sql`](../sql_migrations/28_remove_attendance_agent_foreign_key.sql)

Migration 28 removes the legacy `attendance_agent_fkey`. Attendance is identified by an operational roster email, and a roster agent is not required to have an application login. Active-roster validation remains enforced by the secured server routes. Fresh installations receive the same correction directly from migration 26.

To enable Vacation Leave, Sick Leave, and legacy manager-confirmed Absent compatibility, apply:

[`sql_migrations/29_add_attendance_leave_and_absence_types.sql`](../sql_migrations/29_add_attendance_leave_and_absence_types.sql)

Migration 29 converts any existing generic `leave` exception to `vacation_leave`, then updates the allowed exception types. It does not modify attendance clocks or schedule snapshots. Fresh installations receive these types directly from migration 26.

To save mixed Normal/Graveyard and Overnight rows atomically from one selected business shift date, apply:

[`sql_migrations/30_make_attendance_commit_dates_cohort_aware.sql`](../sql_migrations/30_make_attendance_commit_dates_cohort_aware.sql)

Migration 30 installs a new atomic save function that accepts each agent's resolved calendar date. This prevents an older database function from silently saving Overnight attendance on the business date.

To store uploader-approved Pre-shift and Post-shift overtime, also apply:

[`sql_migrations/31_add_attendance_overtime_approvals.sql`](../sql_migrations/31_add_attendance_overtime_approvals.sql)

Migration 31 adds the two approval fields and installs a newly named atomic save function. The new name intentionally makes the application report a migration error instead of silently losing approval data when the database is behind the application.

To add the one-hour grace workflow and audited absence outcomes, apply:

[`sql_migrations/32_add_attendance_absence_outcomes.sql`](../sql_migrations/32_add_attendance_absence_outcomes.sql)

Migration 32 creates the outcome and audit tables, moves legacy Absent exceptions into the outcome table, removes those legacy current exceptions, and installs the latest atomic attendance/outcome save function.

To enable the Agent clocking pilot, WFH policy, network classification, and OT review queue, apply:

[`sql_migrations/33_add_agent_self_service_clock.sql`](../sql_migrations/33_add_agent_self_service_clock.sql)

Migration 33 adds `self_service` attendance source support, pending/approved/rejected OT states, immutable policy/clock/OT audit records, validated PostgreSQL `inet`/`cidr` office networks, and service-role-only atomic RPCs. Apply it after migrations 26–32. The app returns a migration-required message instead of silently omitting these fields when the database is behind.

### Before applying it

Back up the existing `attendance` table using the Supabase dashboard or your normal database backup process.

Run this preflight query in the Supabase SQL Editor:

```sql
select
  lower(btrim(agent)) as normalized_agent,
  shift_date,
  count(*) as row_count
from public.attendance
group by lower(btrim(agent)), shift_date
having count(*) > 1
order by shift_date, normalized_agent;
```

The result must be empty. Migration 26 deliberately stops if duplicates exist so that attendance is not silently discarded.

Check active operational roster email requirements. The roster Position field may contain `Phone`, `Email`, `Chat`, `Agent`, or another operational channel; management and IT positions are excluded:

```sql
select name, email, role
from public.agents
where nullif(btrim(coalesce(role, '')), '') is not null
  and lower(btrim(role)) not in (
    'admin', 'manager', 'operations manager', 'supervisor', 'team leader', 'it'
  )
  and nullif(btrim(coalesce(email, '')), '') is null;
```

Check duplicate normalized roster emails:

```sql
select lower(btrim(email)) as normalized_email, count(*)
from public.agents
where nullif(btrim(coalesce(role, '')), '') is not null
  and lower(btrim(role)) not in (
    'admin', 'manager', 'operations manager', 'supervisor', 'team leader', 'it'
  )
  and nullif(btrim(coalesce(email, '')), '') is not null
group by lower(btrim(email))
having count(*) > 1;
```

Both roster checks should return no rows.

### Applying the migration

1. Open the Supabase project used by this application.
2. Open **SQL Editor**.
3. Open the complete local migration file `sql_migrations/26_create_attendance_management.sql`.
4. Copy the entire file into a new SQL query.
5. Run it once.
6. If Supabase has not refreshed the RPC schema automatically, run:

```sql
notify pgrst, 'reload schema';
```

Do not paste only selected sections of the migration. The tables and transaction functions are designed to be installed together.

### Existing attendance table changes

Migration 26 normalizes stored agent emails and adds these fields to `public.attendance`:

| Column | Purpose |
|---|---|
| `source` | `google_form_paste`, `manual`, `legacy`, or `self_service` |
| `updated_by` | Manager email responsible for the latest change |
| `updated_at` | Used for audit and concurrent-change detection |
| `import_id` | Links rows saved by one atomic operation |
| `pre_shift_ot_approved` | Uploader confirmed the qualifying early Time In as Pre-shift OT |
| `post_shift_ot_approved` | Uploader confirmed the qualifying late Time Out as Post-shift OT |
| `pre_shift_ot_review` | Current pre-shift OT state: not required, pending, approved, or rejected |
| `post_shift_ot_review` | Current post-shift OT state: not required, pending, approved, or rejected |

It also creates a unique normalized `(agent, shift_date)` index.

### New tables

| Table | Purpose |
|---|---|
| `attendance_imports` | One audit header per paste or manual save operation |
| `attendance_tracker_order` | Global external-tracker agent order |
| `attendance_schedule_versions` | Immutable schedule version headers |
| `attendance_schedule_entries` | Complete agent schedule for each version |
| `attendance_schedule_exceptions` | Current exact agent/date overrides |
| `attendance_schedule_exception_audit` | Prior and new values for exception corrections |
| `attendance_day_outcomes` | Current confirmed-absent or explicitly-not-absent decision per agent/date |
| `attendance_day_outcome_audit` | Immutable history of attendance outcome decisions and corrections |
| `attendance_clock_agent_policy` | Current pilot and WFH flags keyed by normalized roster email |
| `attendance_clock_policy_audit` | Immutable pilot/WFH policy changes |
| `attendance_office_networks` | Admin-managed labeled IPv4/IPv6 CIDR ranges |
| `attendance_clock_events` | Immutable idempotent self-service clock and network audit events |
| `attendance_overtime_review_audit` | Immutable Team Leader+ OT decisions |

Schedule entries store agent name and team leader snapshots alongside email, shift times, Off 1, Off 2, and cohort. Historical entries are not tied to roster deletion, so they remain available if the current roster later changes.

### New transaction functions

| Function | Purpose |
|---|---|
| `replace_attendance_tracker_order` | Atomically replaces the complete tracker order |
| `commit_attendance_rows_by_date` | Atomically validates and saves cohort-aware attendance rows |
| `commit_attendance_rows_with_overtime` | Latest atomic attendance save, including cohort dates and OT approvals |
| `commit_attendance_with_outcomes` | Latest atomic attendance save, including clocks, OT approvals, and absence outcomes |
| `create_attendance_schedule_version` | Atomically creates a header and full-roster snapshot |
| `upsert_attendance_schedule_exceptions` | Atomically saves agent/date exceptions and audit rows |
| `replace_attendance_clock_pilot` | Atomically replaces the Admin pilot allowlist |
| `replace_attendance_clock_wfh` | Atomically replaces the WFH selection |
| `replace_attendance_office_networks` | Atomically replaces labeled office CIDRs |
| `classify_attendance_network` | Classifies a clock as office, offsite, WFH, unknown, or unconfigured |
| `clock_attendance_self_service` | Atomically writes one idempotent server-time clock and its audit event |
| `review_attendance_overtime` | Atomically approves/rejects pending OT and writes audit history |

The new tables use Row Level Security. Browser clients cannot write them directly. The authenticated application API checks the user's database role and performs authorized operations through the server-only Supabase service client.

## Recommended rollout order

1. Back up attendance data.
2. Run the duplicate attendance and roster-email checks.
3. Apply migration 26.
4. Apply corrective migrations 28–33 when upgrading an already-installed attendance workspace.
5. Open Attendance using a management account.
6. Save Tracker Order.
7. Create the first complete snapshot effective September 1, 2026.
8. Backfill September 1–6 through Manual Entry.
9. Compare Daily Log tracker output with the existing Google Sheet.
10. Test a Normal/Graveyard shift, Overnight shift, regular day off, holiday, and Transition Off.
11. Configure at least one office CIDR and select a small Admin pilot.
12. Set representative Agents to Office and WFH, then test clocks from each network condition.
13. Sign in as representative Agent accounts and verify Home and Attendance remain synchronized.

## Automated testing

From the project directory:

```powershell
npm run type-check
npm test
```

Run only attendance tests while developing:

```powershell
node --experimental-strip-types --test tests/attendance.test.ts tests/attendanceManagement.test.ts tests/attendanceClock.test.ts
```

Compile the Next.js application:

```powershell
npm run build
```

If the repository's changelog lock is temporarily out of date, the application compiler can be checked separately with:

```powershell
.\node_modules\.bin\next.cmd build
```

Do not use the direct compiler command as a permanent replacement for fixing the changelog lock.

## Manual acceptance tests

### 1. Permissions

- Sign in as an Agent and confirm only the personal calendar appears.
- Confirm the Agent cannot call management endpoints successfully.
- Sign in as each supported management role and confirm the management tabs and Agent Calendars appear.
- Confirm an unassigned or unrelated role cannot manage attendance.
- With the global toggle off, confirm a pilot Agent can open Attendance while a non-pilot Agent cannot.
- Confirm only Admin can replace the pilot list or office CIDRs and Team Leader+ can replace WFH selection.

### 1a. Self-service clock and network

- Add one Agent to the pilot in Utilities → Controls and confirm the Home card appears.
- Save an office IPv4 address and IPv6/CIDR range; test Office, offsite, unknown-IP, WFH, and no-network-configured results.
- Confirm offsite and unknown-IP clocks are accepted and appear for review in Daily Log.
- Test Time In → Time Out and Day Off RDOT In → RDOT Out from both Attendance and Home.
- Test Normal, Graveyard after midnight, and Overnight after midnight; confirm the server-selected date.
- Double-click or replay the same request UUID and confirm only one immutable clock event exists.
- Confirm protected leave/holiday/transition dates cannot self-clock.
- Confirm a Time In clears a confirmed-absence outcome and both changes remain audited.
- Test 119-minute and 120-minute pre/post-shift boundaries, then approve and reject pending items in Daily Log.
- Replace a clock through Import or Manual Entry and confirm any stale OT decision is recalculated.
- Configure the production reverse proxy to overwrite untrusted `CF-Connecting-IP`, `X-Forwarded-For`, or `X-Real-IP` values before relying on network warnings.

### 2. Tracker order

- Paste every active Agent once and save successfully.
- Try an unknown name and confirm the complete replacement is rejected.
- Try a duplicate name and confirm rejection.
- Remove one active Agent and confirm the missing-agent error.

### 3. Form import

- Paste the example Time OUT row and confirm the email match.
- Paste a Time IN and Time OUT pair and save it.
- Paste OVERTIME IN and OVERTIME OUT and confirm they populate the same Time In/Out fields.
- Paste a Time In at least 120 minutes early; confirm saving is blocked until the uploader chooses Confirm Pre-shift OT or Not OT.
- Paste a Time Out at least 120 minutes after the applicable end; confirm the same approval behavior for Post-shift OT.
- Confirm approved OT appears green in both the personal and manager-selected agent calendar.
- Confirm a late Time In and undertime Time Out appear yellow with minute counts, and hover a value over 60 minutes to see its hours/minutes conversion.
- Confirm RDOT clocks do not receive regular-shift OT, late, or undertime labels.
- Import an Overnight Time OUT for business shift date September 7; confirm its attendance calendar date is September 8 while Normal/Graveyard remains September 7.
- Paste an unknown but valid email with a recognizable roster name; confirm saving remains blocked until the uploader approves a fuzzy name match.
- Paste two close Time Ins and confirm the latest is selected automatically.
- Paste two close Time Outs and confirm the earliest is selected automatically.
- Paste two same-action submissions at least 120 minutes apart with no opposite action; confirm the uploader must approve whether they are real duplicates or an incorrect tag pair.
- Create an existing-value conflict and confirm `Keep existing` is the default.
- Select `Replace explicitly` and confirm only that selected field changes.
- At 11:00 PM Eastern, verify a 7:00 PM no-clock agent requires absence confirmation while a 10:30 PM agent remains Awaiting Time In.
- After midnight but before 6:00 AM Eastern, verify the selector still defaults to the previous business shift date.
- Confirm Absent in the import review, save, and verify the calendar and tracker show Absent without creating a Date Exception.

### 4. Schedule history

- Create a September 1 baseline snapshot.
- Create a temporary Normal/Graveyard snapshot effective September 7.
- Add the Overnight change effective September 8.
- Revert Normal/Graveyard effective September 14.
- Revert Overnight effective September 15.
- Reopen August and early September calendars and confirm later snapshots did not change them.

### 5. Holiday and Transition Off

- Create the September 7 holiday for Normal/Graveyard agents.
- Confirm Overnight defaults to September 8 and adjust any agent who differs.
- Save and confirm both dates show Holiday Off for the intended agents.
- Create one Transition Off and confirm no Time In/Out is required.
- Confirm tracker output places the off label on the first row and a blank on the second.

### 6. Manual backfill

- Select September 1, paste two time columns, and save.
- Refresh and confirm values remain.
- Attempt entry for an off-type exception and confirm the fields are protected.
- Change a no-clock scheduled agent to Confirm Absent, then to Not absent, and verify both audited outcomes resolve correctly.
- Confirm the API rejects Confirm Absent when either attendance clock is entered.
- Check the same date through an Agent account.

## Troubleshooting

### “Tracker order has not been saved yet”

Save every active roster Agent exactly once under Tracker Order. If the roster changed, replace the order again.

### “Active Agent roster emails are required”

Add unique, non-empty emails to the affected `agents` rows. Fuzzy names can resolve an unknown pasted Form email only after uploader approval; saved attendance still uses the selected roster email as its identity.

### “Attendance changed after preview”

Another save occurred after the preview. Refresh or preview again, review the new existing values, and commit again.

### `attendance_agent_fkey` foreign-key violation

Apply [`sql_migrations/28_remove_attendance_agent_foreign_key.sql`](../sql_migrations/28_remove_attendance_agent_foreign_key.sql) in the Supabase SQL Editor. The old constraint incorrectly requires every operational roster agent to have a matching application-user row. After the migration succeeds, retry the same Manual Entry or Import Attendance save.

### Migration reports duplicate attendance rows

Do not remove the migration safety check. Back up the table, review each duplicate `(normalized agent email, shift date)` group, reconcile its Time In/Out values, and rerun the preflight query before applying the migration.

### New RPC function is not found

Apply [`sql_migrations/27_refresh_attendance_tracker_order_rpc.sql`](../sql_migrations/27_refresh_attendance_tracker_order_rpc.sql). It safely recreates the atomic Tracker Order function, restores its `service_role` permission, prevents an empty replacement, and refreshes the PostgREST schema.

The function uses an explicit `where position >= 1` predicate when replacing the complete order. This is required by Supabase projects that enable safe-update protection and avoids the `DELETE requires a WHERE clause` error.

If attendance saving specifically reports `commit_attendance_rows_with_overtime`, apply [`sql_migrations/31_add_attendance_overtime_approvals.sql`](../sql_migrations/31_add_attendance_overtime_approvals.sql). Migration 31 requires the base attendance workspace and should be applied after migrations 28–30 on an existing installation.

If attendance loading or saving reports `attendance_day_outcomes` or `commit_attendance_with_outcomes`, apply [`sql_migrations/32_add_attendance_absence_outcomes.sql`](../sql_migrations/32_add_attendance_absence_outcomes.sql) after migration 31.

Migration 26 must already be installed. To refresh only the schema after confirming the function exists, run:

```sql
notify pgrst, 'reload schema';
```
