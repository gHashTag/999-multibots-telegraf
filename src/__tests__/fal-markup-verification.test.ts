/**
 * Тесты для проверки централизованной наценки Fal.ai Veed Fabric 1.0 Fast
 * Проверяем, что применяется наценка 50% (MARKUP_MULTIPLIER = 1.5)
 */

import { describe, it, expect } from 'bun:test'
import { calculateLipSyncCostStars } from '@/config/lipsync-models.config'
import { FalVeedFabricProvider } from '@/core/lipsync/providers/fal-veed-fabric-provider'
import { MARKUP_MULTIPLIER, STAR_COST_USD } from '@/config/unified-pricing.config'

describe('Fal.ai Veed Fabric 1.0 Fast - Проверка наценки', () => {
  describe('Централизованная наценка', () => {
    it('должен применять наценку 50% к базовым ценам', () => {
      const duration = 10 // 10 секунд
      
      // Базовые цены Fal.ai
      const basePrice480p = 0.1 // $0.10/сек
      const basePrice720p = 0.2 // $0.20/сек
      
      // Ожидаемые цены с наценкой 50%
      const expectedPrice480p = basePrice480p * MARKUP_MULTIPLIER // $0.15/сек
      const expectedPrice720p = basePrice720p * MARKUP_MULTIPLIER // $0.30/сек
      
      // Ожидаемые звезды с наценкой
      const expectedStars480p = Math.floor((expectedPrice480p * duration) / STAR_COST_USD)
      const expectedStars720p = Math.floor((expectedPrice720p * duration) / STAR_COST_USD)
      
      // Фактические звезды
      const actualStars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const actualStars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      expect(actualStars480p).toBe(expectedStars480p)
      expect(actualStars720p).toBe(expectedStars720p)
    })

    it('должен быть дороже чем цены без наценки', () => {
      const duration = 10
      
      // Цены без наценки
      const priceWithoutMarkup480p = Math.ceil((0.1 * duration) / STAR_COST_USD)
      const priceWithoutMarkup720p = Math.ceil((0.2 * duration) / STAR_COST_USD)
      
      // Цены с наценкой
      const priceWithMarkup480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const priceWithMarkup720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      expect(priceWithMarkup480p).toBeGreaterThan(priceWithoutMarkup480p)
      expect(priceWithMarkup720p).toBeGreaterThan(priceWithoutMarkup720p)
    })

    it('должен использовать правильный множитель наценки', () => {
      expect(MARKUP_MULTIPLIER).toBe(1.5) // 50% наценка
      expect(STAR_COST_USD).toBe(0.016) // $0.016 за звезду
    })
  })

  describe('Провайдер FalVeedFabricProvider', () => {
    it('должен применять наценку в calculateCost', () => {
      const provider = new FalVeedFabricProvider()
      
      // Тестируем через рефлексию (приватный метод)
      const cost480p = (provider as any).calculateCost('480p')
      const cost720p = (provider as any).calculateCost('720p')
      
      // Базовые цены
      const baseCost480p = 0.1
      const baseCost720p = 0.2
      
      // Ожидаемые цены с наценкой
      const expectedCost480p = baseCost480p * MARKUP_MULTIPLIER
      const expectedCost720p = baseCost720p * MARKUP_MULTIPLIER
      
      expect(cost480p).toBe(expectedCost480p)
      expect(cost720p).toBe(expectedCost720p)
    })
  })

  describe('Сравнение с другими моделями', () => {
    it('должен быть конкурентоспособным с kie провайдером', () => {
      const duration = 10
      
      // Kie провайдер: 14⭐/сек
      const kieStars = 14 * duration // 140⭐
      
      // Fal провайдер с наценкой
      const falStars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const falStars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // Fal 720p должен быть дороже kie, но не намного
      expect(falStars720p).toBeGreaterThan(kieStars)
      expect(falStars720p).toBeLessThan(kieStars * 1.5) // Не более чем в 1.5 раза дороже
      
      // Fal 480p должен быть дешевле kie
      expect(falStars480p).toBeLessThan(kieStars)
    })
  })

  describe('Валидация наценки', () => {
    it('должен иметь разумную наценку для коротких видео', () => {
      const duration = 5
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 5 секунд с наценкой не должны быть слишком дорогими
      expect(stars480p).toBeLessThan(50) // Меньше 50⭐ за 5 сек
      expect(stars720p).toBeLessThan(100) // Меньше 100⭐ за 5 сек
    })

    it('должен иметь разумную наценку для длинных видео', () => {
      const duration = 60 // 1 минута
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 60 секунд с наценкой не должны быть слишком дорогими
      expect(stars480p).toBeLessThan(600) // Меньше 600⭐ за 60 сек
      expect(stars720p).toBeLessThan(1200) // Меньше 1200⭐ за 60 сек
    })
  })

  describe('Математическая проверка наценки', () => {
    it('должен правильно рассчитывать наценку 50%', () => {
      const basePrice = 0.1 // $0.10
      const markupPrice = basePrice * MARKUP_MULTIPLIER // $0.15
      
      expect(markupPrice).toBeCloseTo(0.15, 2) // Используем toBeCloseTo для плавающей точки
      expect(markupPrice / basePrice).toBeCloseTo(1.5, 2) // 50% наценка
    })

    it('должен правильно конвертировать в звезды с наценкой', () => {
      const duration = 1
      const basePrice = 0.1 // $0.10/сек
      const markupPrice = basePrice * MARKUP_MULTIPLIER // $0.15/сек
      const totalCost = markupPrice * duration // $0.15
      const stars = Math.floor(totalCost / STAR_COST_USD) // 9⭐
      
      const actualStars = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      
      expect(actualStars).toBe(stars)
    })
  })
})
