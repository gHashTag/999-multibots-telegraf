import type { AcceptanceVerdict } from '@/hooks/useAgentAcceptance'
import { checkedTools } from './toolWords'

const COPY = {
  en: {
    summary: (n: number) => `What the check called (${n})`,
    times: (n: number) => `×${n}`,
  },
  ru: {
    summary: (n: number) => `Что вызвала проверка (${n})`,
    times: (n: number) => `×${n}`,
  },
} as const

/**
 * Under a card's verdict line: the calls the last daily check made, folded
 * by default (a native <details>, so it opens by keyboard and needs no
 * script). Nothing when the run recorded no calls.
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
  if (lines.length === 0) return null
  const text = COPY[lang]
  return (
    <details className={className}>
      <summary>{text.summary(calls.length)}</summary>
      <ul>
        {lines.map(line => (
          <li key={line.name}>
            {line.label}
            {line.times > 1 ? (
              <span className="checked-tools__times">
                {' '}
                {text.times(line.times)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  )
}
