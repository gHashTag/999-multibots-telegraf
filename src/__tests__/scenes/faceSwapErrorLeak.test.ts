/**
 * Regression test: when generateFaceSwap fails, the user must NOT see the raw
 * provider error string.
 *
 * generateFaceSwap returns { success:false, error: <raw Replicate message> }.
 * The wizard used to reply `❌ Face swap error: ${result.error}` verbatim, so an
 * internal host / request-id / validation detail — and, because the input URLs
 * embed the bot token, a download error that echoes that URL — was shown to the
 * end user. The raw error is already logged inside generateFaceSwap; the wizard
 * must show a curated message instead (same class as #1030).
 *
 * Drives the REAL wizard step through the scene middleware; captures every
 * outbound message and asserts the secret never reaches the user.
 */
import { describe, it, expect, beforeEach, vi, Mock } from 'vitest'

vi.mock('@/helpers/centralizedLanguage', () => ({
  isRussianFromState: vi.fn(() => false),
}))
vi.mock('@/services/generateFaceSwap', () => ({
  generateFaceSwap: vi.fn(),
}))
vi.mock('@/core/supabase/getUserBalance', () => ({
  getUserBalance: vi.fn(async () => 100),
}))
vi.mock('@/core/supabase/updateUserBalance', () => ({
  updateUserBalance: vi.fn(async () => true),
}))
vi.mock('@/interfaces/payments.interface', () => ({
  PaymentType: { MONEY_OUTCOME: 'money_outcome' },
}))
vi.mock('@/utils/cancelButton', () => ({
  createCancelButton: vi.fn(() => ['Cancel']),
  handleCancelButton: vi.fn(async () => false),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { Context } from 'telegraf'
import { faceSwapWizard } from '@/scenes/faceSwapWizard'
import { generateFaceSwap } from '@/services/generateFaceSwap'

const gen = generateFaceSwap as unknown as Mock

// A raw provider error that embeds the bot token via the echoed input URL.
const SECRET = '7712345678:AAER-ThisIsABotTokenSecret'
const RAW_ERROR = `Replicate download failed: GET https://api.telegram.org/file/bot${SECRET}/photos/x.jpg -> 404 Not Found`

function makeCtx(sent: string[]) {
  const update: any = {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 1, type: 'private' },
      from: { id: 223757230, is_bot: false, first_name: 'U', username: 'u' },
      photo: [{ file_id: 'f1', file_unique_id: 'u1', width: 100, height: 100 }],
    },
  }
  const telegram: any = {
    token: 'TESTTOKEN',
    sendMessage: async (_chatId: number, text: string) => {
      sent.push(String(text))
      return { message_id: 2 }
    },
    sendPhoto: async () => ({ message_id: 3 }),
    getFile: async () => ({ file_path: 'photos/x.jpg' }),
    deleteMessage: async () => true,
  }
  const ctx: any = new Context(update, telegram, {
    username: 'test_bot',
  } as any)
  ctx.scene = {
    leave: async () => {},
    enter: async () => {},
    reenter: async () => {},
    current: { id: 'faceSwapWizard' },
    state: {},
    session: { cursor: 2 },
  }
  ctx.session = { targetImageUrl: 'https://t/target.jpg' }
  return ctx
}

const run = (ctx: any) =>
  (faceSwapWizard as any).middleware()(ctx, async () => {})

describe('face-swap: a failed generation does not leak the raw provider error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    gen.mockResolvedValue({ success: false, error: RAW_ERROR })
  })

  it('never sends the raw error (or the embedded bot token) to the user', async () => {
    const sent: string[] = []
    await run(makeCtx(sent))

    const all = sent.join('\n')
    expect(all).not.toContain(SECRET)
    expect(all).not.toContain(RAW_ERROR)
    expect(all).not.toContain('api.telegram.org/file/bot')
    // and the user still gets a friendly failure message
    expect(all).toContain('Face swap failed')
  })
})
