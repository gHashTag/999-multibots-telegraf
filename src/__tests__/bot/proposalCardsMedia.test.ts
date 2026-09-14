import { describe, it, expect } from 'vitest'

/**
 * THE CARD NAMES THE THING, NOT JUST "A MESSAGE".
 *
 * A round voice note, a document named "Смета.pdf" and an album of five
 * photos are different acts to approve, and until 2026-09-14 the card asked
 * the same "Отправить сообщение в Telegram?" for all of them -- with the
 * body empty, because a media draft's `what` is a caption the tool may not
 * have been given. A person pressing Send there approved a thing the card
 * never described.
 *
 * These tests hold the ask strings per action x kind, the caption caps
 * (700 for one media, 1500 for an album, 3000 for text -- each with the cut
 * STATED), the schedule suffix in wall-clock words, and the one shape that
 * must never change with the prose: the buttons and their 64 bytes.
 */

const load = () => import('@/services/telegramProposals')

const ID = '3f2504e04f89' // the real generated shape: 12 hex
const SECRET = 'a'.repeat(32) // ...and a 32-hex one-time secret

const draft = (over: Record<string, unknown> = {}) =>
  ({
    id: ID,
    action: 'send',
    target: '@ivan',
    secret: SECRET,
    ...over,
  }) as never

describe('the card names what kind of thing will be sent', () => {
  it('a voice says its length when the draft knows it, and the caption rides', async () => {
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({
        media: { kind: 'voice', url: 'https://x/v.mp3', duration: 17 },
        what: 'голосовое про смету',
      }),
      true
    )
    expect(card.text).toContain('голосовое')
    expect(card.text).toContain('(~17 сек)')
    expect(card.text).toContain('голосовое про смету')
    // The bot cannot play a url and must not try (it would fetch a
    // stranger's file); the card is words, not a preview.
    expect(card.photo).toBeUndefined()
    expect(card.text).not.toContain('https://')
  })

  it('a document names the file it will arrive as', async () => {
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({
        media: {
          kind: 'document',
          url: 'https://x/d.pdf',
          fileName: 'Смета.pdf',
        },
      }),
      true
    )
    expect(card.text).toContain('файл')
    expect(card.text).toContain('Смета.pdf')
  })

  it('an album counts its photos in both languages', async () => {
    const { proposalCard } = await load()
    const media = {
      kind: 'album',
      urls: Array.from({ length: 5 }, () => 'https://x/p.png'),
      captions: ['раз', 'два'],
    }
    const ru = proposalCard(draft({ media }), true)
    const en = proposalCard(draft({ media }), false)
    expect(ru.text).toContain('альбом из 5 фото')
    expect(ru.text).toContain('раз / два')
    expect(en.text).toContain('album of 5 photos')
  })

  it('a video note is called a round message, not "a video"', async () => {
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({ media: { kind: 'video_note', url: 'https://x/v.mp4' } }),
      false
    )
    expect(card.text).toContain('round video message')
  })
})

describe('forward and read have cards of their own', () => {
  it('forward names the chat the messages come from', async () => {
    const { proposalCard } = await load()
    const card = proposalCard(
      draft({
        action: 'forward',
        what: 'сообщения 4 и 5',
        args: { fromPeer: '@source_chat', messageIds: [4, 5] },
      }),
      true
    )
    expect(card.text).toContain('Переслать')
    expect(card.text).toContain('Из: @source_chat')
    expect(card.text).toContain('Кому: @ivan')
  })

  it('read says that the other person will see it happen', async () => {
    const { proposalCard } = await load()
    const card = proposalCard(draft({ action: 'read', what: undefined }), true)
    expect(card.text).toContain('прочитан')
    expect(card.text).toContain('увидит прочтение')
    // The "To" label is the wrong question for a read; the card names the chat.
    expect(card.text).toContain('Чат: @ivan')
  })
})

