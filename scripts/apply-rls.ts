import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DIRECT_URL or DATABASE_URL is required");
}

const sql = postgres(connectionString, {
  ssl: "require",
  prepare: false,
  max: 1,
});

const statements = [
  `create or replace function public.current_app_user_id()
   returns integer
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select id from public.users where "openId" = auth.uid()::text limit 1
   $$`,
  `create or replace function public.current_app_user_role()
   returns text
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select role::text from public.users where "openId" = auth.uid()::text limit 1
   $$`,
  `create or replace function public.is_current_user_admin()
   returns boolean
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select coalesce(public.current_app_user_role() in ('admin', 'super_admin'), false)
   $$`,
  `create or replace function public.is_current_user_manager()
   returns boolean
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select coalesce(public.current_app_user_role() in ('manager', 'admin', 'super_admin'), false)
   $$`,
  `create or replace function public.can_access_employee(target_user_id integer)
   returns boolean
   language sql
   stable
   security definer
   set search_path = public
   as $$
     select
       public.current_app_user_id() = target_user_id
       or public.is_current_user_admin()
       or exists (
         select 1
         from public.users target_user
         where target_user.id = target_user_id
           and target_user."managerId" = public.current_app_user_id()
       )
   $$`,
  `alter table public.users enable row level security`,
  `alter table public.employee_profiles enable row level security`,
  `alter table public.scenario_templates enable row level security`,
  `alter table public.simulation_sessions enable row level security`,
  `alter table public.session_media enable row level security`,
  `alter table public.manager_reviews enable row level security`,
  `alter table public.assignments enable row level security`,
  `alter table public.policy_documents enable row level security`,
  `alter table public.audit_logs enable row level security`,
  `drop policy if exists users_select_policy on public.users`,
  `create policy users_select_policy
   on public.users
   for select
   to authenticated
   using (public.can_access_employee(id))`,
  `drop policy if exists users_update_policy on public.users`,
  `create policy users_update_policy
   on public.users
   for update
   to authenticated
   using (public.is_current_user_admin() or "openId" = auth.uid()::text)
   with check (public.is_current_user_admin() or "openId" = auth.uid()::text)`,
  `drop policy if exists employee_profiles_select_policy on public.employee_profiles`,
  `create policy employee_profiles_select_policy
   on public.employee_profiles
   for select
   to authenticated
   using (public.can_access_employee("userId"))`,
  `drop policy if exists employee_profiles_update_policy on public.employee_profiles`,
  `create policy employee_profiles_update_policy
   on public.employee_profiles
   for update
   to authenticated
   using (public.can_access_employee("userId"))
   with check (public.can_access_employee("userId"))`,
  `drop policy if exists scenario_templates_select_policy on public.scenario_templates`,
  `create policy scenario_templates_select_policy
   on public.scenario_templates
   for select
   to authenticated
   using ("isActive" = true or public.is_current_user_admin())`,
  `drop policy if exists scenario_templates_manage_policy on public.scenario_templates`,
  `create policy scenario_templates_manage_policy
   on public.scenario_templates
   for all
   to authenticated
   using (public.is_current_user_admin())
   with check (public.is_current_user_admin())`,
  `drop policy if exists simulation_sessions_select_policy on public.simulation_sessions`,
  `create policy simulation_sessions_select_policy
   on public.simulation_sessions
   for select
   to authenticated
   using (public.can_access_employee("userId"))`,
  `drop policy if exists simulation_sessions_insert_policy on public.simulation_sessions`,
  `create policy simulation_sessions_insert_policy
   on public.simulation_sessions
   for insert
   to authenticated
   with check (public.is_current_user_admin() or "userId" = public.current_app_user_id())`,
  `drop policy if exists simulation_sessions_update_policy on public.simulation_sessions`,
  `create policy simulation_sessions_update_policy
   on public.simulation_sessions
   for update
   to authenticated
   using (public.is_current_user_admin() or "userId" = public.current_app_user_id())
   with check (public.is_current_user_admin() or "userId" = public.current_app_user_id())`,
  `drop policy if exists session_media_select_policy on public.session_media`,
  `create policy session_media_select_policy
   on public.session_media
   for select
   to authenticated
   using (public.can_access_employee("userId"))`,
  `drop policy if exists session_media_insert_policy on public.session_media`,
  `create policy session_media_insert_policy
   on public.session_media
   for insert
   to authenticated
   with check (public.is_current_user_admin() or "userId" = public.current_app_user_id())`,
  `drop policy if exists assignments_select_policy on public.assignments`,
  `create policy assignments_select_policy
   on public.assignments
   for select
   to authenticated
   using (public.can_access_employee("employeeId"))`,
  `drop policy if exists assignments_manage_policy on public.assignments`,
  `create policy assignments_manage_policy
   on public.assignments
   for all
   to authenticated
   using (public.is_current_user_manager())
   with check (public.is_current_user_manager())`,
  `drop policy if exists manager_reviews_select_policy on public.manager_reviews`,
  `create policy manager_reviews_select_policy
   on public.manager_reviews
   for select
   to authenticated
   using (public.can_access_employee("employeeId") or "reviewerId" = public.current_app_user_id())`,
  `drop policy if exists manager_reviews_manage_policy on public.manager_reviews`,
  `create policy manager_reviews_manage_policy
   on public.manager_reviews
   for all
   to authenticated
   using (public.is_current_user_manager())
   with check (public.is_current_user_manager())`,
  `drop policy if exists policy_documents_select_policy on public.policy_documents`,
  `create policy policy_documents_select_policy
   on public.policy_documents
   for select
   to authenticated
   using ("isActive" = true or public.is_current_user_admin())`,
  `drop policy if exists policy_documents_manage_policy on public.policy_documents`,
  `create policy policy_documents_manage_policy
   on public.policy_documents
   for all
   to authenticated
   using (public.is_current_user_admin())
   with check (public.is_current_user_admin())`,
  `drop policy if exists audit_logs_select_policy on public.audit_logs`,
  `create policy audit_logs_select_policy
   on public.audit_logs
   for select
   to authenticated
   using (public.is_current_user_admin())`,
];

async function main() {
  for (const statement of statements) {
    await sql.unsafe(statement);
  }
  console.log("RLS policies applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  });
