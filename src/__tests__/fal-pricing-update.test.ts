/**
 * Тесты для обновленных цен Fal.ai Veed Fabric 1.0 Fast
 * Проверяем правильность расчета стоимости
 */

import { describe, it, expect } from 'bun:test'
import { calculateLipSyncCostStars } from '@/config/lipsync-models.config'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'

describe('Fal.ai Veed Fabric 1.0 Fast - Обновленные цены', () => {
  describe('Расчет стоимости в звездах', () => {
    it('должен правильно рассчитывать стоимость для 480p', () => {
      const duration = 10 // 10 секунд
      const stars = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      )

      // Базовая цена: $0.10/сек × 10 сек = $1.00
      // С наценкой 50%: $1.00 × 1.5 = $1.50
      // $1.50 / $0.016 = 93.75⭐ ≈ 93⭐
      expect(stars).toBe(93)
    })

    it('должен правильно рассчитывать стоимость для 720p', () => {
      const duration = 10 // 10 секунд
      const stars = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // Базовая цена: $0.20/сек × 10 сек = $2.00
      // С наценкой 50%: $2.00 × 1.5 = $3.00
      // $3.00 / $0.016 = 187.5⭐ ≈ 187⭐
      expect(stars).toBe(187)
    })

    it('должен правильно рассчитывать стоимость для коротких видео', () => {
      const duration = 5 // 5 секунд
      const stars480p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      )
      const stars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // 480p: $0.10/сек × 5 сек × 1.5 наценка = $0.75 → $0.75 / $0.016 = 46.875⭐ ≈ 46⭐
      expect(stars480p).toBe(46)

      // 720p: $0.20/сек × 5 сек × 1.5 наценка = $1.50 → $1.50 / $0.016 = 93.75⭐ ≈ 93⭐
      expect(stars720p).toBe(93)
    })

    it('должен правильно рассчитывать стоимость для длинных видео', () => {
      const duration = 30 // 30 секунд
      const stars480p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      )
      const stars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // 480p: $0.10/сек × 30 сек × 1.5 наценка = $4.50 → $4.50 / $0.016 = 281.25⭐ ≈ 281⭐
      expect(stars480p).toBe(281)

      // 720p: $0.20/сек × 30 сек × 1.5 наценка = $9.00 → $9.00 / $0.016 = 562.5⭐ ≈ 562⭐
      expect(stars720p).toBe(562)
    })
  })

  describe('Сравнение с другими моделями', () => {
    it('должен быть дороже чем старые цены', () => {
      const duration = 10

      // Старые цены (неправильные)
      const oldStars480p = Math.ceil((0.03 * duration) / 0.016) // 19⭐
      const oldStars720p = Math.ceil((0.045 * duration) / 0.016) // 29⭐

      // Новые цены (правильные)
      const newStars480p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      ) // 63⭐
      const newStars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      ) // 125⭐

      expect(newStars480p).toBeGreaterThan(oldStars480p)
      expect(newStars720p).toBeGreaterThan(oldStars720p)
    })

    it('с наценкой 50% стал дороже чем kie провайдер', () => {
      const duration = 10

      // Kie провайдер: 14⭐/сек
      const kieStars = 14 * duration // 140⭐

      // Fal провайдер 720p: 125⭐
      const falStars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // С наценкой 50% Fal становится дороже Kie, поэтому сравнение меняется
      expect(falStars720p).toBeGreaterThan(kieStars)
    })
  })

  describe('Провайдер FalVeedFabricProvider', () => {
    it('должен использовать правильные цены в calculateCost', () => {
      const provider = new FalVeedFabricProvider()

      // Метод, считающий цену ПО РАЗРЕШЕНИЮ, называется
      // calculateCostByResolution. Публичный calculateCost принимает
      // (durationSeconds, modelId) — вызов calculateCost('480p') умножал
      // цену на строку и возвращал NaN, поэтому проверка цен молча не
      // работала. См. fal-veed-fabric-provider.ts:429 и :444.
      const cost480p = (provider as any).calculateCostByResolution('480p')
      const cost720p = (provider as any).calculateCostByResolution('720p')

      // Цены с наценкой 50% в провайдере (используем toBeCloseTo для floating point)
      expect(cost480p).toBeCloseTo(0.15, 2) // $0.15/сек для 480p (с наценкой)
      expect(cost720p).toBeCloseTo(0.3, 2) // $0.30/сек для 720p (с наценкой)
    })
  })

  describe('Валидация цен', () => {
    it('должен иметь разумные цены для коротких видео', () => {
      const duration = 5
      const stars480p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      )
      const stars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // 5 секунд не должны быть слишком дорогими
      expect(stars480p).toBeLessThan(50) // Меньше 50⭐ за 5 сек
      expect(stars720p).toBeLessThan(100) // Меньше 100⭐ за 5 сек
    })

    it('должен иметь разумные цены для длинных видео', () => {
      const duration = 60 // 1 минута
      const stars480p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '480p'
      )
      const stars720p = calculateLipSyncCostStars(
        'fal_veed_fabric',
        duration,
        '720p'
      )

      // 60 секунд с наценкой 50%:
      // 480p: $0.15/сек × 60 = $9.00 → 562.5⭐
      // 720p: $0.30/сек × 60 = $18.00 → 1125⭐
      expect(stars480p).toBeLessThan(600) // Меньше 600⭐ за 60 сек
      expect(stars720p).toBeLessThan(1200) // Меньше 1200⭐ за 60 сек
    })
  })
})
