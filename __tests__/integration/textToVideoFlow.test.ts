import { describe, it, expect, beforeEach, mock } from 'bun:test'
import { handleMenu } from '../../src/handlers/handleMenu'
import { enterTargetScene } from '../../src/scenes/checkBalanceScene'
import { makeMockContext } from '../utils/mockTelegrafContext'
import { ModeEnum } from '../../src/interfaces/modes'

// Mock dependencies
const mockGetUserDetailsSubscription = mock(() => ({
  isExist: true,
  stars: 1000,
  subscriptionType: 'NEUROVIDEO',
  isSubscriptionActive: true
}))

const mockIsRussianFromState = mock(() => true)
const mockGetUserInfo = mock(() => ({ telegramId: '144022504' }))

mock.module('../../src/core/supabase', () => ({
  getUserDetailsSubscription: mockGetUserDetailsSubscription
}))

mock.module('../../src/helpers/centralizedLanguage', () => ({
  isRussianFromState: mockIsRussianFromState
}))

mock.module('../../src/handlers/getUserInfo', () => ({
  getUserInfo: mockGetUserInfo
}))

describe('Text to Video Flow Integration', () => {
  beforeEach(() => {
    mockGetUserDetailsSubscription.mockClear?.()
    mockIsRussianFromState.mockClear?.()
    mockGetUserInfo.mockClear?.()
    
    mockGetUserDetailsSubscription.mockReturnValue?.({
      isExist: true,
      stars: 1000,
      subscriptionType: 'NEUROVIDEO',
      isSubscriptionActive: true
    })
    mockIsRussianFromState.mockReturnValue?.(true)
    mockGetUserInfo.mockReturnValue?.({ telegramId: '144022504' })
  })

  describe('🎬 Menu Button to Wizard Flow', () => {
    it('should handle "🎥 Видео из текста" button click correctly', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now(),
        chat: ctx.chat,
        text: '🎥 Видео из текста'
      }
      ctx.session.mode = undefined // Start fresh
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      await handleMenu(ctx as any)
      
      // Should set the correct mode
      expect(ctx.session.mode).toBe(ModeEnum.TextToVideo)
      
      // Should enter CheckBalanceScene
      expect(sceneEnterSpy).toHaveBeenCalledWith(ModeEnum.CheckBalanceScene)
    })

    it('should handle "🎥 Video from text" button click (English)', async () => {
      const ctx = makeMockContext()
      ctx.message = {
        message_id: 1,
        date: Date.now(),
        chat: ctx.chat,
        text: '🎥 Video from text'
      }
      ctx.session.mode = undefined
      mockIsRussianFromState.mockReturnValue?.(false)
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      await handleMenu(ctx as any)
      
      expect(ctx.session.mode).toBe(ModeEnum.TextToVideo)
      expect(sceneEnterSpy).toHaveBeenCalledWith(ModeEnum.CheckBalanceScene)
    })
  })

  describe('🎯 CheckBalance to TextToVideo Scene Flow', () => {
    it('should successfully navigate from checkBalance to text_to_video scene', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      // Mock current scene
      ctx.scene.current = { id: ModeEnum.CheckBalanceScene }
      
      await enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)
      
      // Should enter text_to_video scene
      expect(sceneEnterSpy).toHaveBeenCalledWith('text_to_video', expect.any(Object))
    })

    it('should handle insufficient balance correctly', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      // Mock insufficient balance
      mockGetUserDetailsSubscription.mockReturnValue?.({
        isExist: true,
        stars: 10, // Insufficient
        subscriptionType: 'NEUROVIDEO',
        isSubscriptionActive: true
      })
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      await enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 50) // Cost more than balance
      
      // Should show insufficient balance message
      expect(ctx.reply).toHaveBeenCalled()
      // Should NOT enter scene
      expect(sceneEnterSpy).not.toHaveBeenCalled()
    })

    it('should handle user not found', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      // Mock user not found
      mockGetUserDetailsSubscription.mockReturnValue?.({
        isExist: false,
        stars: 0,
        subscriptionType: null,
        isSubscriptionActive: false
      })
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      await enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)
      
      // Should show error message
      expect(ctx.reply).toHaveBeenCalled()
      // Should NOT enter scene
      expect(sceneEnterSpy).not.toHaveBeenCalled()
    })

    it('should handle inactive subscription', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      // Mock inactive subscription
      mockGetUserDetailsSubscription.mockReturnValue?.({
        isExist: true,
        stars: 1000,
        subscriptionType: 'STARS',
        isSubscriptionActive: false
      })
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      await enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)
      
      // Should NOT enter text_to_video scene
      expect(sceneEnterSpy).not.toHaveBeenCalledWith('text_to_video', expect.any(Object))
    })
  })

  describe('🧪 Error Handling Scenarios', () => {
    it('should handle scene enter failure gracefully', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      const sceneEnterSpy = mock(() => {
        throw new Error('Scene enter failed')
      })
      ctx.scene.enter = sceneEnterSpy
      
      // Should not throw error
      await expect(enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)).resolves.not.toThrow()
      
      // Should show error message to user
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      const ctx = makeMockContext()
      ctx.session.mode = ModeEnum.TextToVideo
      
      // Mock database error
      mockGetUserDetailsSubscription.mockImplementation?.(() => {
        throw new Error('Database connection failed')
      })
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      // Should not throw error
      await expect(enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)).resolves.not.toThrow()
      
      // Should show error message to user
      expect(ctx.reply).toHaveBeenCalled()
    })

    it('should handle missing session gracefully', async () => {
      const ctx = makeMockContext()
      ctx.session = undefined // Missing session
      
      const sceneEnterSpy = mock(() => Promise.resolve())
      ctx.scene.enter = sceneEnterSpy
      
      // Should not throw error
      await expect(handleMenu(ctx as any)).resolves.not.toThrow()
    })
  })

  describe('🔄 End-to-End Flow Simulation', () => {
    it('should complete full flow: button click -> checkBalance -> wizard enter', async () => {
      const ctx = makeMockContext()
      const flow: string[] = []
      
      // Track flow steps
      const originalSceneEnter = ctx.scene.enter
      ctx.scene.enter = mock((sceneId: string) => {
        flow.push(`enter:${sceneId}`)
        return Promise.resolve()
      })
      
      // Step 1: User clicks button
      ctx.message = {
        message_id: 1,
        date: Date.now(),
        chat: ctx.chat,
        text: '🎥 Видео из текста'
      }
      
      await handleMenu(ctx as any)
      
      expect(flow).toContain('enter:check_balance_scene')
      expect(ctx.session.mode).toBe(ModeEnum.TextToVideo)
      
      // Step 2: CheckBalance processes and enters wizard
      await enterTargetScene(ctx as any, async () => {}, ModeEnum.TextToVideo, 0)
      
      expect(flow).toContain('enter:text_to_video')
    })
  })

  describe('🎮 Button Text Variations', () => {
    const buttonVariations = [
      '🎥 Видео из текста',
      '🎥 Video from text',
      '🎥 Text to Video',
      '🎬 Видео из текста', // Different emoji
    ]

    buttonVariations.forEach(buttonText => {
      it(`should handle button text variation: "${buttonText}"`, async () => {
        const ctx = makeMockContext()
        ctx.message = {
          message_id: 1,
          date: Date.now(),
          chat: ctx.chat,
          text: buttonText
        }
        
        const sceneEnterSpy = mock(() => Promise.resolve())
        ctx.scene.enter = sceneEnterSpy
        
        await handleMenu(ctx as any)
        
        // Should handle known variations
        if (buttonText.includes('🎥') && (buttonText.includes('Видео из текста') || buttonText.includes('Video from text'))) {
          expect(ctx.session.mode).toBe(ModeEnum.TextToVideo)
          expect(sceneEnterSpy).toHaveBeenCalledWith(ModeEnum.CheckBalanceScene)
        }
      })
    })
  })
})