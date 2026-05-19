-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── profiles table ────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null unique,
  username   text unique,
  bio        text not null default '',
  avatar_url text not null default '',
  updated_at timestamptz not null default now()
);

-- ── Add rank + can_post to group_members ──────────────────────────────────────
alter table group_members
  add column if not exists rank text default null,
  add column if not exists can_post boolean not null default false;

-- Admins always have posting rights
update group_members set can_post = true where role = 'admin';

-- ── RLS for profiles ──────────────────────────────────────────────────────────
alter table profiles enable row level security;

-- Anyone authenticated can view any profile
create policy "authenticated users can read profiles"
  on profiles for select
  using (auth.role() = 'authenticated');

-- Users can only insert/update their own profile
create policy "users can insert own profile"
  on profiles for insert
  with check (user_id = auth.uid()::text);

create policy "users can update own profile"
  on profiles for update
  using (user_id = auth.uid()::text);
