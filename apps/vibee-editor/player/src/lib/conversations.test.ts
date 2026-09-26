/**
 * THE CLIENT SIDE OF SEVERAL CONVERSATIONS. Pure rules only here; the calls
 * are covered where they are used. What must hold: an id is well formed and
 * sortable, the rail keeps the open new chat on top, search matches title and
 * preview, and the day grouping is by the last turn.
 */
import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_RE,
  dayGroup,
  isConversationId,
  newConversationId,
  railRows,
  rowThreadKey,
  type Conversation,
} from './conversations'

describe('a conversation id', () => {
  it('is four to twenty-four lowercase word characters', () => {
    const id = newConversationId(1_700_000_000_000, () => 0.5)
    expect(CONVERSATION_RE.test(id)).toBe(true)
    expect(isConversationId(id)).toBe(true)
    expect(isConversationId('AB')).toBe(false)
    expect(isConversationId('a b')).toBe(false)
    expect(isConversationId('../x1')).toBe(false)
  })

  it('sorts roughly by birth: a later id is greater', () => {
    const a = newConversationId(1_700_000_000_000, () => 0)
    const b = newConversationId(1_700_000_050_000, () => 0)
    expect(b > a).toBe(true)
  })
})

describe('the rail', () => {
  const rows: Conversation[] = [
    {
      conversation: 'bbbb',
      title: 'a UART',
      turns: 2,
      lastAt: iso(0),
      preview: 'done',
    },
    {
      conversation: 'aaaa',
      title: 'lint my FIFO',
      turns: 4,
      lastAt: iso(-2),
      preview: '0 warnings',
    },
    {
      conversation: null,
      title: 'first',
      turns: 6,
      lastAt: iso(-40),
      preview: 'hi',
    },
  ]

  it('keeps the open new chat on top even before the server has seen it', () => {
    const shown = railRows(rows, 'zzzz', '')
    expect(shown[0].conversation).toBe('zzzz')
    expect(shown[0].turns).toBe(0)
    // An already-listed open conversation is not duplicated.
    expect(
      railRows(rows, 'aaaa', '').filter(r => r.conversation === 'aaaa')
    ).toHaveLength(1)
  })

  it('searches the title and the preview, all words must match', () => {
    expect(railRows(rows, null, 'fifo').map(r => r.conversation)).toEqual([
      'aaaa',
    ])
    expect(railRows(rows, null, 'warnings').map(r => r.conversation)).toEqual([
      'aaaa',
    ])
    expect(railRows(rows, null, 'uart fifo')).toEqual([])
  })

  it('names the thread the way the stream does', () => {
    expect(rowThreadKey(null, null)).toBe('self')
    expect(rowThreadKey('rtl', 'aaaa')).toBe('agent:rtl~aaaa')
    expect(rowThreadKey(null, 'aaaa')).toBe('self~aaaa')
  })
})

describe('the day a conversation belongs to', () => {
  const now = new Date('2026-09-26T12:00:00Z')
  it('is today, yesterday or earlier by the last turn', () => {
    expect(dayGroup('2026-09-26T09:00:00Z', now)).toBe('today')
    expect(dayGroup('2026-09-25T23:00:00Z', now)).toBe('yesterday')
    expect(dayGroup('2026-09-01T10:00:00Z', now)).toBe('earlier')
    expect(dayGroup('not a date', now)).toBe('earlier')
  })
})

function iso(daysFromNow: number): string {
  return new Date(Date.now() + daysFromNow * 86_400_000).toISOString()
}
