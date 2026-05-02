create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'uploader', 'student')),
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.assignments add column if not exists chapter text;
alter table public.assignments add column if not exists question_link text;
alter table public.assignments add column if not exists solution_link text;
alter table public.uploads add column if not exists pdf_link text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'uploads'
      and column_name = 'drive_web_view_link'
  ) then
    execute '
      update public.uploads
      set pdf_link = coalesce(pdf_link, drive_web_view_link, drive_download_link)
      where pdf_link is null
    ';
  end if;
end $$;

insert into public.app_users (user_id, role, display_name)
values
  ('75b42a76-8710-44c8-b3ef-c41b984ce1d1', 'admin', 'Primary Admin'),
  ('ead3a936-cdaf-4e98-aaf9-f49a21485439', 'uploader', 'Uploader One'),
  ('de5b7404-5a68-4a5a-b0d2-ac8c250ba3d8', 'uploader', 'Uploader Two')
on conflict (user_id) do update
set role = excluded.role,
    display_name = excluded.display_name;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.app_users
  where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and role = 'admin'
  )
$$;

create or replace function public.can_upload()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_users
    where user_id = auth.uid()
      and role in ('admin', 'uploader')
  )
$$;

alter table public.app_users enable row level security;

drop policy if exists "Users can read own role" on public.app_users;
drop policy if exists "Admin can manage app users" on public.app_users;

create policy "Users can read own role"
on public.app_users for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "Admin can manage app users"
on public.app_users for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Public insert subjects" on public.subjects;
drop policy if exists "Public update subjects" on public.subjects;
drop policy if exists "Public delete subjects" on public.subjects;
drop policy if exists "Public insert chapters" on public.chapters;
drop policy if exists "Public update chapters" on public.chapters;
drop policy if exists "Public delete chapters" on public.chapters;
drop policy if exists "Public insert assignments" on public.assignments;
drop policy if exists "Public update assignments" on public.assignments;
drop policy if exists "Public delete assignments" on public.assignments;
drop policy if exists "Public insert uploads" on public.uploads;
drop policy if exists "Public update uploads" on public.uploads;
drop policy if exists "Public delete uploads" on public.uploads;
drop policy if exists "Public insert site settings" on public.site_settings;
drop policy if exists "Public update site settings" on public.site_settings;

create policy "Admin manages subjects"
on public.subjects for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admin manages chapters"
on public.chapters for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admin and uploader manage assignments"
on public.assignments for insert
to authenticated
with check (public.can_upload());

create policy "Admin and uploader update assignments"
on public.assignments for update
to authenticated
using (public.can_upload())
with check (public.can_upload());

create policy "Admin and uploader delete assignments"
on public.assignments for delete
to authenticated
using (public.can_upload());

create policy "Admin and uploader manage uploads"
on public.uploads for insert
to authenticated
with check (public.can_upload());

create policy "Admin and uploader update uploads"
on public.uploads for update
to authenticated
using (public.can_upload())
with check (public.can_upload());

create policy "Admin and uploader delete uploads"
on public.uploads for delete
to authenticated
using (public.can_upload());

create policy "Admin manages site settings"
on public.site_settings for insert
to authenticated
with check (public.is_admin());

create policy "Admin updates site settings"
on public.site_settings for update
to authenticated
using (public.is_admin())
with check (public.is_admin());
