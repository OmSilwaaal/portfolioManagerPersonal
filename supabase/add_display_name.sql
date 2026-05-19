-- Run this in Supabase SQL Editor
alter table profiles
  add column if not exists display_name text default null;
