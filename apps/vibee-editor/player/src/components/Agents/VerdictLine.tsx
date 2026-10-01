import { verdictLine, type AcceptanceVerdict } from '@/hooks/useAgentAcceptance'

/**
 * A card's line about its last daily check (hooks/useAgentAcceptance.ts
 * verdictLine): one component for the market and the welcome screen.
 * `data-pass` is kept for the market's older styles and tests; `data-tone`
 * adds the stale case.
 */
export function VerdictLine({
  verdict,
  lang,
  className,
  withStreak = false,
}: {
  verdict: AcceptanceVerdict
  lang: 'en' | 'ru'
  className: string
  withStreak?: boolean
}) {
  const line = verdictLine(verdict, lang, withStreak)
  return (
    <p
      className={className}
      data-pass={line.tone === 'pass' ? 'yes' : 'no'}
      data-tone={line.tone}
    >
      {line.text}
    </p>
  )
}
