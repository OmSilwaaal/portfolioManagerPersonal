-- Security hardening — run once in Supabase Dashboard → SQL Editor → New query.
-- Safe to re-run.
--
-- Background: the anon key ships inside the public frontend bundle, so anyone can call the
-- Supabase REST API directly with it. The Express backend uses the SERVICE ROLE key, which
-- bypasses RLS — so every table below can be locked down completely for direct (anon/authenticated)
-- access without breaking the app. The frontend never reads or writes these tables directly.

-- ── 1. Paper-trading + explainer tables had NO row-level security ─────────────
-- Without this, any signed-in user could PATCH their own paper_portfolios.cash_balance directly.
alter table if exists paper_portfolios      enable row level security;
alter table if exists paper_positions       enable row level security;
alter table if exists paper_transactions    enable row level security;
alter table if exists paper_cash_purchases  enable row level security;
alter table if exists stock_explanations    enable row level security;
-- (No policies = no direct access. The backend's service role is unaffected.)

-- ── 2. Groups: remove client-side write policies ──────────────────────────────
-- "users can join groups" let any user insert THEMSELVES into ANY group with role='admin'
-- and can_post=true via the REST API, skipping the join-code check entirely.
-- "members can create posts" let members post type='announcement' directly.
-- All writes go through the backend, which enforces codes, roles and limits.
drop policy if exists "users can join groups"                  on group_members;
drop policy if exists "users can leave groups"                 on group_members;
drop policy if exists "members can create posts"               on group_posts;
drop policy if exists "authors can delete own posts"           on group_posts;
drop policy if exists "authenticated users can create groups"  on groups;
drop policy if exists "creator can update group"               on groups;

-- ── 3. Profiles: writes only through the validated backend endpoint ───────────
drop policy if exists "users can insert own profile" on profiles;
drop policy if exists "users can update own profile" on profiles;

-- ── 4. Stop publishing email addresses ────────────────────────────────────────
-- Older code used the user's email as their public display name. Replace with the local part.
update profiles      set display_name = split_part(display_name, '@', 1) where display_name like '%@%';
update group_members set display_name = split_part(display_name, '@', 1) where display_name like '%@%';
update group_posts   set author_name  = split_part(author_name,  '@', 1) where author_name  like '%@%';
update group_members set email = null where email is not null;
