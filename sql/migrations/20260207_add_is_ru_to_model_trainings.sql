-- Migration: Add is_ru column to model_trainings table
-- Run this in Supabase SQL Editor
-- Date: 2026-02-07
-- Issue: Database error: Could not find the 'is_ru' column of 'model_trainings' in the schema cache

-- Add is_ru column to model_trainings table
ALTER TABLE model_trainings
ADD COLUMN IF NOT EXISTS is_ru BOOLEAN DEFAULT true;

-- Add comment
COMMENT ON COLUMN model_trainings.is_ru IS 'Language preference: true = Russian, false = English';

-- Update schema cache (force refresh)
-- Note: Supabase auto-refreshes schema cache, but this helps ensure immediate availability
NOTIFY pgrst, 'reload schema';
