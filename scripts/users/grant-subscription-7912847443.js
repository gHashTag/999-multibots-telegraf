const { createClient } = require('@supabase/supabase-js')

// Supabase credentials — только из окружения, в коде их быть не должно
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://yuukfqcsdhkyxegfwlcb.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY не задан. Возьмите: railway variables --kv | grep SUPABASE'
  )
  process.exit(1)
}

const TELEGRAM_ID = '7912847443'

async function grantSubscription() {
  console.log('='.repeat(60))
  console.log('GRANTING SUBSCRIPTION TO USER:', TELEGRAM_ID)
  console.log('='.repeat(60))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  try {
    // Step 1: Check if user exists
    console.log('\n[1] Checking user status...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .single()

    if (userError && userError.code !== 'PGRST116') {
      console.error('Error checking user:', userError)
    } else if (userData) {
      console.log('✓ User found in database:')
      console.log('  - Username:', userData.username || 'N/A')
      console.log('  - First Name:', userData.first_name || 'N/A')
      console.log('  - Created:', userData.created_at || 'N/A')
    } else {
      console.log(
        '⚠ User not found in database (will be created on first bot interaction)'
      )
    }

    // Step 2: Check current subscriptions
    console.log('\n[2] Checking current subscriptions...')
    const { data: existingSubs, error: subsError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .in('subscription_type', [
        'NEUROVIDEO',
        'NEUROTESTER',
        'NEUROPHOTO',
        'NEUROBLOGGER',
      ])
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })

    if (subsError) {
      console.error('Error checking subscriptions:', subsError)
    } else if (existingSubs && existingSubs.length > 0) {
      console.log('✓ Found existing subscriptions:')
      existingSubs.forEach(sub => {
        console.log(
          `  - ${sub.subscription_type} (expires: ${sub.subscription_expires_at || 'never'})`
        )
      })
    } else {
      console.log('⚠ No active subscriptions found')
    }

    // Step 3: Check current balance
    console.log('\n[3] Checking current balance...')
    const { data: balanceData, error: balanceError } = await supabase
      .from('payments_v2')
      .select('stars')
      .eq('telegram_id', TELEGRAM_ID)
      .eq('status', 'COMPLETED')
      .in('type', ['STAR_INCOME', 'STAR_SPENDING'])

    if (balanceError) {
      console.error('Error checking balance:', balanceError)
    } else if (balanceData) {
      const totalStars = balanceData.reduce(
        (sum, payment) => sum + (payment.stars || 0),
        0
      )
      console.log(`✓ Current balance: ${totalStars} stars`)
    }

    // Step 4: Grant NEUROVIDEO subscription (30 days)
    console.log('\n[4] Granting NEUROVIDEO subscription (30 days)...')

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days from now

    const subscriptionPayment = {
      telegram_id: TELEGRAM_ID,
      subscription_type: 'NEUROVIDEO',
      status: 'COMPLETED',
      type: 'MONEY_INCOME',
      category: 'BONUS',
      is_system_payment: true,
      payment_method: 'Manual',
      bot_name: 'neuro_blogger_bot',
      description: 'Manual admin grant - standard subscription (NOT ero-video)',
      subscription_expires_at: expiresAt.toISOString(),
      stars: 0,
      currency: 'RUB',
      amount: 0,
      inv_id: `manual_grant_${Date.now()}_${TELEGRAM_ID}`,
      created_at: new Date().toISOString(),
    }

    const { data: insertData, error: insertError } = await supabase
      .from('payments_v2')
      .insert(subscriptionPayment)
      .select()

    if (insertError) {
      console.error('✗ Error granting subscription:', insertError)
      throw insertError
    }

    console.log('✓ Subscription granted successfully!')
    console.log('  - Type: NEUROVIDEO')
    console.log('  - Expires:', expiresAt.toISOString())
    console.log('  - Payment ID:', insertData[0].id)

    // Step 5: Verify the grant
    console.log('\n[5] Verifying subscription grant...')
    const { data: verifyData, error: verifyError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('telegram_id', TELEGRAM_ID)
      .eq('subscription_type', 'NEUROVIDEO')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(1)

    if (verifyError) {
      console.error('Error verifying:', verifyError)
    } else if (verifyData && verifyData.length > 0) {
      console.log('✓ Verification successful:')
      console.log('  - Subscription active')
      console.log('  - Expires:', verifyData[0].subscription_expires_at)
      console.log('  - Created:', verifyData[0].created_at)
    }

    console.log('\n' + '='.repeat(60))
    console.log('SUCCESS: User', TELEGRAM_ID, 'can now use the bot!')
    console.log('Subscription: NEUROVIDEO (standard, NOT ero-video)')
    console.log('Valid until:', expiresAt.toISOString())
    console.log('='.repeat(60))
  } catch (error) {
    console.error('\n✗ FATAL ERROR:', error)
    process.exit(1)
  }
}

grantSubscription()
