import makeMockContext from '../utils/mockTelegrafContext'
import { defaultSession } from '@/store'

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
    ctx.session = { ...defaultSession }
    ctx.scene.enter = jest.fn(() => Promise.resolve())
  })

  it('handles subscription button in Russian', async () => {
    const text = levels[0].title_ru
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 1,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('subscribe')
    expect(testCtx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles subscription button in English', async () => {
    const text = levels[0].title_en
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 2,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('subscribe')
    expect(testCtx.scene.enter).toHaveBeenCalledWith('subscriptionScene')
  })

  it('handles slash price command', async () => {
    const text = '/price'
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 3,
          language_code: 'en',
          is_bot: false,
          first_name: 'TestEn',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBe('price')
    expect(priceCommand).toHaveBeenCalledWith(testCtx)
  })

  it('does nothing for unknown text', async () => {
    const text = 'unknown'
    const testCtx = makeMockContext({
      message: {
        text,
        from: {
          id: 4,
          language_code: 'ru',
          is_bot: false,
          first_name: 'TestRu',
        },
      },
    } as any)
    testCtx.session = { ...defaultSession }
    testCtx.scene.enter = ctx.scene.enter

    await handleMenu(testCtx as any)
    expect(testCtx.session.mode).toBeUndefined()
    expect(testCtx.scene.enter).not.toHaveBeenCalled()
  })
})
