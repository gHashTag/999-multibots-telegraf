import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import path from 'path'

// Load environment variables
config({ path: path.join(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const USER_TELEGRAM_ID = '1047716284'

async function grantAdminSubscription() {
  console.log('🚀 Granting admin privileges and subscription to user:', USER_TELEGRAM_ID)

  try {
    // 1. Check if user exists
    const { data: existingUser, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', USER_TELEGRAM_ID)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      throw userError
    }

    let userId = existingUser?.id

    // 2. Create user if doesn't exist
    if (!existingUser) {
      console.log('📝 Creating new user...')
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          telegram_id: USER_TELEGRAM_ID,
          first_name: 'Admin',
          created_at: new Date().toISOString(),
          is_premium: true
        })
        .select()
        .single()

      if (createError) throw createError
      userId = newUser.id
      console.log('✅ User created with ID:', userId)
    } else {
      console.log('✅ User found with ID:', userId)
    }

    // 3. Grant NeuroVideo subscription
    const endDate = new Date()
    endDate.setFullYear(endDate.getFullYear() + 10) // 10 years subscription

    // Check existing subscription
    const { data: existingSub, error: subCheckError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('service_type', 'NeuroVideo')
      .single()

    if (subCheckError && subCheckError.code !== 'PGRST116') {
      throw subCheckError
    }

    if (existingSub) {
      // Update existing subscription
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({
          is_active: true,
          end_date: endDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existingSub.id)

      if (updateError) throw updateError
      console.log('✅ NeuroVideo subscription updated')
    } else {
      // Create new subscription
      const { error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          service_type: 'NeuroVideo',
          is_active: true,
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          created_at: new Date().toISOString()
        })

      if (insertError) throw insertError
      console.log('✅ NeuroVideo subscription created')
    }

    // 4. Grant usage rights for video generation
    const usageTypes = [
      { type: 'video_generation', daily_limit: 1000, monthly_limit: 30000 },
      { type: 'image_to_video', daily_limit: 1000, monthly_limit: 30000 },
      { type: 'text_to_video', daily_limit: 1000, monthly_limit: 30000 }
    ]

    for (const usage of usageTypes) {
      const { data: existingUsage } = await supabase
        .from('user_usage')
        .select('*')
        .eq('user_id', userId)
        .eq('usage_type', usage.type)
        .single()

      if (existingUsage) {
        await supabase
          .from('user_usage')
          .update({
            daily_limit: usage.daily_limit,
            monthly_limit: usage.monthly_limit,
            daily_count: 0,
            monthly_count: 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingUsage.id)
      } else {
        await supabase
          .from('user_usage')
          .insert({
            user_id: userId,
            usage_type: usage.type,
            daily_limit: usage.daily_limit,
            monthly_limit: usage.monthly_limit,
            daily_count: 0,
            monthly_count: 0,
            created_at: new Date().toISOString()
          })
      }
    }

    console.log('✅ Usage rights granted')
    console.log('🎉 Successfully granted admin privileges and NeuroVideo subscription to user:', USER_TELEGRAM_ID)

  } catch (error) {
    console.error('❌ Error granting subscription:', error)
    process.exit(1)
  }
}

grantAdminSubscription()