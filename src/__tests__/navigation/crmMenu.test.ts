import { describe, it, expect } from 'vitest'
import {
  CRM_ROOT_RE,
  CRM_LEAD_RE,
  CRM_SCOPE_RE,
  crmCallback,
  parseCrmCallback,
  hubRows,
  fit,
  MAX_BUTTONS_PER_ROW,
  rootMenu,
  prepLabel,
  nameLabel,
  leadsKeyboard,
  emptyLeadsKeyboard,
  leadMenu,
  dmLeadMenu,
  cardMenuRows,
  afterSentKeyboard,
  afterCancelKeyboard,
  afterTurnKeyboard,
  failKeyboard,
  summaryKeyboard,
  nextOf,
  allCallbacks,
} from '@/navigation/helpers/crmMenu'

/**
 * THE MENU'S GRAMMAR: every rendered callback is one the dispatcher matches,
 * the argument is only ever a numeric id, and nothing is over 64 bytes.
 */
const LEAD = '900000001'
const matches = (data: string) =>
  CRM_ROOT_RE.test(data) || CRM_LEAD_RE.test(data) || CRM_SCOPE_RE.test(data)

describe('the callback grammar', () => {
  it('builds every verb and refuses everything else', () => {
    expect(crmCallback('leads')).toBe('crm:leads')
    expect(crmCallback('hot')).toBe('crm:scope:hot')
    expect(crmCallback('prep', LEAD)).toBe(`crm:prep:${LEAD}`)
    expect(crmCallback('refuse!', LEAD)).toBe(`crm:refuse!:${LEAD}`)
    expect(() => crmCallback('offer', LEAD)).toThrow(/unknown/)
    expect(() => crmCallback('prep', '@ivan')).toThrow(/numeric/)
    expect(() => crmCallback('prep', '-1001')).toThrow(/numeric/)
    expect(() => crmCallback('nope')).toThrow(/unknown/)
  })

  it('parses what it builds, and nothing that looks like it', () => {
    expect(parseCrmCallback('crm:menu')).toEqual({ kind: 'root', verb: 'menu' })
    expect(parseCrmCallback('crm:scope:stop')).toEqual({
      kind: 'scope',
      verb: 'stop',
    })
    expect(parseCrmCallback(`crm:refuse!:${LEAD}`)).toEqual({
      kind: 'lead',
      verb: 'refuse!',
      bang: true,
      id: LEAD,
    })
    expect(parseCrmCallback(`crm:lead:${LEAD}`)?.kind).toBe('lead')
    expect(parseCrmCallback('crm:lead:@ivan')).toBeNull()
    expect(parseCrmCallback('crm:prep:1')).toBeNull()
    expect(parseCrmCallback('crm:offer:900000001')).toBeNull()
    expect(parseCrmCallback('tgp:ok:abc:def')).toBeNull()
  })

  it('every keyboard renders only callbacks the dispatcher matches, all under 64 bytes', () => {
    const rows = [
      { lead: LEAD, display: 'Pilot (@pilot_client)', next: 'reply' },
      { lead: '900000003', display: 'Second', next: 'wait' },
      { lead: '@notnumeric', display: 'x', next: 'offer' },
    ]
    const boards = [
      rootMenu(),
      leadsKeyboard(rows),
      emptyLeadsKeyboard(),
      leadMenu(LEAD, { next: 'talk' }),
      leadMenu(LEAD, { confirmRefuse: true }),
      dmLeadMenu(LEAD)!,
      afterSentKeyboard(LEAD),
      afterSentKeyboard(null),
      afterCancelKeyboard(LEAD),
      afterTurnKeyboard(LEAD),
      failKeyboard(`crm:prep:${LEAD}`, true),
      failKeyboard('garbage', false),
      summaryKeyboard({ by_next: { reply: 7, talk: 12 }, hot: 3 }, true),
      { reply_markup: { inline_keyboard: cardMenuRows(LEAD) } },
    ]
    const all = boards.flatMap(b => allCallbacks(b as never))
    expect(all.length).toBeGreaterThan(20)
    for (const data of all) {
      expect(matches(data), data).toBe(true)
      expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    }
  })
})

