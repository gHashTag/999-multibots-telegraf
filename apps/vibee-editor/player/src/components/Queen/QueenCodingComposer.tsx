import { useMemo, useState } from 'react'
import { judge, scaffold, type SpecVerdict } from '@vibee/atoms'
import './QueenCodingComposer.css'

/**
 * CODING AT THE QUEEN (owner, 2026-09-27: "let me code new tasks through the
 * Queen; design the coding UX; ALWAYS show why the bees are idle -- that is a
 * blocker and an SOS").
 *
 * You describe a coding task; this shows, live, whether the swarm Queen would
 * TAKE it. The gate is one fact: a `## Boundary` section listing files (judge()
 * from @vibee/atoms -- the same rule the engine and `tri spec` run). Without it
 * the Queen skips the issue, so nothing can be dispatched; the other three
 * sections are quality, shown as a meter but never blocking.
 *
 * ALWAYS ON: the swarm banner. Whenever the swarm is not working it names WHY,
 * as a blocker -- an idle swarm with a full backlog is the failure this whole
 * feature exists to end, so it is never hidden.
 *
 * `onDispatch` receives the delegatable body. Wiring it to the engine (file a
 * delegatable issue in TRIOS_GITHUB_REPO, the swarm picks it up next tick) is
 * the caller's job.
 *
 * Look: pure black, no green fills or glow. Green is a thin signal for a met
 * check and a working swarm; a stalled swarm is a muted-red blocker.
 */

export interface SwarmStatus {
  /** Bees running right now. */
  running: number
  /** Total worker slots. */
  slots: number
  /** Open issues on the board. */
  candidates: number
  /** How many of them pass the delegatable gate. */
  delegatable: number
  /** The engine's own refusal line, when it gave one. */
  refusal?: string | null
  /** The engine has not ticked recently -- it may be down. */
  stale?: boolean
}

export type SwarmLevel = 'sos' | 'idle' | 'work'
export interface SwarmReason {
  level: SwarmLevel
  text: string
}

/**
 * Why the swarm is (not) working, in one line. Pure, so the blocker text is
 * tested rather than eyeballed. An idle swarm always yields a reason; an idle
 * swarm with a full backlog is the recorded failure, named here.
 */
export function swarmReason(s: SwarmStatus | undefined): SwarmReason {
  if (!s)
    return {
      level: 'sos',
      text: 'Статус роя неизвестен — движок не отвечает. SOS.',
    } // cyrillic-ok: UI text
  if (s.stale)
    return { level: 'sos', text: 'Рой не отвечает — движок не тикает. SOS.' } // cyrillic-ok: UI text
  if (s.running > 0) {
    const full = s.slots > 0 && s.running >= s.slots ? ' (полон)' : '' // cyrillic-ok: UI text
    return {
      level: 'work',
      text: `Рой работает: ${s.running}/${s.slots} пчёл${full}.`, // cyrillic-ok: UI text
    }
  }
  if (s.delegatable <= 0)
    return {
      level: 'idle',
      text: `Рой стоит: нечего выбрать — 0 делегируемых из ${s.candidates} открытых (нет ## Boundary). Заведи задачу ниже.`, // cyrillic-ok: UI text
    }
  return {
    level: 'idle',
    text: s.refusal
      ? `Рой стоит: ${s.refusal}.` // cyrillic-ok: UI text
      : `Рой стоит: ${s.delegatable} готовы, но ни одна не взята.`, // cyrillic-ok: UI text
  }
}

const CHECK_LABELS: Record<string, string> = {
  boundary: 'граница', // cyrillic-ok: UI label
  scenarios: 'сценарии', // cyrillic-ok: UI label
  requirements: 'требования', // cyrillic-ok: UI label
  'success criteria': 'критерии', // cyrillic-ok: UI label
}

const GATE_YES = 'рой возьмёт: да' // cyrillic-ok: UI text
const GATE_NO = 'рой возьмёт: нет' // cyrillic-ok: UI text
const TEMPLATE_LABEL = '＋ шаблон' // cyrillic-ok: UI text
const SEND_LABEL = 'Отдать рою ▸' // cyrillic-ok: UI text
const SENT_LABEL = 'Отдано ✓' // cyrillic-ok: UI text
const PLACEHOLDER =
  'Опишите задачу. ## Boundary со списком файлов — единственное, без чего рой не возьмёт.' // cyrillic-ok: UI text
const HINT_FULL = 'Полная спека — пчела стартует, ревью пройдёт по критериям.' // cyrillic-ok: UI text
const HINT_DELEGATABLE =
  'Делегируема. Остальные разделы — качество для строгого ревью.' // cyrillic-ok: UI text
const HINT_BLOCKED =
  'Добавьте ## Boundary с путём к файлу (со «/» или расширением) — без неё рой не берёт задачу.' // cyrillic-ok: UI text

export function QueenCodingComposer({
  onDispatch,
  initialValue = '',
  swarm,
}: {
  onDispatch?: (body: string) => void
  initialValue?: string
  swarm?: SwarmStatus
}) {
  const [body, setBody] = useState(initialValue)
  const [sent, setSent] = useState(false)
  const verdict: SpecVerdict = useMemo(() => judge(body), [body])
  const full = verdict.delegatable && verdict.missing.length === 0
  const reason = swarmReason(swarm)

  const dispatch = () => {
    if (!verdict.delegatable) return
    onDispatch?.(body)
    setSent(true)
    window.setTimeout(() => setSent(false), 1400)
  }

  return (
    <section className="qcode" aria-label="Queen coding" data-ai="off">
      <div
        className={`qcode__swarm is-${reason.level}`}
        role="status"
        aria-live="polite"
      >
        <span className="qcode__bee" aria-hidden="true">
          {reason.level === 'work'
            ? '🐝'
            : reason.level === 'sos'
              ? '🆘'
              : '⚠'}
        </span>
        <span className="qcode__reason">{reason.text}</span>
      </div>

      <div className="qcode__meter" role="status" aria-live="polite">
        {verdict.checks.map(c => (
          <span
            key={c.name}
            className={`qcode__chk${c.met ? ' is-ok' : ''}`}
            title={c.met ? undefined : c.remedy}
          >
            <i className="qcode__dot" aria-hidden="true" />
            {CHECK_LABELS[c.name] ?? c.name}
          </span>
        ))}
        <span
          className={`qcode__gate ${verdict.delegatable ? 'is-yes' : 'is-no'}`}
        >
          <i className="qcode__dot" aria-hidden="true" />
          {verdict.delegatable ? GATE_YES : GATE_NO}
        </span>
      </div>

      <div className="qcode__row">
        <textarea
          id="qcode-body"
          className="qcode__ta"
          spellCheck={false}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder={PLACEHOLDER}
        />
        <div className="qcode__btns">
          <button
            type="button"
            className="qcode__send"
            disabled={!verdict.delegatable}
            onClick={dispatch}
          >
            {sent ? SENT_LABEL : SEND_LABEL}
          </button>
          <button
            type="button"
            className="qcode__ghost"
            onClick={() => setBody(scaffold(''))}
          >
            {TEMPLATE_LABEL}
          </button>
        </div>
      </div>

      <p className="qcode__hint">
        {verdict.delegatable
          ? full
            ? HINT_FULL
            : HINT_DELEGATABLE
          : HINT_BLOCKED}
      </p>
    </section>
  )
}
