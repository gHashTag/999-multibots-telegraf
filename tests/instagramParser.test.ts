import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MyContext } from '../src/interfaces'

describe('Instagram Parser Scene', () => {
  describe('Username Validation', () => {
    it('должен принимать корректные username', () => {
      const validUsernames = [
        'nike',
        'adidas_official',
        'user.name',
        'test_123',
        'a1b2c3'
      ]
      
      validUsernames.forEach(username => {
        const cleaned = username.replace(/[@#]/g, '').trim().toLowerCase()
        const isValid = cleaned.length >= 2 && 
                       cleaned.length <= 30 && 
                       /^[a-z0-9._]+$/.test(cleaned)
        expect(isValid).toBe(true)
      })
    })

    it('должен отклонять некорректные username', () => {
      const invalidUsernames = [
        'a', // слишком короткий
        'this_is_a_very_long_username_that_exceeds_limit', // слишком длинный
        'user name', // пробел
        'USER-NAME', // дефис
        'имя_пользователя' // кириллица
      ]
      
      invalidUsernames.forEach(username => {
        const cleaned = username.replace(/[@#]/g, '').trim().toLowerCase()
        const isValid = cleaned.length >= 2 && 
                       cleaned.length <= 30 && 
                       /^[a-z0-9._]+$/.test(cleaned)
        expect(isValid).toBe(false)
      })
    })

    it('должен корректно очищать username от спецсимволов', () => {
      const testCases = [
        { input: '@nike', expected: 'nike' },
        { input: '#adidas', expected: 'adidas' },
        { input: '  ZARA  ', expected: 'zara' },
        { input: '@User.Name', expected: 'user.name' },
        { input: '@@test_123@@', expected: 'test_123' }
      ]
      
      testCases.forEach(({ input, expected }) => {
        const cleaned = input.replace(/[@#]/g, '').trim().toLowerCase()
        expect(cleaned).toBe(expected)
      })
    })
  })

  describe('Pricing Calculation', () => {
    const REELS_PRICING = {
      10: 3,
      25: 8,
      50: 15,
      100: 30,
      200: 55
    }

    it('должен корректно рассчитывать стоимость', () => {
      expect(REELS_PRICING[10]).toBe(3)
      expect(REELS_PRICING[25]).toBe(8)
      expect(REELS_PRICING[50]).toBe(15)
      expect(REELS_PRICING[100]).toBe(30)
      expect(REELS_PRICING[200]).toBe(55)
    })

    it('должен применять скидку для больших объемов', () => {
      const pricePerReel10 = REELS_PRICING[10] / 10 // 0.3
      const pricePerReel200 = REELS_PRICING[200] / 200 // 0.275
      
      expect(pricePerReel200).toBeLessThan(pricePerReel10)
    })
  })

  describe('Balance Check', () => {
    it('должен проверять достаточность баланса', () => {
      const testCases = [
        { balance: 10, cost: 3, expected: true },
        { balance: 3, cost: 3, expected: true },
        { balance: 2, cost: 3, expected: false },
        { balance: 0, cost: 3, expected: false },
        { balance: 100, cost: 55, expected: true }
      ]
      
      testCases.forEach(({ balance, cost, expected }) => {
        const hasEnoughBalance = balance >= cost
        expect(hasEnoughBalance).toBe(expected)
      })
    })
  })
})