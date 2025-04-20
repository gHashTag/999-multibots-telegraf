import { jest, describe, it, expect, beforeEach } from '@jest/globals'
import makeMockContext from '../utils/mockTelegrafContext'

// Mock dependencies
jest.mock('@/commands/priceCommand', () => ({ priceCommand: jest.fn() }))
import { priceCommand } from '@/commands/priceCommand'
import { levels } from '@/menu/mainMenu'
import handleMenu from '@/handlers/handleMenu'

describe('handleMenu', () => {
  let ctx: ReturnType<typeof makeMockContext>
  beforeEach(() => {
    jest.clearAllMocks()
    ctx = makeMockContext()
    // initialize session and scene
    ctx.session = {}
    ctx.scene.enter = jest.fn(() => Promise.resolve())
  })

  it('handles subscription button in Russian', async () => {
    ctx.from = { language_code: 'ru' } as any
    const text = levels[0].title_ru
    ctx.message = { text } as any
    await handleMenu(ctx as any)
    expect(ctx.session.mode).toBe('subscribe')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles subscription button in English', async () => {
    ctx.from = { language_code: 'en' } as any
    const text = levels[0].title_en
    ctx.message = { text } as any
    await handleMenu(ctx as any)
    expect(ctx.session.mode).toBe('subscribe')
    expect(ctx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles slash price command', async () => {
    ctx.from = { language_code: 'en' } as any
    ctx.message = { text: '/price' } as any
    await handleMenu(ctx as any)
    expect(ctx.session.mode).toBe('price')
    expect(priceCommand).toHaveBeenCalledWith(ctx)
  })

  it('does nothing for unknown text', async () => {
    ctx.from = { language_code: 'ru' } as any
    ctx.message = { text: 'unknown' } as any
    await handleMenu(ctx as any)
    expect(ctx.session.mode).toBeUndefined()
    expect(ctx.scene.enter).not.toHaveBeenCalled()
  })
})