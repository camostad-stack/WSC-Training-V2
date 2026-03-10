# MVP Audit — Three Core Loops

## Current State Summary
- 1 user in DB (the owner, role=admin)
- 1 assignment exists
- 0 simulation sessions saved (sessions are NOT being persisted!)
- No admin user management UI exists

## LOOP 1: Employee Training Flow
### Status: BROKEN — sessions not saved
**What works:**
- [x] Login (OAuth)
- [x] Practice Setup (department, mode, difficulty selection)
- [x] Scenario generation (AI generates scenario)
- [x] Scenario Intro display
- [x] Practice Session (chat with AI customer, turns work)
- [x] Evaluation (AI scoring works, coaching works)
- [x] Results display (score, coaching, categories shown)

**What's broken:**
- [ ] **CRITICAL: Session not saved to DB** — SessionResults never calls `saveSession`. The old Simulate.tsx calls it but the new employee flow (PracticeSession → SessionResults) does NOT.
- [ ] After results, no way to see past sessions (EmployeeHome shows recent sessions but there are none saved)
- [ ] EmployeeProfile shows profile data but no session history list
- [ ] No loading state when navigating between practice steps

### Fix Plan:
1. Add `saveSession` call after evaluation completes (in PracticeSession or SessionResults)
2. Pass all required data: scenario, transcript, evaluation, coaching, scores
3. Verify EmployeeHome shows saved sessions
4. Verify EmployeeProfile updates after session

## LOOP 2: Manager Review Flow
### Status: PARTIALLY BROKEN
**What works:**
- [x] Manager sidebar navigation
- [x] SessionDetail page with transcript, evaluation, review form
- [x] Review submission (override score, notes, performance signal)
- [x] Assignment creation (fixed in last checkpoint)

**What's broken:**
- [ ] **CRITICAL: ManagerSessions uses `sessions.myRecent` (own sessions) instead of `sessions.teamSessions`** — managers see their OWN sessions, not team sessions
- [ ] No sessions exist anyway because employee loop doesn't save them
- [ ] ManagerDashboard stats will be empty
- [ ] ManagerTeam shows team members but relies on `managerId` being set on users

### Fix Plan:
1. Fix ManagerSessions to use `teamSessions` instead of `myRecent`
2. Ensure session saving works (Loop 1 fix)
3. Verify SessionDetail loads and review works

## LOOP 3: Admin/Access Control
### Status: NOT BUILT
**What works:**
- [x] User roles exist in schema (employee, shift_lead, manager, admin, super_admin)
- [x] `managerId` field exists on users table
- [x] `isActive` field exists
- [x] `adminProcedure` exists in trpc.ts
- [x] Manager procedures check role

**What's broken:**
- [ ] **NO admin UI** — no page to manage users, assign roles, activate/deactivate
- [ ] **NO admin procedures** — no tRPC procedures for user CRUD
- [ ] Only way to change roles is direct DB edit
- [ ] No way to assign managerId to employees

### Fix Plan:
1. Add admin tRPC procedures: listUsers, updateUser (role, department, managerId, isActive)
2. Add admin page with user table, role dropdown, manager assignment, active toggle
3. Add admin route to App.tsx
4. Add admin nav item to ManagerLayout sidebar (visible only to admin/super_admin)

## Non-Essential Items to DEPRIORITIZE
- ManagerAnalytics page (remove from sidebar or stub)
- ManagerPolicies page (stub)
- ManagerScenarios page (stub — scenario generation works via AI, no need for template management yet)
- ManagerSettings page (stub)
- Architecture page (remove)
- ComponentShowcase page (remove)
- Old Configure/Simulate/Results pages (remove — replaced by employee flow)

## Execution Order
1. Fix session saving (Loop 1) — everything depends on this
2. Fix ManagerSessions to use teamSessions (Loop 2)
3. Build admin user management (Loop 3)
4. Simplify sidebar — remove non-essential items
5. Add proper loading/error/success states throughout
6. End-to-end test all three loops
