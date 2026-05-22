-- Add image_url column to groups table
-- Run this in Supabase Dashboard → SQL Editor → New query

ALTER TABLE groups ADD COLUMN IF NOT EXISTS image_url TEXT;
