import { useEffect, useState } from 'react'
import { API_BASE } from '@/config'

/**
 * WHAT THE LAST ACCEPTANCE RUN SAID ABOUT EACH AGENT.
 *
 * Competitor scan, 2026-09-24: agent marketplaces sell on verified
 * performance, not on the card's adjectives. Our acceptance run (`tri
 * agents`) posts its verdicts to render (agent-acceptance.ts); this reads the
 * newest one per agent so the card can say "checked on <date>" -- or that
 * the last check failed.
 *
 * null = not answered (or the server could not tell): the card then shows
 * no line at all rather than "never checked", which would be a claim.
 */
export interface AcceptanceVerdict {
  agent: string
  pass: boolean
  at: string
  tools: string[]
  codes: string[]
  /** Passing days in a row (render agent-acceptance.ts streakOf). */
  streak?: number
  /** Seven of them: the trainee is hireable by evidence. */
  earned?: boolean
}

export function useAgentAcceptance(): Record<string, AcceptanceVerdict> | null {
  const [byAgent, setByAgent] = useState<Record<
    string,
    AcceptanceVerdict
  > | null>(null)
  useEffect(() => {
    let live = true
    void fetch(`${API_BASE}/api/agents/acceptance`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { verdicts?: AcceptanceVerdict[] } | null) => {
        if (!live || !Array.isArray(d?.verdicts)) return
        setByAgent(Object.fromEntries(d.verdicts.map(v => [v.agent, v])))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])
  return byAgent
}

/** "24 Sep" / "24 сент.": the day of the check, in the reader's language. Pure. */
export function checkedDay(iso: string, lang: 'en' | 'ru'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
}

/**
 * Has this trainee EARNED the market (seven passing days, render
 * agent-acceptance.ts)? null while the answer is on its way; false when it
 * is not, or when the server could not tell -- a trainee is never opened on
 * an unanswered question. `enabled` keeps the question off pages that do
 * not need it.
 */
export function useEarnedAgent(
  agentId: string | null,
  enabled: boolean
): boolean | null {
  const [earned, setEarned] = useState<boolean | null>(null)
  useEffect(() => {
    if (!enabled || !agentId) return
    let live = true
    void fetch(`${API_BASE}/api/agents/acceptance`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: { verdicts?: AcceptanceVerdict[] } | null) => {
        if (!live) return
        const v = d?.verdicts?.find(x => x.agent === agentId)
        setEarned(v?.earned === true)
      })
      .catch(() => {
        if (live) setEarned(false)
      })
    return () => {
      live = false
    }
  }, [agentId, enabled])
  return enabled && agentId ? earned : false
}
