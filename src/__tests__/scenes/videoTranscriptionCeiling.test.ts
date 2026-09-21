import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/helpers/language', () => ({ isRussian: vi.fn(() => true) }))
vi.mock('@/navigation', () => ({
  handleHelpCancel: vi.fn(() => Promise.resolve(false)),
  createHelpCancelKeyboard: vi.fn(() => ({})),
  sendGenericErrorMessage: vi.fn(() => Promise.resolve()),
  getMainMenuText: vi.fn(() => 'menu'),
}))
vi.mock('@/services/videoTranscription', () => ({
  transcribeInstagramReel: vi.fn(),
  transcribeVideoFromDirectUrl: vi.fn(),
}))
vi.mock('@/core/supabase', () => ({
  getUserBalance: vi.fn(() => Promise.resolve(100)),
  updateUserBalance: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

import { videoTranscriptionWizard } from '@/scenes/videoTranscriptionWizard'
import { transcribeVideoFromDirectUrl } from '@/services/videoTranscription'

/**
 * WHEN getFile REFUSES A VIDEO, THE SENTENCE NAMES THIS BOT'S OWN CEILING.
 *
 * The step used to say "maybe it is over 20 MB" to everybody. For a bot on our
 * own Bot API server that is false twice over: its ceiling is 2000 MB, and a
 * person told "20" sends a worse file for no reason.
 */
const MOVED = '900000011:ZZmovedmovedmovedmovedmovedmovedmoved'
const STAYS = '900000022:ZZstaysstaysstaysstaysstaysstaysstays'

const saved = { ...process.env }
beforeEach(() => {
  process.env = {
    ...saved,
    TELEGRAM_API_ROOT: 'http://telegram-bot-api.railway.internal:8081',
    TELEGRAM_API_FILES_ROOT: 'http://telegram-bot-api.railway.internal:8082',
    BOT_API_LOCAL_BOTS: '900000011',
  }
  return () => {
    process.env = saved
  }
})

async function refusalFor(token: string): Promise<string> {
  const reply = vi.fn()
  const ctx: any = {
    from: { id: 900000077 },
    message: { video: { file_id: 'v', file_size: 40 * 1024 * 1024 } },
    reply,
    session: {},
    scene: { leave: vi.fn() },
    wizard: { next: vi.fn() },
    telegram: {
      token,
      getFile: vi.fn(() => Promise.reject(new Error('400: file is too big'))),
    },
  }
  const upload = (videoTranscriptionWizard as any).steps[1]
  await upload(ctx, vi.fn())
  return String(reply.mock.calls[0]?.[0] ?? '')
}

describe('the transcription step names the ceiling of the bot it runs in', () => {
  it('a cloud bot: 20 МБ', async () => {
    expect(await refusalFor(STAYS)).toContain('больше 20 МБ')
  })

  it('a bot on our server: 2000 МБ, not the cloud’s 20', async () => {
    const text = await refusalFor(MOVED)
    expect(text).toContain('больше 2000 МБ')
    expect(text).not.toContain('больше 20 МБ')
  })
})

/**
 * AND WHEN IT SUCCEEDS, THE VIDEO GOES BACK BY ITS file_id.
 *
 * For a bot on our own server the download URL is the PRIVATE file endpoint
 * (railway.internal, the token in the path). It is fine for this process to
 * download from; handed to Telegram as the video to send, Telegram's servers
 * fetch it, cannot reach it, the send throws -- and the person saw the
 * charge, a refund, and no transcript at all.
 */
describe('a moved bot finishes the transcription', () => {
  it('replies with the file_id, and nothing sent to Telegram names the private endpoint', async () => {
    const path = `/var/lib/telegram-bot-api/${MOVED}/videos/file_3.mp4`
    vi.mocked(transcribeVideoFromDirectUrl).mockResolvedValue({
      success: true,
      text: 'hello from the video',
    } as any)
    const sent: unknown[][] = []
    const record =
      (name: string) =>
      (...args: unknown[]) => {
        sent.push([name, ...args])
        return Promise.resolve({})
      }
    const ctx: any = {
      from: { id: 900000077 },
      botInfo: { username: 'Moved_test_bot' },
      message: {
        video: { file_id: 'VIDEO_FILE_ID', file_size: 40 * 1024 * 1024 },
      },
      reply: vi.fn(record('reply')),
      replyWithVideo: vi.fn(record('replyWithVideo')),
      session: {},
      scene: { leave: vi.fn() },
      wizard: { next: vi.fn() },
      telegram: {
        token: MOVED,
        getFile: vi.fn(() =>
          Promise.resolve({ file_path: path, file_size: 40 * 1024 * 1024 })
        ),
      },
    }
    const upload = (videoTranscriptionWizard as any).steps[1]
    await upload(ctx, vi.fn())

    // The transcription itself read the private endpoint, in this process.
    expect(vi.mocked(transcribeVideoFromDirectUrl).mock.calls[0][0]).toContain(
      'telegram-bot-api.railway.internal:8082'
    )
    expect(ctx.replyWithVideo).toHaveBeenCalledTimes(1)
    expect(ctx.replyWithVideo.mock.calls[0][0]).toBe('VIDEO_FILE_ID')
    expect(JSON.stringify(sent)).not.toContain('railway.internal')
    expect(JSON.stringify(sent)).toContain('hello from the video')
  })
})
