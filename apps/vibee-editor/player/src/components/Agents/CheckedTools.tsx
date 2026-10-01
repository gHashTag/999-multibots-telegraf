import type { AcceptanceVerdict } from '@/hooks/useAgentAcceptance'
import { checkedTools, failReasons } from './checkWords'

const COPY = {
  en: {
    called: (n: number) => `What the check called (${n})`,
    why: 'Why it failed',
    calledHead: 'What it called',
  },
  ru: {
    called: (n: number) => `Что вызвала проверка (${n})`,
    why: 'Почему не прошла',
    calledHead: 'Что вызвала',
  },
} as const

/**
 * Under a card's verdict line, the receipt for it, folded by default (a
 * native <details>: opens by keyboard, needs no script). A pass shows the
 * calls the last daily check made; a failure leads with why it failed,
 * then the calls it did make. Nothing when there is nothing to show.
 */
export function CheckedTools({
  verdict,
  lang,
  className,
}: {
  verdict: AcceptanceVerdict
  lang: 'en' | 'ru'
  className: string
}) {
  const calls = Array.isArray(verdict.tools) ? verdict.tools : []
  const lines = checkedTools(calls, lang)
  const reasons =
    !verdict.pass && Array.isArray(verdict.codes)
      ? failReasons(verdict.codes, lang)
      : []
  if (lines.length === 0 && reasons.length === 0) return null
  const text = COPY[lang]
  const callList =
    lines.length > 0 ? (
      <ul className="checked-tools__calls">
        {lines.map(line => (
          <li key={line.name}>
            {line.label}
            {line.times > 1 ? (
              <span className="checked-tools__times"> ×{line.times}</span>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null
  if (reasons.length === 0) {
    return (
      <details className={className}>
        <summary>{text.called(calls.length)}</summary>
        {callList}
      </details>
    )
  }
  return (
    <details className={className} data-tone="fail">
      <summary>{text.why}</summary>
      <ul className="checked-tools__reasons">
        {reasons.map(reason => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
      {callList ? (
        <>
          <p className="checked-tools__head">{text.calledHead}</p>
          {callList}
        </>
      ) : null}
    </details>
  )
}