describe('what each keyboard offers', () => {
  it('the hub is the list, the overview and a sweep -- on two rows, never three across', () => {
    expect(
      hubRows()
        .flat()
        .map(b => (b as any).callback_data)
    ).toEqual(['crm:leads', 'crm:summary', 'crm:sweep'])
    expect(hubRows().map(r => r.length)).toEqual([2, 1])
  })

  it('the list: a name button per person, a prepare button unless the step is wait, at most six, then the hub', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      lead: String(100000000 + i),
      display:
        i === 1 ? '  Отправить   всё \n сейчас же, немедленно' : `Person ${i}`,
      next: i % 2 ? 'wait' : 'reply',
    }))
    const kb = leadsKeyboard(rows).reply_markup.inline_keyboard
    expect(kb).toHaveLength(8)
    expect((kb[0][0] as any).text).toBe('👤 1. Person 0')
    expect((kb[0][1] as any).text).toBe('✍️ Ответить')
    // A third-party name is index-prefixed and cut, and a wait row has no prepare button.
    expect((kb[1][0] as any).text).toBe('👤 2. Отправить всё сейчас')
    expect(kb[1]).toHaveLength(1)
    expect(allCallbacks(leadsKeyboard(rows)).slice(-3)).toEqual([
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('a non-numeric lead draws no button', () => {
    const kb = leadsKeyboard([
      { lead: '@pilot_client', display: 'Pilot', next: 'reply' },
    ])
    expect(allCallbacks(kb)).toEqual(['crm:leads', 'crm:summary', 'crm:sweep'])
    expect(cardMenuRows('@pilot_client')).toEqual([])
    expect(cardMenuRows('-1001')).toEqual([])
    expect(dmLeadMenu('-1001')).toBeUndefined()
  })

  it('the prepare label follows the forecast step, never an order', () => {
    expect(prepLabel('reply')).toBe('✍️ Ответить')
    expect(prepLabel('talk')).toBe('💬 Продолжить')
    expect(prepLabel('deliver')).toBe('🎁 Фото 9:16')
    expect(prepLabel('offer')).toBe('🧾 Счёт')
    expect(prepLabel(undefined)).toBe('✍️ Подготовить')
    expect(nameLabel(3, null, LEAD)).toBe(`👤 3. id ${LEAD}`)
  })

  it('the brief: prepare, later/refuse, the hub; refusal needs a second press', () => {
    const plain = allCallbacks(leadMenu(LEAD, { next: 'offer' }))
    expect(plain).toEqual([
      `crm:prep:${LEAD}`,
      `crm:later:${LEAD}`,
      `crm:refuse:${LEAD}`,
      'crm:leads',
      'crm:menu',
    ])
    expect(plain).not.toContain(`crm:refuse!:${LEAD}`)
    const confirm = allCallbacks(leadMenu(LEAD, { confirmRefuse: true }))
    expect(confirm).toContain(`crm:refuse!:${LEAD}`)
    expect(confirm).toContain(`crm:back:${LEAD}`)
    expect(confirm).not.toContain(`crm:refuse:${LEAD}`)
  })

  it('the DM notification: who, mute, prepare, later, refuse', () => {
    expect(allCallbacks(dmLeadMenu(900000001))).toEqual([
      `crm:lead:${LEAD}`,
      `crm:mute:${LEAD}`,
      `crm:prep:${LEAD}`,
      `crm:later:${LEAD}`,
      `crm:refuse:${LEAD}`,
    ])
  })

  it('after a send: open the chat and the history; after a cancel: prepare again', () => {
    const sent = afterSentKeyboard(LEAD).reply_markup.inline_keyboard
    expect((sent[0][0] as any).url).toBe(`tg://user?id=${LEAD}`)
    expect(allCallbacks(afterSentKeyboard(LEAD))).toContain(`crm:lead:${LEAD}`)
    expect(allCallbacks(afterCancelKeyboard(LEAD))[0]).toBe(`crm:prep:${LEAD}`)
    expect(allCallbacks(afterCancelKeyboard(undefined))).toEqual([
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('a failure offers a retry only for a real callback, and the model only when hinted', () => {
    expect(allCallbacks(failKeyboard(`crm:sweep`, false))[0]).toBe('crm:sweep')
    expect(allCallbacks(failKeyboard('nonsense', true))).toEqual([
      'crm:model',
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
    expect(allCallbacks(failKeyboard(null, false))).toEqual([
      'crm:leads',
      'crm:summary',
      'crm:sweep',
    ])
  })

  it('the overview offers a scoped sweep only for buckets with people, and stop/where only while one runs', () => {
    const quiet = allCallbacks(
      summaryKeyboard({ by_next: { reply: 0, talk: 0 }, hot: 0 }, false)
    )
    expect(quiet).toEqual([
      'crm:summary',
      'crm:plan',
      'crm:leads',
      'crm:sweep',
      'crm:model',
    ])
    const busy = summaryKeyboard(
      { by_next: { reply: 7, talk: 12 }, hot: 3 },
      true
    )
    const labels = busy.reply_markup.inline_keyboard
      .flat()
      .map(b => (b as any).text)
    expect(labels).toContain('✉️ Ответить ждущим (7)')
    expect(labels).toContain('🔥 Горячие (3)')
    // Segments and caps: the label says how many one press takes.
    const seg = summaryKeyboard(
      {
        segments: {
          waiting: 306,
          hot: 10,
          talk: 1,
          due: 4,
          ours: 3,
          winback: 6,
        },
        caps: { waiting: 20, hot: 10, winback: 3 },
      },
      false
    )
    const segLabels = seg.reply_markup.inline_keyboard
      .flat()
      .map(b => (b as any).text)
    expect(segLabels).toContain('✉️ Ответить ждущим (20 из 306)')
    expect(segLabels).toContain('🔥 Горячие (10)')
    expect(segLabels).toContain('⏰ Пора (4)')
    expect(segLabels).toContain('🤝 Мы молчим (3)')
    expect(segLabels).toContain('💎 Вернуть (3 из 6)')
    expect(allCallbacks(seg)).toEqual(
      expect.arrayContaining([
        'crm:scope:due',
        'crm:scope:ours',
        'crm:scope:winback',
      ])
    )
    expect(labels).toContain('💬 Поговорить (12)')
    expect(allCallbacks(busy)).toContain('crm:scope:stop')
    expect(allCallbacks(busy)).toContain('crm:scope:status')
  })

  it("nextOf mirrors the render's rule", () => {
    expect(nextOf({ waiting: true, signals: ['price'] })).toBe('reply')
    expect(nextOf({ signals: ['service', 'buy'] })).toBe('deliver')
    expect(nextOf({ signals: ['price'] })).toBe('offer')
    expect(nextOf({ signals: [] })).toBe('talk')
  })
})

/**
 * THE WIDTH RULE, RATCHETED: no CRM keyboard puts three buttons side by side.
 * Telegram splits a row's width between its buttons; three Russian labels
 * with an emoji are cut to "✍️ Отве…" on a phone, two are readable. Every
 * keyboard the module exports is rendered with a busy input and measured.
 */
describe('at most two buttons per row, everywhere', () => {
  const widest = (kb: { reply_markup: { inline_keyboard: unknown[][] } }) =>
    Math.max(...kb.reply_markup.inline_keyboard.map(r => r.length))
  const people = Array.from({ length: 6 }, (_, i) => ({
    lead: String(100000000 + i),
    display: `Person ${i}`,
    next: 'deliver',
  }))
  const busySummary = {
    segments: { waiting: 5, hot: 4, talk: 3, due: 2, ours: 1, winback: 6 },
    caps: { waiting: 20 },
  }
  const keyboards: Record<
    string,
    { reply_markup: { inline_keyboard: unknown[][] } }
  > = {
    rootMenu: rootMenu(),
    leadsKeyboard: leadsKeyboard(people),
    emptyLeadsKeyboard: emptyLeadsKeyboard(),
    leadMenu: leadMenu(LEAD, { next: 'deliver' }),
    'leadMenu(confirmRefuse)': leadMenu(LEAD, { confirmRefuse: true }),
    dmLeadMenu: dmLeadMenu(LEAD)!,
    afterSentKeyboard: afterSentKeyboard(LEAD),
    afterCancelKeyboard: afterCancelKeyboard(LEAD),
    afterTurnKeyboard: afterTurnKeyboard(LEAD),
    failKeyboard: failKeyboard(crmCallback('prep', LEAD), true),
    'summaryKeyboard(active)': summaryKeyboard(busySummary, true),
    'summaryKeyboard(idle)': summaryKeyboard(busySummary, false),
  }
  for (const [name, kb] of Object.entries(keyboards)) {
    it(`${name} is at most ${MAX_BUTTONS_PER_ROW} wide`, () => {
      expect(widest(kb)).toBeLessThanOrEqual(MAX_BUTTONS_PER_ROW)
      // Nothing was lost in the split: every button is still there, in order.
      expect(kb.reply_markup.inline_keyboard.every(r => r.length > 0)).toBe(
        true
      )
    })
  }

  it('fit splits a wide row in order and drops empty rows, and MAX is 2', () => {
    expect(MAX_BUTTONS_PER_ROW).toBe(2)
    const b = (t: string) => ({ text: t, callback_data: t }) as any
    expect(fit([[b('a'), b('b'), b('c')], [], [b('d')]])).toEqual([
      [b('a'), b('b')],
      [b('c')],
      [b('d')],
    ])
  })
})
