import { describe, it, expect } from 'vitest'
import {
  SWEEP_HEAD,
  SWEEP_RULES,
  SWEEP_ACTIONS,
  SWEEP_FILES,
  SWEEP_TAIL,
  SWEEP_WORTH,
  parseSweepArgs,
  matchRow,
  filterRows,
  isHotRow,
  itemsFromChats,
  itemsFromRows,
  scopedPrompt,
  faceOfItem,
  PACKAGE_STEP,
  itemMarker,
  progressLine,
  SYNTAX,
} from '@/services/crmSweepScope'
import { SWEEP_PROMPT } from '@/services/crmProactive'

/**
 * The seller, pointed at somebody: what the owner may type after /sweep,
 * which rows a filter keeps, and the brief the agent gets for ONE person.
 */
const rows = [
  {
    lead: '111111111',
    display: 'Pilot (@pilot_client)',
    username: 'pilot_client',
    next: 'reply',
    stage: 'client',
    paid: true,
    signals: ['price', 'service'],
    waiting_for_reply: true,
    days_since_their_last_word: 0,
  },
  {
    lead: '222222222',
    display: 'Second',
    username: 'second_client',
    next: 'offer',
    stage: 'new',
    paid: false,
    signals: ['buy'],
    waiting_for_reply: false,
    days_since_their_last_word: 3,
  },
  {
    lead: '333333333',
    display: 'Third',
    username: 'third_client',
    next: 'talk',
    stage: 'new',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: 6,
  },
  {
    lead: '444444444',
    display: 'Quiet',
    username: null,
    next: 'wait',
    stage: 'winback',
    paid: true,
    signals: ['price'],
    waiting_for_reply: false,
    days_since_their_last_word: 40,
  },
  {
    lead: '555555555',
    display: 'Never wrote',
    username: null,
    next: 'wait',
    stage: 'new',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: null,
  },
  {
    lead: '666666666',
    display: 'Talker',
    username: null,
    next: 'talk',
    stage: 'talking',
    paid: false,
    signals: [],
    waiting_for_reply: false,
    days_since_their_last_word: 8,
  },
]

describe('parseSweepArgs', () => {
  it('nothing is the generic sweep; где and stop are their own', () => {
    expect(parseSweepArgs([])).toEqual({ kind: 'generic' })
    expect(parseSweepArgs(['где'])).toEqual({ kind: 'status' })
    expect(parseSweepArgs(['status'])).toEqual({ kind: 'status' })
    expect(parseSweepArgs(['стоп'])).toEqual({ kind: 'stop' })
    expect(parseSweepArgs(['STOP'])).toEqual({ kind: 'stop' })
  })

  it('people: a @username, a numeric id, a list in the order given', () => {
    expect(parseSweepArgs(['@pilot_client'])).toEqual({
      kind: 'list',
      chats: ['@pilot_client'],
      label: '@pilot_client',
    })
    expect(parseSweepArgs(['900000001', '@pilot_client'])).toEqual({
      kind: 'list',
      chats: ['900000001', '@pilot_client'],
      label: '900000001 @pilot_client',
    })
  })

  it('filters AND together, presets have Russian names, limit is bounded', () => {
    const f = parseSweepArgs(['next=reply', 'days<=7'])
    expect(f).toEqual({
      kind: 'filter',
      predicates: [
        { field: 'next', value: 'reply' },
        { field: 'days', op: '<=', value: 7 },
      ],
      limit: 10,
      limitGiven: false,
      label: 'next=reply days<=7',
    })
    expect(parseSweepArgs(['days=7'])).toMatchObject({
      predicates: [{ field: 'days', op: '<=', value: 7 }],
    })
    expect(parseSweepArgs(['горячие'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'hot' }],
      label: 'hot',
    })
    expect(parseSweepArgs(['ждут', 'limit=3'])).toMatchObject({
      limit: 3,
      limitGiven: true,
      label: 'waiting limit=3',
    })
    expect(parseSweepArgs(['пора'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'due' }],
    })
    expect(parseSweepArgs(['молчим'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'ours' }],
    })
    expect(parseSweepArgs(['вернуть'])).toMatchObject({
      predicates: [{ field: 'preset', value: 'winback' }],
    })
    expect(parseSweepArgs(['прогрев'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('только пакетом'),
    })
    expect(parseSweepArgs(['limit=0'])).toMatchObject({ kind: 'error' })
    expect(parseSweepArgs(['limit=51'])).toMatchObject({ kind: 'error' })
  })

  it('refuses mixing people with filters, unknown keys, unknown values, and bare words', () => {
    expect(parseSweepArgs(['@pilot_client', 'next=reply'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('не вместе'),
    })
    expect(parseSweepArgs(['color=red'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining(SYNTAX),
    })
    expect(parseSweepArgs(['next=sell'])).toMatchObject({
      kind: 'error',
      message: 'next: reply, deliver, offer, talk, wait',
    })
    expect(parseSweepArgs(['ivan'])).toMatchObject({ kind: 'error' })
    expect(parseSweepArgs(['@iv'])).toMatchObject({
      kind: 'error',
      message: expect.stringContaining('от 5 знаков'),
    })
  })
})

