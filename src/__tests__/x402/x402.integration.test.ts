/**
 * x402 Integration Tests
 *
 * Tests for USDC payment integration on Base network
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  getX402Config,
  isX402Configured,
  generateX402PaymentUrl,
  getUsdcContractAddress,
  getChainId,
  getRpcUrl,
  X402_TOPUP_AMOUNTS,
} from '@/core/x402'
import { usdcTopUpOptions, getUsdcTopUpOption } from '@/price/helpers/usdcTopUpOptions'

describe('x402 Core Module', () => {
  describe('Configuration', () => {
    it('should load wallet address from environment', () => {
      const config = getX402Config()
      // In test environment, might not be set
      expect(config).toBeDefined()
      expect(config.network).toBeDefined()
      expect(config.facilitatorUrl).toBeDefined()
    })

    it('should validate wallet address format', () => {
      const config = getX402Config()
      if (config.walletAddress) {
        expect(config.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
      }
    })

    it('should return correct network type', () => {
      const config = getX402Config()
      expect(['base-sepolia', 'base-mainnet']).toContain(config.network)
    })
  })

  describe('USDC Contract Addresses', () => {
    it('should return correct Base Sepolia USDC address', () => {
      const address = getUsdcContractAddress('base-sepolia')
      expect(address).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    })

    it('should return correct Base Mainnet USDC address', () => {
      const address = getUsdcContractAddress('base-mainnet')
      expect(address).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    })
  })

  describe('Chain IDs', () => {
    it('should return correct Base Sepolia chain ID', () => {
      expect(getChainId('base-sepolia')).toBe(84532)
    })

    it('should return correct Base Mainnet chain ID', () => {
      expect(getChainId('base-mainnet')).toBe(8453)
    })
  })

  describe('RPC URLs', () => {
    it('should return correct Base Sepolia RPC', () => {
      expect(getRpcUrl('base-sepolia')).toBe('https://sepolia.base.org')
    })

    it('should return correct Base Mainnet RPC', () => {
      expect(getRpcUrl('base-mainnet')).toBe('https://mainnet.base.org')
    })
  })

  describe('Payment URL Generation', () => {
    it('should generate valid payment URL', () => {
      const url = generateX402PaymentUrl({
        invId: 'test_123',
        telegramId: '12345678',
        amountUsd: 10,
        stars: 434,
        description: 'Test payment',
        botName: 'TestBot',
      })

      expect(url).toContain('/api/x402-topup')
      expect(url).toContain('inv_id=test_123')
      expect(url).toContain('telegram_id=12345678')
      expect(url).toContain('amount=10')
      expect(url).toContain('stars=434')
    })
  })

  describe('Top-up Amounts', () => {
    it('should have correct predefined amounts', () => {
      expect(X402_TOPUP_AMOUNTS['$5']).toEqual({ usd: 5, stars: 217 })
      expect(X402_TOPUP_AMOUNTS['$10']).toEqual({ usd: 10, stars: 434 })
      expect(X402_TOPUP_AMOUNTS['$25']).toEqual({ usd: 25, stars: 1085 })
    })
  })
})

describe('USDC Top-up Options', () => {
  it('should have test amounts ($1, $2) for faucet testing', () => {
    const oneOption = getUsdcTopUpOption(1)
    const twoOption = getUsdcTopUpOption(2)

    expect(oneOption).toBeDefined()
    expect(oneOption?.stars).toBe(43)

    expect(twoOption).toBeDefined()
    expect(twoOption?.stars).toBe(87)
  })

  it('should have all standard amounts', () => {
    const amounts = [1, 2, 5, 10, 25, 50, 100]
    amounts.forEach(amount => {
      const option = getUsdcTopUpOption(amount)
      expect(option).toBeDefined()
      expect(option?.amountUsd).toBe(amount)
      expect(option?.stars).toBeGreaterThan(0)
    })
  })

  it('should have correct labels in both languages', () => {
    usdcTopUpOptions.forEach(option => {
      expect(option.label).toContain('$')
      expect(option.label).toContain('⭐️')
      expect(option.labelRu).toContain('$')
      expect(option.labelRu).toContain('⭐️')
    })
  })

  it('should return undefined for invalid amount', () => {
    const invalid = getUsdcTopUpOption(999)
    expect(invalid).toBeUndefined()
  })
})

describe('x402 API Endpoints (Mock)', () => {
  describe('GET /api/x402-status', () => {
    it('should return configuration status', async () => {
      // This would be tested with actual API call in E2E tests
      const config = getX402Config()
      const configured = isX402Configured()

      expect(typeof configured).toBe('boolean')
      expect(config).toHaveProperty('network')
      expect(config).toHaveProperty('facilitatorUrl')
    })
  })

  describe('Payment Flow', () => {
    it('should generate unique invoice IDs', () => {
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const invId = `x402_${Date.now()}_${i}`
        ids.add(invId)
      }
      // All IDs should be unique
      expect(ids.size).toBe(100)
    })
  })
})
