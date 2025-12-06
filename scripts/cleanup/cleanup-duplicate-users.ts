#!/usr/bin/env bun

/**
 * 🧹 BEST PRACTICE: Database maintenance script
 * CLI tool to clean up duplicate users
 */

import { findAllDuplicateUsers, deduplicateUsers } from '../src/core/supabase/deduplicateUsers'
import { logger } from '../src/utils/logger'

async function main() {
  console.log('🧹 Starting duplicate user cleanup...')
  
  try {
    // Find all telegram_ids with duplicates
    const duplicateIds = await findAllDuplicateUsers()
    
    if (duplicateIds.length === 0) {
      console.log('✅ No duplicate users found!')
      return
    }
    
    console.log(`🚨 Found ${duplicateIds.length} telegram_ids with duplicates:`)
    duplicateIds.forEach(id => console.log(`  - ${id}`))
    console.log()
    
    // Ask for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    })
    
    const answer = await new Promise<string>(resolve => {
      readline.question('Do you want to clean up these duplicates? (y/N): ', resolve)
    })
    
    readline.close()
    
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Cleanup cancelled.')
      return
    }
    
    console.log('🧹 Starting cleanup...')
    let successCount = 0
    let errorCount = 0
    
    for (const telegramId of duplicateIds) {
      console.log(`\n🔧 Processing telegram_id: ${telegramId}`)
      
      const success = await deduplicateUsers(telegramId)
      
      if (success) {
        successCount++
        console.log(`  ✅ Cleaned up duplicates for ${telegramId}`)
      } else {
        errorCount++
        console.log(`  ❌ Failed to clean up duplicates for ${telegramId}`)
      }
    }
    
    console.log(`\n📊 Cleanup Summary:`)
    console.log(`  ✅ Success: ${successCount}`)
    console.log(`  ❌ Errors: ${errorCount}`)
    console.log(`  📊 Total processed: ${duplicateIds.length}`)
    
    if (errorCount === 0) {
      console.log('\n🎉 All duplicates cleaned up successfully!')
    } else {
      console.log(`\n⚠️  ${errorCount} telegram_ids had errors. Check logs for details.`)
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error)
    logger.error('[cleanup-duplicate-users] Script failed:', error)
    process.exit(1)
  }
}

// Handle specific telegram_id if provided as argument
if (process.argv[2]) {
  const specificId = process.argv[2]
  console.log(`🎯 Cleaning up specific telegram_id: ${specificId}`)
  
  deduplicateUsers(specificId).then(success => {
    if (success) {
      console.log(`✅ Successfully cleaned up duplicates for ${specificId}`)
    } else {
      console.log(`❌ Failed to clean up duplicates for ${specificId}`)
      process.exit(1)
    }
  }).catch(error => {
    console.error('💥 Error:', error)
    process.exit(1)
  })
} else {
  main().catch(console.error)
}