describe('the row filters', () => {
  it('each field means what the list means', () => {
    expect(
      filterRows(rows, [{ field: 'next', value: 'talk' }], 10).map(r => r.lead)
    ).toEqual(['333333333', '666666666'])
    expect(
      filterRows(rows, [{ field: 'stage', value: 'new' }], 10)
    ).toHaveLength(3)
    expect(
      filterRows(rows, [{ field: 'signal', value: 'price' }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111', '444444444'])
    expect(
      filterRows(rows, [{ field: 'paid', value: 'yes' }], 10).map(r => r.lead)
    ).toEqual(['111111111', '444444444'])
    expect(
      filterRows(rows, [{ field: 'days', op: '<=', value: 7 }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111', '222222222', '333333333'])
    expect(
      filterRows(rows, [{ field: 'days', op: '>=', value: 7 }], 10).map(
        r => r.lead
      )
    ).toEqual(['444444444', '666666666'])
  })

  it('presets: waiting is the unanswered, hot is their own price or buy word recently, talk is talk', () => {
    expect(
      filterRows(rows, [{ field: 'preset', value: 'waiting' }], 10).map(
        r => r.lead
      )
    ).toEqual(['111111111'])
    expect(
      filterRows(rows, [{ field: 'preset', value: 'hot' }], 10).map(r => r.lead)
    ).toEqual(['111111111', '222222222'])
    expect(isHotRow(rows[3])).toBe(false)
    expect(
      filterRows(rows, [{ field: 'preset', value: 'talk' }], 10).map(
        r => r.lead
      )
    ).toEqual(['333333333', '666666666'])
  })

  it('predicates AND together and the limit cuts from the top', () => {
    expect(
      filterRows(
        rows,
        [
          { field: 'stage', value: 'new' },
          { field: 'days', op: '<=', value: 7 },
        ],
        10
      ).map(r => r.lead)
    ).toEqual(['222222222', '333333333'])
    expect(filterRows(rows, [], 2).map(r => r.lead)).toEqual([
      '111111111',
      '222222222',
    ])
    expect(matchRow(rows[4], { field: 'days', op: '<=', value: 100 })).toBe(
      false
    )
  })
})

describe('the items and the brief', () => {
  it('explicit chats keep their order and pick up the name and the step when known', () => {
    const items = itemsFromChats(
      ['@PILOT_CLIENT', '222222222', '@nobody'],
      rows
    )
    expect(items).toEqual([
      {
        chat: '@PILOT_CLIENT',
        display: 'Pilot (@pilot_client)',
        next: 'reply',
      },
      { chat: '222222222', display: 'Second', next: 'offer' },
      { chat: '@nobody', display: null, next: null },
    ])
    expect(itemsFromRows(rows.slice(0, 2)).map(i => i.chat)).toEqual([
      '111111111',
      '222222222',
    ])
  })

  /*
   * A client with a draft package is packaged first: the brief asks the agent
   * to read the package and ask the person for the half only they can do.
   * Only a numeric id can be looked up, so an @username brief carries none.
   */
  it('a numeric id gets the package step first, with its own id', () => {
    const p = scopedPrompt({ chat: '900000041', display: null, next: null })
    expect(p).toContain('crm_client_profile с telegram_id=900000041')
    expect(p).toContain('discovery_questions')
    expect(p).toContain('SOUL')
    expect(p).toContain('ответы даёт сам человек')
    expect(p).not.toContain('CHAT')
    // The package is the first ACTION decision: before the steps. Reading
    // her history and her files comes before any action, the package's too.
    expect(p.indexOf('crm_client_profile')).toBeLessThan(p.indexOf('Шаги:'))
    expect(p.indexOf('crm_lead_context с chat=900000041')).toBeLessThan(
      p.indexOf('crm_client_profile')
    )
  })

  /*
   * THE PORTRAIT COMES BEFORE THE PACKAGE (owner, 2026-09-21). With a package
   * installed, the seller's cards went to reels of the package template and
   * the portrait from the person's own face never came. The package step now
   * sends the portrait to the shared rule and waits its own turn after it.
   */
  it('the portrait from their face comes before packaging, reels and the rest', () => {
    const p = scopedPrompt({ chat: '900000041', display: null, next: null })
    expect(p).toContain('portrait')
    expect(p).toContain('пакет, рилс и остальное — только после портрета')
    expect(p.indexOf('раньше пакета')).toBeLessThan(p.indexOf('УПАКОВКА'))
    // The portrait rule is the first thing the ONE action is.
    expect(p).toContain('Ровно ОДНО действие: ПОРТРЕТ ПЕРВЫЙ')
    // The two exceptions: an unanswered question and a recent refusal.
    expect(p).toContain('ждёт ответа на свой вопрос — сначала ответь')
    expect(p).toContain('отказ за 30 дней или просил позже — без портрета')
  })

  /*
   * ONE ORDER, NOT THREE. The package step said "the portrait is your ONE
   * action", then "no package -- act by the steps below", then the steps said
   * "exactly ONE action: next=talk -- tg_send". A model obeying the last one
   * never drew the portrait. The package step no longer claims the portrait,
   * and "act by the steps below" is only for a portrait already given.
   */
  it('the numeric brief does not give two ONE actions for the portrait', () => {
    const p = scopedPrompt({ chat: '900000041', display: null, next: 'talk' })
    expect(p).not.toContain('твоё ОДНО действие — ПОРТРЕТ')
    expect(p).toContain(
      'Если портрет уже подарен, а пакета нет или он подтверждён — действуй по шагам ниже'
    )
    expect(p).not.toContain('Если пакета нет или он подтверждён')
  })

  /*
   * EVERY BRIEF, NOT ONLY THE NUMERIC ONE. The thirty-minute timer's brief and
   * the /sweep @username brief carried no portrait step at all, and their
   * deliver rule limited the gift to people who asked and could pay.
   */
  it('the timer brief and the @username brief put the portrait first, and the gift needs no tokens', () => {
    const at = scopedPrompt({
      chat: '@pilot_client',
      display: null,
      next: null,
    })
    for (const p of [SWEEP_PROMPT, at]) {
      expect(p).toContain('ПОРТРЕТ ПЕРВЫЙ')
      expect(p).toContain('crm_deliver_photo с его chat')
      expect(p).toContain('его токены не нужны')
      expect(p).not.toContain('next=deliver и есть токены')
      expect(p.indexOf('ПОРТРЕТ ПЕРВЫЙ')).toBeLessThan(p.indexOf('next=talk'))
    }
  })

  it('only a numeric id is a face the render may draw', () => {
    expect(faceOfItem({ chat: '900000041' })).toBe('900000041')
    expect(faceOfItem({ chat: '@pilot_client' })).toBeUndefined()
    expect(faceOfItem({ chat: '12' })).toBeUndefined()
  })

  /*
   * THE FILES FIRST (owner, 2026-09-22): a client sent photos for her content
   * plan and the seller answered her words only. Both briefs -- the one-person
   * one and the whole-base sweep -- now say to open what she sent before the
   * one action, to use a photo with her face as the picture's source, and
   * never to describe a file nobody opened.
   */
  it('both briefs open the files she sent before the one action', () => {
    const one = scopedPrompt({
      chat: '900000041',
      display: null,
      next: 'reply',
    })
    for (const p of [one, SWEEP_PROMPT]) {
      expect(p).toContain('tg_fetch_media')
      expect(p).toContain('their_files')
      expect(p).toContain('неоткрытый файл не описывай')
      // Opening comes before the rules of the one action, not after them.
      expect(p.indexOf('tg_fetch_media')).toBeLessThan(
        p.indexOf('next=reply —')
      )
    }
  })

  /*
   * THE READ COMES BEFORE THE PACKAGE (review of 2026-09-22). The client this
   * was built for has a draft package, and PACKAGE_STEP makes packaging her
   * ONE action -- "if there is no package or it is confirmed, follow the steps
   * below". The files rule lived only inside those steps, so for exactly her
   * the model was told to send the packaging message and never reached "open
   * her photos". Reading is not an action: it now comes first, for everyone.
   */
  it('the one-person brief opens her files before the package decides anything', () => {
    const p = scopedPrompt({ chat: '900000041', display: null, next: 'reply' })
    const read = p.indexOf('tg_fetch_media')
    expect(read).toBeGreaterThan(0)
    expect(read).toBeLessThan(p.indexOf('crm_client_profile'))
    expect(read).toBeLessThan(p.indexOf('УПАКОВКА'))
    expect(p.indexOf('crm_lead_context с chat=900000041')).toBeLessThan(read)
    // Every CHAT is the person: the read names her too.
    expect(p).toContain('tg_fetch_media {chat=900000041')
    expect(p).not.toContain('CHAT')
    // Said once: the steps below do not repeat the files rule.
    expect(p.split('their_files').length - 1).toBe(1)
  })

  /*
   * ONE ROAD FOR A PICTURE OF HER: crm_deliver_photo (the gift ledger, the
   * owner's card, the recipient's billing). The files rule used to send it to
   * image_edit -- a second tool for the same job that charges the owner and
   * makes no card, inside unattended sweeps too.
   */
  it('the files rule sends a picture of her to crm_deliver_photo, not image_edit', () => {
    const one = scopedPrompt({ chat: '900000041', display: null, next: null })
    for (const p of [SWEEP_FILES, one, SWEEP_PROMPT]) {
      expect(p).toContain('crm_deliver_photo (его лицо), не image_edit')
      expect(p).not.toContain('(image_edit)')
    }
  })

  it('an @username brief has no package step', () => {
    const p = scopedPrompt({ chat: '@pilot_client', display: null, next: null })
    expect(p).not.toContain('crm_client_profile')
    expect(PACKAGE_STEP).toContain('Без цены и без счёта')
  })

  it('the scoped brief names the one person, forbids the list, reuses the rules, and forbids pay-first', () => {
    const p = scopedPrompt({
      chat: '@pilot_client',
      display: 'Pilot (@pilot_client)',
      next: 'talk',
    })
    expect(p).toContain('ОДИН человек — @pilot_client (Pilot (@pilot_client))')
    expect(p).toContain('crm_leads НЕ вызывай')
    expect(p).toContain('crm_lead_context с chat=@pilot_client')
    expect(p).toContain('next=talk')
    expect(p).toContain(SWEEP_ACTIONS)
    expect(SWEEP_RULES).toBe(SWEEP_FILES + SWEEP_ACTIONS)
    expect(p).toContain('НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ')
    expect(p).toContain('НИЧЕГО НЕ ОТПРАВЛЯЙ САМ')
    expect(p).toContain('«тихо»')
    expect(
      itemMarker({ chat: '@pilot_client', display: null, next: null })
    ).toBe('[обход по выбору владельца: @pilot_client]')
  })

  it('the generic brief is head + rules + tail, and the progress line reads like a list row', () => {
    /*
     * THE ASSEMBLED PROMPT, NOT MY OWN RE-ASSEMBLY.
     *
     * This line used to concatenate the pieces here, which meant the test
     * proved its own arithmetic rather than the code's: a reverse mutation
     * that removed SWEEP_WORTH from SWEEP_PROMPT left it green. What the
     * model receives is SWEEP_PROMPT, so that is what is read.
     */
    const generic = SWEEP_PROMPT
    expect(
      generic,
      'every piece of the brief must actually be in what is sent'
    ).toContain(SWEEP_WORTH.trim())
    expect(generic).toContain('crm_leads с limit 5')
    /*
     * STEP 4 MUST NOT CONTRADICT STEP 2.
     *
     * Step 2 says take the first whose next is not wait -- scan past the
     * waits. Step 4 used to say "or THE FIRST is wait, answer quiet", which
     * stops at the first. A model reading the tail literally went silent
     * whenever candidate #1 happened to be wait, and in production 544 of 881
     * people sit on wait. The journal has the seller saying exactly that and
     * going idle with four unexamined rows in hand.
     */
    expect(generic, 'the tail must ask about ALL candidates').toContain(
      'НИ У ОДНОГО'
    )
    expect(
      generic,
      'the tail still stops at the first candidate'
    ).not.toContain('у первого next=wait')
    // And the reason a weak card costs something: one draft per owner.
    expect(generic).toContain('ВЫТЕСНЯЕТ')
    expect(
      progressLine(1, 7, {
        chat: '900000001',
        display: 'Pilot (@pilot_client)',
        next: 'reply',
      })
    ).toBe('2 из 7 · Pilot (@pilot_client) · 900000001 · ответить')
    expect(
      progressLine(0, 1, { chat: '@pilot_client', display: null, next: null })
    ).toBe('1 из 1 · @pilot_client')
  })
})
