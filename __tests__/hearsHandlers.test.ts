import { describe, it, expect, beforeAll, jest } from '@jest/globals'

// Mock dependencies and environment for hearsHandlers
jest.mock('@/bot', () => ({ composer: { hears: jest.fn() } }))
jest.mock('@/helpers/language', () => ({ isRussian: jest.fn() }))
jest.mock('@/services/generateTextToImage', () => ({ generateTextToImage: jest.fn() }))
jest.mock('@/services/generateNeuroImage', () => ({ generateNeuroImage: jest.fn() }))
jest.mock('@/handlers', () => ({ handleSizeSelection: jest.fn() }))
jest.mock('@/core/supabase', () => ({ getReferalsCountAndUserData: jest.fn() }))
jest.mock('@/menu/imageModelMenu', () => ({ imageModelMenu: jest.fn() }))
// Provide a Proxy for levels array so any index returns titles
jest.mock('@/menu', () => {
  const levels = new Proxy([], {
    get: (_target, _prop) => ({ title_ru: '', title_en: '' }),
  })
  return { levels, mainMenu: [] }
})

// Import the module under test (this triggers composer.hears calls)
import '@/hearsHandlers'

describe('hearsHandlers registration', () => {
  let composer: any
  beforeAll(() => {
    const bot = require('@/bot')
    composer = bot.composer
  })

  it('registers help handler', () => {
    expect(composer.hears).toHaveBeenCalledWith(['❓ Помощь', '❓ Help'], expect.any(Function))
  })

  it('registers numeric button handler', () => {
    expect(composer.hears).toHaveBeenCalledWith(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], expect.any(Function))
  })

  it('registers prompt improvement handler', () => {
    expect(composer.hears).toHaveBeenCalledWith(['⬆️ Улучшить промпт', '⬆️ Improve prompt'], expect.any(Function))
  })

  it('registers change size handler', () => {
    expect(composer.hears).toHaveBeenCalledWith(['📐 Изменить размер', '📐 Change size'], expect.any(Function))
  })

  it('registers main menu handler', () => {
    expect(composer.hears).toHaveBeenCalledWith(['🏠 Главное меню', '🏠 Main menu'], expect.any(Function))
  })
})

// --------------------------------------------------------------------------
// Callbacks behavior tests
import makeMockContext from './utils/mockTelegrafContext'
import { levels } from '@/menu'
describe('hearsHandlers callbacks', () => {
  // composer.hears was mocked above; callbacks are in its mock.calls
  const composerMock = require('@/bot').composer as any

  it('digital avatar body callback sets session and enters checkBalanceScene', async () => {
    // Find the callback registered for levels[1]
    const call = composerMock.hears.mock.calls.find(
      (c: any) => Array.isArray(c[0]) && c[0][0] === levels[1].title_ru
    )
    expect(call).toBeDefined()
    const handler = call![1]
    // Prepare mock context
    const ctx = makeMockContext()
    ctx.session = {}
    ctx.scene.enter = jest.fn()
    // Invoke handler
    await handler(ctx)
    expect(ctx.session.mode).toBe('digital_avatar_body')
    expect(ctx.scene.enter).toHaveBeenCalledWith('checkBalanceScene')
  })

  it('generate new video callback replies when mode invalid', async () => {
    // Find the callback for '🎥 Сгенерировать новое видео?'
    const newVidCall = composerMock.hears.mock.calls.find(
      (c: any) => Array.isArray(c[0]) && c[0][0] === '🎥 Сгенерировать новое видео?'
    )
    expect(newVidCall).toBeDefined()
    const handler = newVidCall![1]
    const ctx = makeMockContext()
    ctx.session = { mode: 'text_to_image' }
    ctx.reply = jest.fn()
    // Invoke handler
    await handler(ctx)
    // English branch (isRussian default mock => false)
    expect(ctx.reply).toHaveBeenCalledWith(
      'You cannot generate a new video in this mode'
    )
  })
})
})