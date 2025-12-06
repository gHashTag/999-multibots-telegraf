import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables
config({ path: path.join(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function checkTables() {
  console.log('📊 Checking database tables...')

  try {
    // Check various possible table names
    const tablesToCheck = [
      'subscriptions',
      'subscription',
      'user_subscriptions',
      'user_subscription',
      'payments',
      'payment',
      'successful_payments',
      'users'
    ]

    for (const table of tablesToCheck) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .limit(1)

        if (!error) {
          console.log(`✅ Table '${table}' exists`)
          
          // Get schema for existing tables
          if (data && data.length > 0) {
            console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`)
          }
        } else {
          console.log(`❌ Table '${table}' not found or error: ${error.message}`)
        }
      } catch (e) {
        console.log(`❌ Table '${table}' error: ${e}`)
      }
    }

    // Check successful_payments specifically
    console.log('\n📊 Checking successful_payments table...')
    const { data: payments, error: paymentsError } = await supabase
      .from('successful_payments')
      .select('*')
      .eq('telegram_id', '1047716284')
      .limit(5)

    if (!paymentsError) {
      console.log('✅ successful_payments table exists')
      if (payments && payments.length > 0) {
        console.log('Found payments for user 1047716284:', payments)
      } else {
        console.log('No payments found for user 1047716284')
      }
    } else {
      console.log('❌ Error accessing successful_payments:', paymentsError)
    }

  } catch (error) {
    console.error('❌ Error checking tables:', error)
  }
}

checkTables()