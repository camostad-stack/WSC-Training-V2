# WSC AI Training App - MVP TODO

## Phase 1: Database Schema
- [x] 9 tables: users, employee_profiles, scenario_templates, simulation_sessions, session_media, manager_reviews, assignments, policy_documents, audit_logs
- [x] Enums: user roles, readiness statuses, session modes, session statuses, review statuses, emotional intensity, scenario complexity
- [x] Proper foreign key relationships between all tables
- [x] Push schema and verify

## Phase 2: Server-Side AI & Routers
- [x] AI prompt registry with versioned prompts
- [x] Session orchestration engine (start → turns → complete → evaluate)
- [x] tRPC routers: sessions, employees, assignments, scenarios, policies, analytics, admin
- [x] Role-based procedure guards (employee, manager, admin)
- [x] Failure handling: JSON parse, incomplete session, low-effort detection
- [x] Seed data script: 15+ scenario templates, 3 departments, sample accounts

## Phase 3: Employee Mobile Experience
- [x] Bottom navigation: Home, Practice, Assignments, Profile
- [x] Home screen: start practice, assigned drills, recent score, focus area, readiness badge
- [x] Practice flow: Setup → Intro → Session → Processing → Results
- [x] Session screen: customer prompt, transcript, action buttons, clean mobile layout
- [x] Results screen: score, pass/fail, category bars, strengths, misses, replacement phrases
- [x] Profile screen: level, skill map, trend, strengths/weaknesses, manager flag
- [x] Assignments screen: assigned drills with due dates and completion status

## Phase 4: Manager Desktop Portal
- [x] Left sidebar: Dashboard, Team, Sessions, Assignments, Scenarios, Policies, Analytics, Settings
- [x] Dashboard: team readiness, pending reviews, flagged sessions, overdue assignments, skill gaps
- [x] Sessions page: filters (employee, department, scenario, date, flag, review status)
- [x] Session detail: transcript, scenario card, evaluation, policy notes, manager override form
- [x] Employee detail: readiness, trend, sessions, weaknesses, assignments, notes
- [x] Scenario library: create, edit, activate/deactivate, filter
- [x] Policy manager: upload, version, activate, tag by department
- [x] Analytics: readiness distribution, completion rate, skill gaps, score trends

## Phase 5: Access Control & Audit
- [x] Server-side role enforcement on all procedures
- [x] Manager override with required reason and score delta
- [x] Audit logging for overrides, scenario changes, policy changes, assignments
- [x] Employees can only access own records
- [ ] Managers can only access their assigned team (currently all managers see all employees)

## Phase 6: WSC-Specific Content
- [x] 3 role tracks: Customer Service, Golf/Sales-Service, MOD/Emergency
- [x] 15+ seed scenario templates with WSC-specific content (16 loaded)
- [x] Professional, club-appropriate language throughout
- [x] Operational tone, not cheesy

## Phase 7: Polish & Testing
- [x] Vitest tests for server logic (20 tests passing)
- [x] End-to-end flow verification (employee + manager portals)
- [ ] Loading, empty, success, error states on all screens
- [ ] Consistent naming across app
- [ ] Remove placeholder/generic content
- [ ] Mobile screens fast and simple
- [ ] Manager screens dense but readable
- [ ] Fix Vite import resolution for SessionDetail and EmployeeDetail

## Bug Fixes
- [x] Fix assignment creation SQL error: optional fields passed as null causing Drizzle empty string issue
- [x] Fix department enum mismatch: frontend sent display labels instead of DB enum values
- [x] Fix teamAssignments query to join users table for employee names
- [x] Add 8 vitest tests for assignment creation (20 total tests passing)
- [x] Fix ScenarioIntro crash: TypeError Cannot read properties of undefined (reading 'name') when generating scenario
- [x] MVP: Fix session saving — PracticeSession/SessionResults now calls saveSession after evaluation
- [x] MVP: Fix ManagerSessions to use teamSessions instead of myRecent
- [x] MVP: Build admin user management (list users, change role, assign manager, activate/deactivate)
- [x] MVP: Add admin tRPC procedures for user CRUD
- [x] MVP: Add admin route and nav item
- [x] MVP: Simplify manager sidebar — remove non-essential items (Analytics, Policies, Scenarios, Settings)
- [x] MVP: Remove unused old pages (Architecture, ComponentShowcase, old Configure/Simulate/Results)
- [x] MVP: Add loading/error/success states to core flows (session generation, evaluation, review submission)
- [x] MVP: Fix EmployeeDetail import error in App.tsx
- [x] MVP: Fix department enum normalization in saveSession (LLM returns "Customer Service", DB expects "customer_service")
- [x] MVP: Fix mode enum normalization in saveSession
- [x] MVP: Fix passFail/sessionQuality/readinessSignal enum normalization in saveSession
- [x] MVP: Fix readinessStatus normalization in employee profile update
- [x] MVP: Fix ManagerDashboard to use teamSessions instead of myRecent
- [x] MVP: Fix reviews.create null handling for optional int columns
