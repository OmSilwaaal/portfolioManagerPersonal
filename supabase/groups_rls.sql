-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Enables Row Level Security on all three groups tables.
--
-- The backend uses SERVICE_ROLE_KEY which bypasses RLS (by design).
-- These policies protect against direct anon-key API access — a second
-- layer of defence if credentials are ever misused.

-- ── Enable RLS ────────────────────────────────────────────────────────────────

alter table groups       enable row level security;
alter table group_members enable row level security;
alter table group_posts  enable row level security;

-- ── groups ────────────────────────────────────────────────────────────────────

-- Only members of a group can read it
create policy "members can read group"
  on groups for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = groups.id
        and group_members.user_id  = auth.uid()::text
    )
  );

-- Only the creator can update group settings
create policy "creator can update group"
  on groups for update
  using (created_by = auth.uid()::text);

-- Authenticated users can create groups (cap enforced in backend)
create policy "authenticated users can create groups"
  on groups for insert
  with check (created_by = auth.uid()::text);

-- ── group_members ─────────────────────────────────────────────────────────────

-- Members of a group can see its member list
create policy "members can read member list"
  on group_members for select
  using (
    exists (
      select 1 from group_members gm2
      where gm2.group_id = group_members.group_id
        and gm2.user_id  = auth.uid()::text
    )
  );

-- A user can only insert their own membership row
create policy "users can join groups"
  on group_members for insert
  with check (user_id = auth.uid()::text);

-- A user can remove themselves; admins handled via backend (service role)
create policy "users can leave groups"
  on group_members for delete
  using (user_id = auth.uid()::text);

-- ── group_posts ───────────────────────────────────────────────────────────────

-- Members can read posts in their groups
create policy "members can read posts"
  on group_posts for select
  using (
    exists (
      select 1 from group_members
      where group_members.group_id = group_posts.group_id
        and group_members.user_id  = auth.uid()::text
    )
  );

-- Members can post (type/announcement restrictions enforced in backend)
create policy "members can create posts"
  on group_posts for insert
  with check (
    author_id = auth.uid()::text
    and exists (
      select 1 from group_members
      where group_members.group_id = group_posts.group_id
        and group_members.user_id  = auth.uid()::text
    )
  );

-- Authors can delete their own posts
create policy "authors can delete own posts"
  on group_posts for delete
  using (author_id = auth.uid()::text);
