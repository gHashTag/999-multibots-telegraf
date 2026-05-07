-- Migration: Create voice_models table for RVC voice training
-- Run this in Supabase SQL Editor

-- Create voice_models table for RVC voice training
CREATE TABLE IF NOT EXISTS voice_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  replicate_training_id TEXT,
  model_url TEXT,  -- replicate model URL after training
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'training', 'ready', 'failed')),
  audio_url TEXT,  -- original training audio
  error_message TEXT,  -- error details if failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups by telegram_id
CREATE INDEX IF NOT EXISTS idx_voice_models_telegram ON voice_models(telegram_id);

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_voice_models_status ON voice_models(status);

-- Add RLS policies
ALTER TABLE voice_models ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own voice models
CREATE POLICY "Users can view own voice models" ON voice_models
  FOR SELECT USING (true);

-- Policy: Service role can manage all voice models
CREATE POLICY "Service role can manage voice models" ON voice_models
  FOR ALL USING (true);

-- Add comments
COMMENT ON TABLE voice_models IS 'Stores user voice models trained via RVC for AI Cover feature';
COMMENT ON COLUMN voice_models.telegram_id IS 'Telegram user ID';
COMMENT ON COLUMN voice_models.model_name IS 'User-friendly name for the voice model';
COMMENT ON COLUMN voice_models.replicate_training_id IS 'Replicate training job ID';
COMMENT ON COLUMN voice_models.model_url IS 'URL to the trained model on Replicate';
COMMENT ON COLUMN voice_models.status IS 'Training status: pending, training, ready, failed';
COMMENT ON COLUMN voice_models.audio_url IS 'URL to the original training audio in Supabase Storage';
