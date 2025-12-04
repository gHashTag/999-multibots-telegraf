
-- Migration: Remove deprecated subscription field from users table
-- Date: Tue Sep 16 11:14:41 UTC 2025
-- Reason: All subscription logic moved to payments_v2 table

-- First check if column exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = users AND column_name = subscription) THEN
        -- Drop the column
        ALTER TABLE users DROP COLUMN subscription;
        RAISE NOTICE Column subscription dropped from users table;
    ELSE
        RAISE NOTICE Column subscription does not exist in users table;
    END IF;
END $$;

