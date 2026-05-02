do $$
declare
  existing_name text;
begin
  select con.conname
  into existing_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'uploads'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%stream%Theory%'
  limit 1;

  if existing_name is not null then
    execute format('alter table public.uploads drop constraint %I', existing_name);
  end if;
end $$;

alter table public.uploads
add constraint uploads_stream_check
check (stream in ('Theory', 'Practical', 'PYQ'));