describe('caption caps per kind, with the cut stated', () => {
  it('one media caption is capped at 700', async () => {
    const { proposalCard } = await load()
    const long = 'с'.repeat(900)
    const card = proposalCard(
      draft({
        media: { kind: 'video', url: 'https://x/v.mp4' },
        what: long,
      }),
      true
    )
    expect(card.text).toContain('показано 700 из 900')
    expect(card.text.length).toBeLessThan(4096)
  })

  it('an album body is capped at 1500', async () => {
    const { proposalCard } = await load()
    const long = Array.from({ length: 9 }, () => 'п'.repeat(200)).join(' / ')
    const card = proposalCard(
      draft({
        media: {
          kind: 'album',
          urls: ['https://x/1.png', 'https://x/2.png'],
          captions: [long],
        },
      }),
      true
    )
    expect(card.text).toContain('показано 1500 из')
  })
})

describe('a schedule is on the card in wall-clock words', () => {
  it('same-day says HH:MM and that it can be cancelled until then', async () => {
    const { proposalCard } = await load()
    // Pinned to today at 12:34, so the assertion is clock-stable whatever
    // hour the suite runs at (a "+3 hours" draft would cross midnight).
    const at = new Date()
    at.setHours(12, 34, 0, 0)
    const card = proposalCard(
      draft({ what: 'вечером', scheduleAt: at.getTime() }),
      true
    )
    expect(card.text).toContain('Уйдёт в 12:34')
    expect(card.text).toContain('можно отменить до')
    expect(card.text).toContain('вечером')
  })

  it('another day gains the date, because HH:MM alone would lie', async () => {
    const { proposalCard } = await load()
    const at = new Date(Date.now() + 8 * 24 * 3600_000)
    at.setHours(9, 5, 0, 0)
    const card = proposalCard(
      draft({ what: 'напоминание', scheduleAt: at.getTime() }),
      false
    )
    expect(card.text).toMatch(/\d{2}\.\d{2} \d{2}:\d{2}/)
  })
})

describe('the buttons stay the same bytes whatever the kind', () => {
  /*
   * The prose grows with the kinds; the wire must not. Telegram rejects a
   * message whose callback data exceeds 64 bytes OUTRIGHT, so a kind that
   * accidentally pushed the button over would make the whole card vanish --
   * and read like "the agent did nothing" instead of like a bug.
   */
  const cases = [
    { kind: 'text' },
    { kind: 'photo', media: { kind: 'photo', url: 'https://x/p.png' } },
    { kind: 'voice', media: { kind: 'voice', url: 'https://x/v.mp3' } },
    { kind: 'video', media: { kind: 'video', url: 'https://x/v.mp4' } },
    {
      kind: 'video_note',
      media: { kind: 'video_note', url: 'https://x/v.mp4' },
    },
    {
      kind: 'document',
      media: { kind: 'document', url: 'https://x/d.pdf' },
    },
    {
      kind: 'album',
      media: { kind: 'album', urls: ['https://x/1.png', 'https://x/2.png'] },
    },
  ]

  for (const c of cases) {
    it(`${c.kind}: 52 bytes of callback, id and secret inside, secret never in the text`, async () => {
      const { proposalCard, PROPOSAL_OK } = await load()
      const card = proposalCard(
        draft({ what: 'текст', ...(c.media ? { media: c.media } : {}) }),
        true
      )
      const buttons = card.markup.reply_markup.inline_keyboard.flat() as Array<{
        callback_data: string
      }>
      expect(buttons.length).toBe(2)
      for (const b of buttons) {
        expect(Buffer.byteLength(b.callback_data, 'utf8')).toBeLessThanOrEqual(
          64
        )
      }
      expect(buttons[0].callback_data).toBe(`${PROPOSAL_OK}${ID}:${SECRET}`)
      expect(card.text).not.toContain(SECRET)
    })
  }

  it('forward and read keep the same two buttons', async () => {
    const { proposalCard } = await load()
    for (const action of ['forward', 'read']) {
      const card = proposalCard(
        draft({
          action,
          args: { fromPeer: '@s', messageIds: [1] },
          what: 'x',
        }),
        true
      )
      const buttons = card.markup.reply_markup.inline_keyboard.flat() as Array<{
        callback_data: string
      }>
      expect(buttons.length).toBe(2)
      expect(
        buttons.every(b => Buffer.byteLength(b.callback_data, 'utf8') <= 64)
      ).toBe(true)
    }
  })
})
