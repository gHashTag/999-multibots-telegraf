/**
 * THE ONE NUMBER, WHERE HE ACTUALLY LOOKS.
 *
 * The figure lives in the dashboard and in `tri outcomes`, and the owner reads
 * the bot ten times more often than either. A number on a screen somebody
 * opens twice a week is a number they do not have.
 *
 * What is pinned here is not the arithmetic -- the render owns that -- but the
 * three ways this line could mislead in the bot: a summary lost because one
 * new call failed, an empty week printed as "0%", and a percentage with
 * nothing beside it to say what it counted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const answers: Record<string, unknown> = {}
const calls: string[] = []
/*
 * The real module, with one export replaced. Mocking the whole of it left
 * `formatSummary` without `day`, `NEXT_RU` and the rest -- a failure that
 * looks like a bug in the code under test and is a hole in the double.
 */
vi.mock('@/services/modelSwitch', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  callTool: async (_id: string, name: string) => {
    calls.push(name)
    if (answers[name] instanceof Error) throw answers[name]
    return answers[name] ?? {}
  },
}))

const { fetchWithoutYou, withoutYouLine, formatSummary } = await import(
  '@/services/crmSummary'
)

const OWNER = '900000701'

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(answers)) delete answers[k]
})

describe('the line', () => {
  it('says the share AND what it counted', () => {
    const line = withoutYouLine({
      days: 7,
      answered: 263,
      auto: 0,
      pressed: 13,
      percent: 95,
      beforePercent: 100,
    })!
    expect(line).toContain('95%')
    expect(line).toContain('263')
    expect(line).toContain('13')
    // A share alone invites the question the numbers answer.
    expect(line).toContain('ответов в чатах') // cyrillic-ok: the line
  })

  it('names the week before only when there is one', () => {
    const w = {
      days: 7,
      answered: 5,
      auto: 0,
      pressed: 0,
      percent: 100,
      beforePercent: null,
    }
    expect(withoutYouLine(w)).not.toContain('раньше') // cyrillic-ok: the word
    expect(withoutYouLine({ ...w, beforePercent: 80 })).toContain('80%')
  })

  it('says an empty week in words, never as 0%', () => {
    const line = withoutYouLine({
      days: 7,
      answered: 0,
      auto: 0,
      pressed: 0,
      percent: null,
      beforePercent: null,
    })!
    expect(line).toContain('ничего не уходило') // cyrillic-ok: the line
    expect(line).not.toContain('0%')
  })

  it('is absent when the figure could not be read at all', () => {
    expect(withoutYouLine(null)).toBeNull()
  })
})

describe('the summary', () => {
  const summary = { window_days: 7, people_known: 10 } as never

  it('carries the line second, above the counts', () => {
    const text = formatSummary(summary, null, null, {
      days: 7,
      answered: 263,
      auto: 0,
      pressed: 13,
      percent: 95,
      beforePercent: null,
    })
    const lines = text.split('\n')
    expect(lines[1]).toContain('Без тебя') // cyrillic-ok: the line
  })

  it('is unchanged when the figure is missing -- one new call cannot cost the screen', () => {
    const withIt = formatSummary(summary, null, null, null)
    expect(withIt).toContain('Сводка по переписке') // cyrillic-ok: the heading
    expect(withIt).not.toContain('Без тебя') // cyrillic-ok: the line
  })
})

describe('fetching it', () => {
  it('asks crm_outcomes and maps what the render answers', async () => {
    answers['crm_outcomes'] = {
      days: 7,
      dm_answered: 263,
      auto_sent: 1,
      pressed_sent: 13,
      without_you_percent: 95,
      before: { without_you_percent: 100 },
    }
    const w = await fetchWithoutYou(OWNER)
    expect(calls).toEqual(['crm_outcomes'])
    expect(w).toEqual({
      days: 7,
      answered: 263,
      auto: 1,
      pressed: 13,
      percent: 95,
      beforePercent: 100,
    })
  })

  it('an older render with no `before` is not a crash', async () => {
    answers['crm_outcomes'] = { days: 7, dm_answered: 2 }
    const w = await fetchWithoutYou(OWNER)
    expect(w).toMatchObject({ answered: 2, percent: null, beforePercent: null })
  })
})
