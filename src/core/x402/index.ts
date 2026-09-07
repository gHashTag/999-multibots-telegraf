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
/**
 * SETTLEMENT VERIFICATION DOES NOT EXIST IN THIS PROJECT, so nothing can turn an
 * x402 payment into stars. Two independent facts say so, and both are deliberate:
 *
 *   - the credit handlers in api_server/routes/x402.routes.ts refuse with 501,
 *     because telegram_id and stars are taken from the request body and
 *     transaction_hash is only logged. Crediting there would let anyone who
 *     knows a pending inv_id mint balance to any account for any amount;
 *   - that router is not mounted at all -- see routesAreMounted.test.ts, where
 *     x402.routes.ts sits on the known-unmounted list for exactly this reason.
 *
 * MEANWHILE THE BUTTON WAS LIVE. Measured in production on 2026-09-08: twelve
 * X402 rows since December 2025, every one PENDING, not one ever completed.
 * Twelve people pressed pay on a method whose receiving end is switched off on
 * purpose. Two censuses each held half of that -- the route census knew the
 * endpoint was dead, the payment census knew people were paying -- and neither
 * knew about the other.
 *
 * `isX402Configured` cannot answer this: it checks that a wallet address is a
 * well-formed 0x string of 42 characters. That is a question about a variable
 * being SET, not about the path being ALIVE.
 *
 * Flip this constant only together with real settlement verification: the
 * X-PAYMENT header checked against the facilitator, and the amount read from
 * the payments_v2 record rather than from the request.
 */
export const X402_SETTLEMENT_IMPLEMENTED = false

/**
 * Whether x402 may be OFFERED to a person -- that is, whether a payment made
 * this way could ever be credited. Every place that decides to show the USDC
 * button must ask this, not `isX402Configured`.
 */
export function canX402Credit(): boolean {
  return X402_SETTLEMENT_IMPLEMENTED && isX402Configured()
}

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
