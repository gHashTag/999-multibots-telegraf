#!/usr/bin/env bun
/**
 * Migration: Add is_ru column to model_trainings table
 * Run: bun run scripts/database/add-is-ru-column.ts
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'
import { InfisicalSDK } from '@infisical/sdk'

// Load .env for Infisical credentials
config({ path: path.join(process.cwd(), '.env') })

async function initInfisical(): Promise<Record<string, string>> {
  const clientId = process.env.INFISICAL_CLIENT_ID
  const clientSecret = process.env.INFISICAL_CLIENT_SECRET
  const projectId = process.env.INFISICAL_PROJECT_ID
  const environment = process.env.INFISICAL_ENVIRONMENT || 'dev'

  if (!clientId || !clientSecret || !projectId) {
    throw new Error('Infisical credentials not found in .env')
  }

  const client = new InfisicalSDK({
    siteUrl: 'https://app.infisical.com'
  })

  await client.auth().universalAuth.login({
    clientId,
    clientSecret
  })

  const result = await client.secrets().listSecrets({
    projectId,
    environment: environment as 'dev' | 'staging' | 'prod',
    secretPath: '/'
  })

  const secrets: Record<string, string> = {}
  for (const secret of result.secrets) {
    secrets[secret.secretKey] = secret.secretValue
  }

  return secrets
}

async function addIsRuColumn() {
  console.log('🔐 Initializing Infisical...')
  const secrets = await initInfisical()
  console.log('✅ Infisical initialized')

  const SUPABASE_URL = secrets['SUPABASE_URL']
  const SUPABASE_SERVICE_KEY = secrets['SUPABASE_SERVICE_KEY'] || secrets['SUPABASE_SERVICE_ROLE_KEY']

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ SUPABASE_URL or SUPABASE_SERVICE_KEY not found in Infisical')
    process.exit(1)
  }

  console.log('🔗 Connecting to Supabase...')
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  console.log('📋 Checking model_trainings table schema...')

  // Check if column already exists by trying to select it
  const { error: checkError } = await supabase
    .from('model_trainings')
    .select('is_ru')
    .limit(1)

  if (!checkError) {
    console.log('✅ Column is_ru already exists!')
    return
  }

  console.log('⚠️ Column is_ru not found, attempting to add...')

  // Try to add column via RPC
  const { error: alterError } = await supabase.rpc('execute_sql', {
    query: `ALTER TABLE model_trainings ADD COLUMN IF NOT EXISTS is_ru BOOLEAN DEFAULT true;`
  })

  if (alterError) {
    console.error('❌ Error adding column via RPC:', alterError.message)
    console.log('\n' + '='.repeat(60))
    console.log('📝 MANUAL MIGRATION REQUIRED')
    console.log('='.repeat(60))
    console.log('\nRun this SQL in Supabase SQL Editor:')
    console.log('Dashboard: https://supabase.com/dashboard\n')
    console.log(`
-- Migration: Add is_ru column to model_trainings
ALTER TABLE model_trainings
ADD COLUMN IF NOT EXISTS is_ru BOOLEAN DEFAULT true;

COMMENT ON COLUMN model_trainings.is_ru IS 'Language preference: true = Russian, false = English';

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';
    `)
    console.log('='.repeat(60))
    return
  }

  console.log('✅ Column is_ru added successfully!')
}

addIsRuColumn().catch(err => {
  console.error('❌ Migration failed:', err.message)
  process.exit(1)
})
