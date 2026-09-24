/**
 * THE AGENT REPEATS WHAT WORKED, STEP BY STEP.
 *
 * What every competitor has and we did not: a saved run. Stagehand replays a
 * script, Skyvern replays a workflow; we learned single button labels
 * (browser/recipes.ts) and nothing above them, so "sign in with Google" was
 * re-derived by a model every time, at the price of a model, and went wrong
 * in a different place each night.
 *
 * A scenario is a short list of plain steps -- open, press, type, wait,
 * expect -- with three rules that keep it honest:
 *
 *  1. NO SECRET IS EVER IN A SCENARIO. A step may say "ask the person for a
 *     password"; it may not carry one. The words are typed by the person,
 *     into their own browser, as they always were.
 *  2. A STEP THAT FAILS STOPS THE RUN. Nothing is retried blindly and
 *     nothing later is attempted on the hope that the page recovered: the
 *     report names the step that failed and what the page said instead.
 *  3. WHAT IT DOES IS WHAT IT SAYS. The steps are data, so the person can
 *     read a scenario before running it, and change it without a deploy.
 */
export type Step =
  | { do: 'open'; url: string }
  | { do: 'press'; words: string }
  | { do: 'type'; text: string }
  | { do: 'ask'; kind: 'password' | 'code' | 'email' | 'text'; why: string }
  | { do: 'wait'; ms: number }
  | { do: 'expect'; words: string }

export interface Scenario {
  id: string
  name: string
  steps: Step[]
}

/** Bounds, so a saved scenario cannot become a program. */
export const MAX_STEPS = 20
export const MAX_WAIT_MS = 30_000

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : ''

/** One step, or null when it is not one. Pure. */
export function stepOf(raw: unknown): Step | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  switch (r.do) {
    case 'open': {
      const url = str(r.url, 500)
      return /^https:\/\/[\w.-]+\.[a-z]{2,}(\/|$)/i.test(url)
        ? { do: 'open', url }
        : null
    }
    case 'press': {
      const words = str(r.words, 120)
      return words ? { do: 'press', words } : null
    }
    case 'type': {
      const text = str(r.text, 2000)
      return text ? { do: 'type', text } : null
    }
    case 'ask': {
      const kind = str(r.kind, 20)
      const why = str(r.why, 300)
      return ['password', 'code', 'email', 'text'].includes(kind) && why
        ? { do: 'ask', kind: kind as 'password', why }
        : null
    }
    case 'wait': {
      const ms = Number(r.ms)
      return Number.isFinite(ms) && ms > 0
        ? { do: 'wait', ms: Math.min(Math.round(ms), MAX_WAIT_MS) }
        : null
    }
    case 'expect': {
      const words = str(r.words, 120)
      return words ? { do: 'expect', words } : null
    }
    default:
      return null
  }
}

/** A scenario from a saved row, or null. Pure. */
export function scenarioOf(raw: unknown): Scenario | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = str(r.id, 60).toLowerCase()
  const name = str(r.name, 120) || id
  const steps = Array.isArray(r.steps)
    ? r.steps.map(stepOf).filter((s): s is Step => Boolean(s))
    : []
  if (!id || !steps.length) return null
  return { id, name, steps: steps.slice(0, MAX_STEPS) }
}

/**
 * A SECRET IS NEVER IN A SCENARIO. A `type` step that looks like somebody
 * pasted their password into the recipe is refused -- the `ask` step exists
 * for exactly that, and it never sees the answer either. Pure.
 */
const SECRET_WORDS = /(password|passcode|otp|2fa|secret|token|пароль|код из)/i // cyrillic-ok: the words people write
export function carriesASecret(s: Scenario): boolean {
  return s.steps.some(
    step => step.do === 'type' && SECRET_WORDS.test(step.text)
  )
}

/** What the agent can do while running a scenario. Injected, so it is tested. */
export interface ScenarioIo {
  open: (url: string) => Promise<void>
  press: (words: string) => Promise<string>
  type: (text: string) => Promise<void>
  ask: (kind: string, why: string) => Promise<boolean>
  read: () => Promise<string>
  wait: (ms: number) => Promise<void>
}

export interface RunResult {
  ok: boolean
  done: number
  /** The step that failed, in the person's words, or ''. */
  failed: string
  /** One line per step, for the report. */
  lines: string[]
}

/** What a step says it will do, before it does it. Pure. */
export function stepInWords(step: Step): string {
  switch (step.do) {
    case 'open':
      return `открыть ${step.url.replace(/^https:\/\//, '').slice(0, 60)}` // cyrillic-ok: shown to the person
    case 'press':
      return `нажать «${step.words}»` // cyrillic-ok
    case 'type':
      return `набрать текст (${step.text.length} симв.)` // cyrillic-ok
    case 'ask':
      return `попросить человека ввести: ${step.why}` // cyrillic-ok
    case 'wait':
      return `подождать ${Math.round(step.ms / 1000)} с` // cyrillic-ok
    case 'expect':
      return `убедиться, что на странице есть «${step.words}»` // cyrillic-ok
  }
}

/**
 * Run it. Stops at the first step that fails and says which. Never throws:
 * the caller reports, and a half-finished run must not also lose its report.
 */
export async function runScenario(
  s: Scenario,
  io: ScenarioIo
): Promise<RunResult> {
  if (carriesASecret(s))
    return {
      ok: false,
      done: 0,
      failed: 'в сценарии написан секрет — так нельзя', // cyrillic-ok
      lines: [],
    }
  const lines: string[] = []
  let done = 0
  for (const step of s.steps) {
    const said = stepInWords(step)
    try {
      switch (step.do) {
        case 'open':
          await io.open(step.url)
          break
        case 'press': {
          const label = await io.press(step.words)
          lines.push(
            `✓ ${said}${label && label !== step.words ? ` (${label})` : ''}`
          )
          done += 1
          continue
        }
        case 'type':
          await io.type(step.text)
          break
        case 'ask': {
          const answered = await io.ask(step.kind, step.why)
          if (!answered)
            return {
              ok: false,
              done,
              failed: `${said} — человек не ответил`, // cyrillic-ok
              lines: [...lines, `✗ ${said}`],
            }
          break
        }
        case 'wait':
          await io.wait(step.ms)
          break
        case 'expect': {
          const text = await io.read()
          if (!text.toLowerCase().includes(step.words.toLowerCase()))
            return {
              ok: false,
              done,
              failed: `${said} — этого там нет`, // cyrillic-ok
              lines: [...lines, `✗ ${said}`],
            }
          break
        }
      }
      lines.push(`✓ ${said}`)
      done += 1
    } catch (e) {
      return {
        ok: false,
        done,
        failed: `${said} — ${String(e).slice(0, 120)}`,
        lines: [...lines, `✗ ${said}`],
      }
    }
  }
  return { ok: true, done, failed: '', lines }
}

/**
 * The two runs we have actually done by hand, written down. They are
 * defaults: a row in the database overrides them without a deploy.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'google-sign-in',
    name: 'Войти через Google', // cyrillic-ok: shown to the person
    steps: [
      { do: 'press', words: 'Continue with Google' },
      { do: 'wait', ms: 6000 },
      { do: 'expect', words: 'Google' },
    ],
  },
  {
    id: 'x-thread',
    name: 'Пост в X тредом', // cyrillic-ok
    steps: [
      { do: 'open', url: 'https://x.com/compose/post' },
      { do: 'wait', ms: 8000 },
      { do: 'press', words: 'what is happening' },
      { do: 'wait', ms: 1000 },
    ],
  },
]
