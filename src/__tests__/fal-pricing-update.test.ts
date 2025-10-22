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
      const stars = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      
      // $0.10/сек × 10 сек = $1.00
      // $1.00 / $0.016 = 62.5⭐ ≈ 63⭐
      expect(stars).toBe(63)
    })

    it('должен правильно рассчитывать стоимость для 720p', () => {
      const duration = 10 // 10 секунд
      const stars = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // $0.20/сек × 10 сек = $2.00
      // $2.00 / $0.016 = 125⭐
      expect(stars).toBe(125)
    })

    it('должен правильно рассчитывать стоимость для коротких видео', () => {
      const duration = 5 // 5 секунд
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 480p: $0.10/сек × 5 сек = $0.50 → $0.50 / $0.016 = 31.25⭐ ≈ 32⭐
      expect(stars480p).toBe(32)
      
      // 720p: $0.20/сек × 5 сек = $1.00 → $1.00 / $0.016 = 62.5⭐ ≈ 63⭐
      expect(stars720p).toBe(63)
    })

    it('должен правильно рассчитывать стоимость для длинных видео', () => {
      const duration = 30 // 30 секунд
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 480p: $0.10/сек × 30 сек = $3.00 → $3.00 / $0.016 = 187.5⭐ ≈ 188⭐
      expect(stars480p).toBe(188)
      
      // 720p: $0.20/сек × 30 сек = $6.00 → $6.00 / $0.016 = 375⭐
      expect(stars720p).toBe(375)
    })
  })

  describe('Сравнение с другими моделями', () => {
    it('должен быть дороже чем старые цены', () => {
      const duration = 10
      
      // Старые цены (неправильные)
      const oldStars480p = Math.ceil((0.03 * duration) / 0.016) // 19⭐
      const oldStars720p = Math.ceil((0.045 * duration) / 0.016) // 29⭐
      
      // Новые цены (правильные)
      const newStars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p') // 63⭐
      const newStars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p') // 125⭐
      
      expect(newStars480p).toBeGreaterThan(oldStars480p)
      expect(newStars720p).toBeGreaterThan(oldStars720p)
    })

    it('должен быть дешевле чем kie провайдер', () => {
      const duration = 10
      
      // Kie провайдер: 14⭐/сек
      const kieStars = 14 * duration // 140⭐
      
      // Fal провайдер 720p: 125⭐
      const falStars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      expect(falStars720p).toBeLessThan(kieStars)
    })
  })

  describe('Провайдер FalVeedFabricProvider', () => {
    it('должен использовать правильные цены в calculateCost', () => {
      const provider = new FalVeedFabricProvider()
      
      // Тестируем через рефлексию (приватный метод)
      const cost480p = (provider as any).calculateCost('480p')
      const cost720p = (provider as any).calculateCost('720p')
      
      expect(cost480p).toBe(0.10) // $0.10/сек для 480p
      expect(cost720p).toBe(0.20) // $0.20/сек для 720p
    })
  })

  describe('Валидация цен', () => {
    it('должен иметь разумные цены для коротких видео', () => {
      const duration = 5
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 5 секунд не должны быть слишком дорогими
      expect(stars480p).toBeLessThan(50) // Меньше 50⭐ за 5 сек
      expect(stars720p).toBeLessThan(100) // Меньше 100⭐ за 5 сек
    })

    it('должен иметь разумные цены для длинных видео', () => {
      const duration = 60 // 1 минута
      const stars480p = calculateLipSyncCostStars('fal_veed_fabric', duration, '480p')
      const stars720p = calculateLipSyncCostStars('fal_veed_fabric', duration, '720p')
      
      // 60 секунд не должны быть слишком дорогими
      expect(stars480p).toBeLessThan(400) // Меньше 400⭐ за 60 сек
      expect(stars720p).toBeLessThan(800) // Меньше 800⭐ за 60 сек
    })
  })
})
