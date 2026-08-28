/**
 * x402 Protocol Integration
 *
 * Provides USDC payment functionality on Base network using the x402 protocol.
 * https://www.x402.org/
 *
 * Key features:
 * - HTTP 402 Payment Required flow
 * - USDC on Base (Sepolia for testing, Mainnet for production)
 * - Zero fees, 2-second settlement
 * - ERC-3009 gasless transfers
 */

import { logger } from '@/utils/logger'
import { getSecretOrDefault, isInfisicalReady } from '@/core/infisical'

/**
 * x402 Network Configuration
 */
export type X402Network = 'base-sepolia' | 'base-mainnet'

/**
 * x402 Configuration
 */
export interface X402Config {
  walletAddress: string
  network: X402Network
  facilitatorUrl: string
}

/**
 * x402 Payment Request
 */
export interface X402PaymentRequest {
  invId: string
  telegramId: string
  amountUsd: number
  stars: number
  description: string
  botName: string
}

/**
 * x402 Payment Response from facilitator
 */
export interface X402PaymentResponse {
  success: boolean
  transactionHash?: string
  error?: string
}

/**
 * Get x402 configuration from environment or Infisical
 */
export function getX402Config(): X402Config {
  // Try Infisical first (production), then fall back to process.env (local dev)
  let walletAddress: string
  let network: X402Network
  let facilitatorUrl: string

  if (isInfisicalReady()) {
    // Production: load from Infisical
    walletAddress = getSecretOrDefault('X402_WALLET_ADDRESS', '')
    network = getSecretOrDefault('X402_NETWORK', 'base-sepolia') as X402Network
    facilitatorUrl = getSecretOrDefault(
      'X402_FACILITATOR_URL',
      'https://x402.org/facilitator'
    )
  } else {
    // Local development: load from process.env
    walletAddress = process.env.X402_WALLET_ADDRESS || ''
    network = (process.env.X402_NETWORK || 'base-sepolia') as X402Network
    facilitatorUrl =
      process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator'
  }

  if (!walletAddress) {
    logger.warn('[x402] X402_WALLET_ADDRESS not configured')
  }

  return {
    walletAddress,
    network,
    facilitatorUrl,
  }
}

/**
 * Check if x402 is properly configured
 */
export function isX402Configured(): boolean {
  const config = getX402Config()
  return !!(
    config.walletAddress &&
    config.walletAddress.startsWith('0x') &&
    config.walletAddress.length === 42
  )
}

/**
 * Generate x402 payment URL
 *
 * Creates a URL that the user can open in browser to complete payment.
 * The URL points to our x402-enabled endpoint which returns HTTP 402.
 */
export function generateX402PaymentUrl(request: X402PaymentRequest): string {
  // Use BASE_WEBHOOK_URL from Infisical (production) or process.env (local dev)
  let baseUrl: string

  if (isInfisicalReady()) {
    baseUrl = getSecretOrDefault(
      'BASE_WEBHOOK_URL',
      getSecretOrDefault('WEBHOOK_URL', 'https://your-server.com')
    )
  } else {
    baseUrl =
      process.env.BASE_WEBHOOK_URL ||
      process.env.WEBHOOK_URL ||
      'https://your-server.com'
  }

  const params = new URLSearchParams({
    inv_id: request.invId,
    telegram_id: request.telegramId,
    amount: request.amountUsd.toString(),
    stars: request.stars.toString(),
  })

  return `${baseUrl}/api/x402-topup?${params.toString()}`
}

/**
 * Get USDC contract address for the specified network
 */
export function getUsdcContractAddress(network: X402Network): string {
  switch (network) {
    case 'base-sepolia':
      // Circle USDC on Base Sepolia testnet
      return '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    case 'base-mainnet':
      // Circle USDC on Base mainnet
      return '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
    default:
      return '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Default to Sepolia
  }
}

/**
 * Get Base network chain ID
 */
export function getChainId(network: X402Network): number {
  switch (network) {
    case 'base-sepolia':
      return 84532
    case 'base-mainnet':
      return 8453
    default:
      return 84532 // Default to Sepolia
  }
}

/**
 * Get Base network RPC URL
 */
export function getRpcUrl(network: X402Network): string {
  switch (network) {
    case 'base-sepolia':
      return 'https://sepolia.base.org'
    case 'base-mainnet':
      return 'https://mainnet.base.org'
    default:
      return 'https://sepolia.base.org'
  }
}

/**
 * Validate x402 payment header
 *
 * The X-PAYMENT header contains a base64-encoded payment payload
 */
export function validatePaymentHeader(paymentHeader: string): boolean {
  if (!paymentHeader) {
    return false
  }

  try {
    // X-PAYMENT header should be base64-encoded JSON
    const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8')
    const payload = JSON.parse(decoded)

    // Check required fields
    return !!(payload.signature && payload.from && payload.to && payload.amount)
  } catch (error) {
    logger.error('[x402] Invalid payment header', { error })
    return false
  }
}

/**
 * Log x402 payment event
 */
export function logX402Event(
  event: string,
  data: Record<string, unknown>
): void {
  logger.info(`[x402] ${event}`, data)
}

/**
 * x402 price configuration for top-up amounts
 */
export const X402_TOPUP_AMOUNTS = {
  $5: { usd: 5, stars: 217 },
  $10: { usd: 10, stars: 434 },
  $25: { usd: 25, stars: 1085 },
  $50: { usd: 50, stars: 2170 },
  $100: { usd: 100, stars: 4340 },
} as const

export type X402TopUpAmount = keyof typeof X402_TOPUP_AMOUNTS
