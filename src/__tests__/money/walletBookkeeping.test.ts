/**
 * The balance screen showed a user a 102 251⭐ expense they never made — the
 * wallet carry debit, rendered as "Unknown". These tests pin the rule that
 * keeps bookkeeping out of a person's spending, and pin that it stays narrow
 * enough not to hide anything they really bought.
 */

import { describe, it, expect } from 'vitest'
import {
  isWalletBookkeepingRow,
  realSpending,
} from '@/core/money/walletBookkeeping'

describe('wallet bookkeeping is not shown to the user as spending', () => {
  describe('isWalletBookkeepingRow', () => {
    it('matches the carry debit', () => {
      expect(
        isWalletBookkeepingRow({
          type: 'MONEY_OUTCOME',
          is_system_payment: true,
          service_type: null,
        })
      ).toBe(true)
    })

    it('matches the admin-grant clawback', () => {
      // Same shape: a system row with no service behind it.
      expect(
        isWalletBookkeepingRow({ is_system_payment: true, service_type: '' })
      ).toBe(true)
    })

    it('leaves a real purchase alone', () => {
      expect(
        isWalletBookkeepingRow({
          type: 'MONEY_OUTCOME',
          is_system_payment: false,
          service_type: 'image_to_video',
        })
      ).toBe(false)
    })

    it('does not hide a system row that names a service', () => {
      // Refunds and internal service charges are flagged as system payments too.
      // Hiding those would understate what a person actually spent, which is the
      // same class of lie in the other direction.
      expect(
        isWalletBookkeepingRow({
          is_system_payment: true,
          service_type: 'neuro_photo',
        })
      ).toBe(false)
    })

    it('does not hide an ordinary row that merely lacks a service_type', () => {
      // Old rows predate the column being filled in. They are still purchases.
      expect(
        isWalletBookkeepingRow({ is_system_payment: null, service_type: null })
      ).toBe(false)
    })
  })

  describe('realSpending', () => {
    it('drops the bookkeeping rows and keeps the rest in order', () => {
      const rows = [
        { stars: 19, is_system_payment: false, service_type: 'image_to_video' },
        { stars: 102251, is_system_payment: true, service_type: null },
        {
          stars: 11.25,
          is_system_payment: false,
          service_type: 'text_to_speech',
        },
      ]
      expect(realSpending(rows).map(r => r.stars)).toEqual([19, 11.25])
    })
  })
})
