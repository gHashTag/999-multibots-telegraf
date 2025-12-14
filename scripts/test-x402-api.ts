#!/usr/bin/env npx ts-node
/**
 * x402 API Integration Test Script
 *
 * Tests the x402 payment endpoints locally
 */

import {
  getX402Config,
  isX402Configured,
  generateX402PaymentUrl,
  getUsdcContractAddress,
  getChainId,
} from '../src/core/x402'
import { usdcTopUpOptions } from '../src/price/helpers/usdcTopUpOptions'

console.log('🧪 x402 Integration Test\n')
console.log('='.repeat(50))

// Test 1: Configuration
console.log('\n📋 1. Configuration Check')
const config = getX402Config()
console.log(`   Wallet Address: ${config.walletAddress || '❌ NOT SET'}`)
console.log(`   Network: ${config.network}`)
console.log(`   Facilitator URL: ${config.facilitatorUrl}`)
console.log(`   Is Configured: ${isX402Configured() ? '✅ YES' : '❌ NO'}`)

// Test 2: Contract Addresses
console.log('\n📋 2. Contract Addresses')
console.log(`   Base Sepolia USDC: ${getUsdcContractAddress('base-sepolia')}`)
console.log(`   Base Mainnet USDC: ${getUsdcContractAddress('base-mainnet')}`)

// Test 3: Chain IDs
console.log('\n📋 3. Chain IDs')
console.log(`   Base Sepolia: ${getChainId('base-sepolia')}`)
console.log(`   Base Mainnet: ${getChainId('base-mainnet')}`)

// Test 4: Top-up Options
console.log('\n📋 4. Available Top-up Options')
usdcTopUpOptions.forEach(opt => {
  console.log(`   ${opt.label}`)
})

// Test 5: Payment URL Generation
console.log('\n📋 5. Payment URL Generation')
const testPaymentUrl = generateX402PaymentUrl({
  invId: `test_${Date.now()}`,
  telegramId: '123456789',
  amountUsd: 2,
  stars: 87,
  description: 'Test payment $2',
  botName: 'TestBot',
})
console.log(`   Generated URL: ${testPaymentUrl}`)

// Test 6: Wallet Validation
console.log('\n📋 6. Wallet Address Validation')
if (config.walletAddress) {
  const isValidFormat = /^0x[a-fA-F0-9]{40}$/.test(config.walletAddress)
  console.log(`   Format Valid: ${isValidFormat ? '✅ YES' : '❌ NO'}`)
  console.log(`   Address: ${config.walletAddress}`)
} else {
  console.log('   ❌ Wallet address not configured')
}

console.log('\n' + '='.repeat(50))
console.log('✅ x402 Integration Test Complete\n')

// Summary
console.log('📊 Summary:')
if (isX402Configured()) {
  console.log('   ✅ x402 is properly configured and ready for testing')
  console.log('\n🔗 Next Steps:')
  console.log('   1. Start the bot: npm run dev')
  console.log('   2. Go to the bot in Telegram')
  console.log('   3. Navigate to Balance > Top Up > Crypto')
  console.log('   4. Select $1 or $2 amount')
  console.log('   5. Click the payment link')
  console.log('   6. Connect MetaMask with Base Sepolia network')
  console.log('   7. Approve the USDC transaction')
  console.log('   8. Check balance update in bot')
} else {
  console.log('   ❌ x402 is NOT configured')
  console.log('\n🔧 Required Environment Variables:')
  console.log('   X402_WALLET_ADDRESS=0x...')
  console.log('   X402_NETWORK=base-sepolia')
  console.log('   X402_FACILITATOR_URL=https://x402.org/facilitator')
}
