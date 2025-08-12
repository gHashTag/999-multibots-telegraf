#!/usr/bin/env bun

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
const envPath = resolve(__dirname, '../.env')
config({ path: envPath })

// Import the function from the actual code
import { getUserDetailsSubscription } from '../src/core/supabase'

async function checkUser() {
  const testUserId = '6579515876' // The user we're testing with

  console.log('🔍 Checking user existence...')
  console.log('Telegram ID:', testUserId)

  try {
    const userDetails = await getUserDetailsSubscription(testUserId)

    console.log('\n📊 User Details:')
    console.log('─────────────────────────────')
    console.log('Exists:', userDetails.isExist)
    console.log('User ID:', userDetails.id)
    console.log('Username:', userDetails.username)
    console.log('Created At:', userDetails.created_at)
    console.log('Subscription Type:', userDetails.subscriptionType)
    console.log('Subscription Active:', userDetails.isSubscriptionActive)
    console.log('Stars Balance:', userDetails.stars)
    console.log('Inviter:', userDetails.inviter)
    console.log('─────────────────────────────')

    if (userDetails.isExist) {
      console.log('\n⚠️ User already exists in database!')
      console.log('To test referral system with this user:')
      console.log('1. Delete the user from Supabase')
      console.log('2. Send /start 144022504 to the bot')
    } else {
      console.log('\n✅ User does not exist - ready for testing!')
      console.log('Send "/start 144022504" to the bot to test referral')
    }

    // Also check the inviter
    console.log('\n🔍 Checking inviter (144022504)...')
    const inviterDetails = await getUserDetailsSubscription('144022504')
    console.log('Inviter exists:', inviterDetails.isExist)
    console.log('Inviter UUID:', inviterDetails.id)
  } catch (error) {
    console.error('❌ Error:', error)
  }

  process.exit(0)
}

checkUser()
