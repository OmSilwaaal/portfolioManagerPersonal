-- Memecoin paper trading: tiny prices / huge token counts need wider numerics.
-- Run in Supabase SQL editor (widening only; existing data is preserved).
ALTER TABLE paper_positions    ALTER COLUMN shares   TYPE NUMERIC(38,9);
ALTER TABLE paper_positions    ALTER COLUMN avg_cost TYPE NUMERIC(38,18);
ALTER TABLE paper_transactions ALTER COLUMN shares   TYPE NUMERIC(38,9);
ALTER TABLE paper_transactions ALTER COLUMN price    TYPE NUMERIC(38,18);
