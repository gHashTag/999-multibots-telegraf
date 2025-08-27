#!/usr/bin/env npx tsx

/**
 * Script to add bonus stars to a user's balance
 * Usage: npx tsx scripts/add_bonus_stars.ts <user_id> <amount> [reason]
 * Example: npx tsx scripts/add_bonus_stars.ts 223757230 1000 "Bonus for testing and bug reports"
 */

import { updateUserBalance } from '../src/core/supabase/updateUserBalance'
import { getUserBalance } from '../src/core/supabase/getUserBalance'
import { PaymentType } from '../src/interfaces/payments.interface'
import { logger } from '../src/utils/logger'

async function addBonusStars() {
  const args = process.argv.slice(2)
  
  if (args.length < 2) {
    console.log(`
📝 Usage: npx tsx scripts/add_bonus_stars.ts <user_id> <amount> [reason]

Examples:
• npx tsx scripts/add_bonus_stars.ts 223757230 1000 "Bonus for testing"
• npx tsx scripts/add_bonus_stars.ts 223757230 500 "Bug report reward"

💡 Amount should be positive number for adding stars
    `)
    process.exit(1)
  }

  const userId = args[0]
  const amount = parseFloat(args[1])
  const reason = args[2] || 'Bonus stars from admin'

  // Validation
  if (isNaN(amount) || amount <= 0) {
    console.error('❌ Invalid amount. Please specify a positive number')
    process.exit(1)
  }

  if (amount > 10000) {
    console.error('❌ Maximum amount is 10,000 stars')
    process.exit(1)
  }

  try {
    console.log(`⏳ Adding ${amount} stars to user ${userId}...`)
    
    // Get current balance
    const currentBalance = await getUserBalance(userId)
    console.log(`💰 Current balance: ${currentBalance} ⭐`)

    // Add stars to balance
    const result = await updateUserBalance(
      userId,
      amount,
      PaymentType.MONEY_INCOME,
      `Admin bonus: ${reason}`,
      {
        bot_name: 'admin_script',
        service_type: 'admin_bonus',
        payment_method: 'Admin',
        language: 'en',
        operation_id: `admin-bonus-${Date.now()}`,
        admin_id: 'script',
        reason: reason,
        category: 'BONUS',
      }
    )

    if (result) {
      const newBalance = await getUserBalance(userId)
      
      console.log(`✅ Successfully added ${amount} stars!`)
      console.log(`👤 User: ${userId}`)
      console.log(`💰 Balance before: ${currentBalance} ⭐`)
      console.log(`💰 Balance after: ${newBalance} ⭐`)
      console.log(`➕ Added: ${amount} ⭐`)
      console.log(`📝 Reason: ${reason}`)
      
      // Log the operation
      logger.info('💰 Bonus stars added via script', {
        target_user_id: userId,
        amount: amount,
        reason: reason,
        balance_before: currentBalance,
        balance_after: newBalance,
      })
      
    } else {
      console.error('❌ Failed to add stars. Check logs for details.')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Error adding stars:', error instanceof Error ? error.message : 'Unknown error')
    logger.error('❌ Error in bonus stars script', {
      target_user_id: userId,
      amount: amount,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
    process.exit(1)
  }
}

addBonusStars()