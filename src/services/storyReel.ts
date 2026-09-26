/**
 * THE NEXT STORY REEL IN ONE PRESS (owner, 2026-09-26: "make it so she can
 * get a new one with one press").
 *
 * t.me/<bot>?start=reel lands here. The render makes the reel in the
 * background (apps/vibee-editor/render/src/agent/story-template.ts) and sends
 * it back to this chat in this bot; this call only asks and answers at once,
 * because a reel takes minutes and a /start must not.
 *
 * Never throws: a render that did not answer is said in words, not as an
 * error the person cannot act on.
 */
const BASE = 'https://vibee-render-production.up.railway.app'

export const STORY_PAYLOAD = /^reel$/i

export function reelIntent(payload: string | undefined): boolean {
  return Boolean(payload && STORY_PAYLOAD.test(payload))
}

export interface StoryAnswer {
  started: boolean
  why?: string
  topic?: string
}

export async function askNextStory(
  telegramId: string,
  bot: string | undefined,
  opts: { base?: string; key?: string; fetchImpl?: typeof fetch } = {}
): Promise<StoryAnswer> {
  const key = opts.key ?? process.env.RENDER_API_KEY ?? ''
  const id = String(telegramId ?? '').trim()
  if (!key || !/^\d{5,15}$/.test(id))
    return { started: false, why: 'сервис рилсов сейчас недоступен' }
  const send = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), 30_000)
  try {
    const r = await send(
      `${opts.base ?? BASE}/api/story/next?telegram_id=${encodeURIComponent(id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify({ bot: bot ?? null }),
        signal: ac.signal,
      }
    )
    const data = (await r.json().catch(() => null)) as StoryAnswer | null
    if (!data || typeof data.started !== 'boolean')
      return { started: false, why: `сервис рилсов ответил ${r.status}` }
    return data
  } catch {
    return {
      started: false,
      why: 'сервис рилсов не ответил — попробуй чуть позже',
    }
  } finally {
    clearTimeout(timer)
  }
}

/** What the person reads right after the press. */
export function storyReply(a: StoryAnswer): string {
  if (a.started)
    return (
      `🎬 Делаю рилс${a.topic ? ` «${a.topic}»` : ''} — твоим голосом, с твоим лицом. ` +
      'Это 5–10 минут: пришлю сюда, как будет готов.'
    )
  return `Рилс сейчас не начат: ${a.why || 'причина неизвестна'}.`
}
