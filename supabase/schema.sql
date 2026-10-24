-- Excript's private media list. RLS makes each signed-in user see only their own rows.
create table if not exists public.media_items (
  id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  creator text not null default '',
  type text not null check (type in ('book', 'movie', 'series')),
  completed boolean not null default false,
  catalog jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.media_items enable row level security;

drop policy if exists "Users manage their own Excript items" on public.media_items;
create policy "Users manage their own Excript items"
  on public.media_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists media_items_user_updated_idx
  on public.media_items (user_id, updated_at desc);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'media_items'
  ) then
    execute 'alter publication supabase_realtime add table public.media_items';
  end if;
end;
$$;
