create table if not exists public.subjects (
  id bigint generated always as identity primary key,
  slug text unique not null,
  name text unique not null,
  accent text not null,
  description text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  subject text not null,
  chapter text not null,
  title text not null,
  deadline date,
  question_link text,
  solution_link text,
  created_at timestamptz not null default now()
);

create table if not exists public.chapters (
  id bigint generated always as identity primary key,
  subject text not null,
  stream text not null check (stream in ('Theory', 'Practical')),
  chapter_name text not null,
  chapter_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.uploads (
  id bigint generated always as identity primary key,
  subject text not null,
  stream text not null check (stream in ('Theory', 'Practical', 'PYQ')),
  chapter text not null,
  topic text not null,
  notice_title text not null,
  pdf_link text,
  uploaded_on date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id bigint generated always as identity primary key,
  hero_eyebrow text not null default 'NOVA',
  hero_title text not null default 'Network for Organization, Vision, and Academics',
  hero_copy text not null default 'Organize smarter, stay aligned with your academic goals, and keep every subject update in one clean student workspace.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subjects (slug, name, accent, description, display_order)
values
  ('mathematics-part-1', 'Mathematics Part 1', 'M1', 'Core concepts, formulas, and solved examples.', 1),
  ('mathematics-part-2', 'Mathematics Part 2', 'M2', 'Advanced practice sets and chapter-wise revision.', 2),
  ('physics', 'Physics', 'P', 'Theory notes and practical files together.', 3),
  ('iks', 'IKS', 'IKS', 'Indian Knowledge Systems notes and reference material.', 4),
  ('english', 'English', 'EN', 'Grammar, prose, writing, and daily reading topics.', 5)
on conflict (slug) do nothing;

insert into public.chapters (subject, stream, chapter_name, chapter_order)
values
  ('Mathematics Part 1', 'Theory', 'Chapter 1', 1),
  ('Mathematics Part 1', 'Theory', 'Chapter 2', 2),
  ('Mathematics Part 2', 'Theory', 'Chapter 1', 1),
  ('Physics', 'Theory', 'Chapter 1', 1),
  ('Physics', 'Practical', 'Chapter 1', 1),
  ('IKS', 'Theory', 'Chapter 1', 1),
  ('English', 'Theory', 'Chapter 1', 1)
on conflict do nothing;

insert into public.site_settings (hero_eyebrow, hero_title, hero_copy)
select
  'NOVA',
  'Network for Organization, Vision, and Academics',
  'Organize smarter, stay aligned with your academic goals, and keep every subject update in one clean student workspace.'
where not exists (select 1 from public.site_settings);

alter table public.subjects enable row level security;
alter table public.assignments enable row level security;
alter table public.chapters enable row level security;
alter table public.uploads enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "Public read subjects" on public.subjects;
drop policy if exists "Public read assignments" on public.assignments;
drop policy if exists "Public insert assignments" on public.assignments;
drop policy if exists "Public update assignments" on public.assignments;
drop policy if exists "Public delete assignments" on public.assignments;
drop policy if exists "Public read chapters" on public.chapters;
drop policy if exists "Public insert chapters" on public.chapters;
drop policy if exists "Public update chapters" on public.chapters;
drop policy if exists "Public delete chapters" on public.chapters;
drop policy if exists "Public read uploads" on public.uploads;
drop policy if exists "Public insert uploads" on public.uploads;
drop policy if exists "Public update uploads" on public.uploads;
drop policy if exists "Public delete uploads" on public.uploads;
drop policy if exists "Public insert subjects" on public.subjects;
drop policy if exists "Public update subjects" on public.subjects;
drop policy if exists "Public delete subjects" on public.subjects;
drop policy if exists "Public read site settings" on public.site_settings;
drop policy if exists "Public insert site settings" on public.site_settings;
drop policy if exists "Public update site settings" on public.site_settings;

create policy "Public read subjects"
on public.subjects for select
to anon, authenticated
using (true);

create policy "Public insert subjects"
on public.subjects for insert
to anon, authenticated
with check (true);

create policy "Public update subjects"
on public.subjects for update
to anon, authenticated
using (true)
with check (true);

create policy "Public delete subjects"
on public.subjects for delete
to anon, authenticated
using (true);

create policy "Public read assignments"
on public.assignments for select
to anon, authenticated
using (true);

create policy "Public insert assignments"
on public.assignments for insert
to anon, authenticated
with check (true);

create policy "Public update assignments"
on public.assignments for update
to anon, authenticated
using (true)
with check (true);

create policy "Public delete assignments"
on public.assignments for delete
to anon, authenticated
using (true);

create policy "Public read chapters"
on public.chapters for select
to anon, authenticated
using (true);

create policy "Public insert chapters"
on public.chapters for insert
to anon, authenticated
with check (true);

create policy "Public update chapters"
on public.chapters for update
to anon, authenticated
using (true)
with check (true);

create policy "Public delete chapters"
on public.chapters for delete
to anon, authenticated
using (true);

create policy "Public read uploads"
on public.uploads for select
to anon, authenticated
using (true);

create policy "Public insert uploads"
on public.uploads for insert
to anon, authenticated
with check (true);

create policy "Public update uploads"
on public.uploads for update
to anon, authenticated
using (true)
with check (true);

create policy "Public delete uploads"
on public.uploads for delete
to anon, authenticated
using (true);

create policy "Public read site settings"
on public.site_settings for select
to anon, authenticated
using (true);

create policy "Public insert site settings"
on public.site_settings for insert
to anon, authenticated
with check (true);

create policy "Public update site settings"
on public.site_settings for update
to anon, authenticated
using (true)
with check (true);
