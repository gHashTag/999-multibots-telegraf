import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables
config({ path: path.join(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const USER_TELEGRAM_ID = '1047716284'

async function grantNeuroVideoAccess() {
  console.log('🚀 Granting NeuroVideo access to user:', USER_TELEGRAM_ID)

  try {
    // 1. Check if user exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', USER_TELEGRAM_ID)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error fetching user:', userError)
      throw userError
    }

    if (!existingUser) {
      console.log('📝 Creating new admin user...')
      
      // Create new user with full access
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: USER_TELEGRAM_ID,
          first_name: 'Admin',
          username: 'admin_user',
          is_bot: false,
          subscription: 'NeuroVideo',
          vip: true,
          level: 1000, // High level for admin
          count: 100000, // High count for unlimited usage
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (createError) {
        console.error('Error creating user:', createError)
        throw createError
      }
      
      console.log('✅ Admin user created successfully')
      console.log('User ID:', newUser.id)
      console.log('Telegram ID:', newUser.telegram_id)
      console.log('Subscription:', newUser.subscription)
      console.log('VIP:', newUser.vip)
    } else {
      console.log('✅ User found, updating subscription...')
      
      // Update existing user
      const { error: updateError } = await supabase
        .from('users')
        .update({
          subscription: 'NeuroVideo',
          vip: true,
          level: existingUser.level || 1000,
          count: 100000, // Reset count for unlimited usage
          updated_at: new Date().toISOString()
        })
        .eq('telegram_id', USER_TELEGRAM_ID)

      if (updateError) {
        console.error('Error updating user:', updateError)
        throw updateError
      }
      
      console.log('✅ User subscription updated successfully')
      console.log('User ID:', existingUser.id)
      console.log('Telegram ID:', existingUser.telegram_id)
      console.log('Subscription: NeuroVideo')
      console.log('VIP: true')
    }

    // Verify the update
    const { data: verifyUser, error: verifyError } = await supabase
      .from('users')
      .select('telegram_id, subscription, vip, level, count')
      .eq('telegram_id', USER_TELEGRAM_ID)
      .single()

    if (!verifyError && verifyUser) {
      console.log('\n✅ Verification successful:')
      console.log('Current user status:', verifyUser)
    }

    console.log('\n🎉 Successfully granted NeuroVideo access and admin privileges to user:', USER_TELEGRAM_ID)
    console.log('The user now has:')
    console.log('- Admin privileges (added to ADMIN_TELEGRAM_ID in .env)')
    console.log('- NeuroVideo subscription')
    console.log('- VIP status')
    console.log('- Unlimited usage count')

  } catch (error) {
    console.error('❌ Error granting access:', error)
    process.exit(1)
  }
}

grantNeuroVideoAccess()