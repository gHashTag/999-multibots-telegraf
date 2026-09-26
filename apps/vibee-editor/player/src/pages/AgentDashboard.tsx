import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import { turnsFromResponse } from '@/lib/agentHistory'
import { useLanguage } from '@/hooks/useLanguage'
import { useIsKeeper } from '@/hooks/useIsKeeper'
import { checkedDay, useAgentAcceptance } from '@/hooks/useAgentAcceptance'
import { AgentSkillsPanel } from '@/components/Chat/AgentSkillsPanel'
import { marketplaceAgentById } from '../../../packages/vibee-atoms/src/agent-marketplace'
import { agentGate } from './agentSuggestions'
import './AgentDashboard.css'

/**
 * EVERY AGENT HAS ITS OWN DASHBOARD (owner, 2026-09-26).
 *
 * The market card sells an agent; the chat is where it works. What was
 * missing is the one screen that says how it is doing: the last daily check
 * and the streak toward hiring, what it knows how to do and which of the
 * owner's rules it carries (the same panel its chat shows), what it last
 * answered, what it promises never to do -- and the ways in.
 *
 * Nothing here is invented: a section with no answer from the server is not
 * drawn ("never checked" would be a claim), and the recent work is read from
 * the agent's own thread only when this person may open it.
 */
export const STREAK_DAYS = 7
export const RECENT_TURNS = 3

/** The last few answers of a thread, newest first, trimmed. Pure. */
export function recentAnswers(
  turns: ReadonlyArray<{ role: string; content: string }>,
  n = RECENT_TURNS
): string[] {
  return turns
    .filter(t => t.role === 'assistant' && t.content.trim())
    .slice(-n)
    .reverse()
    .map(t => {
      const one = t.content.replace(/\s+/g, ' ').trim()
      return one.length > 220 ? `${one.slice(0, 219)}…` : one
    })
}

function useRecentWork(agentId: string, open: boolean): string[] | null {
  const [recent, setRecent] = useState<string[] | null>(null)
  useEffect(() => {
    if (!open) return
    let live = true
    fetch(
      `${API_BASE}/api/agent/history?limit=20&agent=${encodeURIComponent(agentId)}`,
      { headers: authHeaders() }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (live && body) setRecent(recentAnswers(turnsFromResponse(body)))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [agentId, open])
  return open ? recent : null
}

export default function AgentDashboardPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const agent = marketplaceAgentById(agentId)
  const { t, lang } = useLanguage()
  const l: 'ru' | 'en' = lang === 'ru' ? 'ru' : 'en'
  const keeper = useIsKeeper(agent !== null && agent.status !== 'live')
  const verdicts = useAgentAcceptance()
  const verdict = agent ? verdicts?.[agent.id] : undefined
  const gate = agent
    ? agentGate({
        id: agent.id,
        status: agent.status,
        keeper,
        earned: verdicts ? verdict?.earned === true : null,
      })
    : 'market'
  const canOpen = agent !== null && gate === agent.id
  const recent = useRecentWork(agent?.id ?? '', canOpen)
  if (!agent) return <Navigate to="/agents" replace />

  const streak = typeof verdict?.streak === 'number' ? verdict.streak : null
  return (
    <div className="agent-dash" data-testid="agent-dashboard">
      <Link className="agent-dash__back" to="/agents">
        ← {t('agents.dash.market')}
      </Link>
      <header className="agent-dash__head">
        <span className="agent-dash__icon" aria-hidden="true">
          {agent.icon}
        </span>
        <div>
          <h1 className="agent-dash__name">{agent.name[l]}</h1>
          <p className="agent-dash__role">{agent.role[l]}</p>
        </div>
        <span
          className={`agent-dash__status agent-dash__status--${agent.status}`}
          data-testid="agent-dash-status"
        >
          {verdict?.earned && agent.status !== 'live'
            ? t('agents.dash.status.earned')
            : t(`agents.dash.status.${agent.status}`)}
        </span>
      </header>
      <p className="agent-dash__promise">{agent.promise[l]}</p>

      <section className="agent-dash__card" data-testid="agent-dash-check">
        <h2>{t('agents.dash.check')}</h2>
        {verdict ? (
          <>
            <p
              className={`agent-dash__verdict agent-dash__verdict--${verdict.pass ? 'pass' : 'fail'}`}
            >
              {verdict.pass
                ? t('agents.dash.passed', { day: checkedDay(verdict.at, l) })
                : t('agents.dash.failed', {
                    day: checkedDay(verdict.at, l),
                    codes: verdict.codes.join(', ') || '—',
                  })}
            </p>
            {streak !== null ? (
              <>
                <div
                  className="agent-dash__streak"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={STREAK_DAYS}
                  aria-valuenow={Math.min(streak, STREAK_DAYS)}
                >
                  <span
                    style={{
                      width: `${Math.round((Math.min(streak, STREAK_DAYS) / STREAK_DAYS) * 100)}%`,
                    }}
                  />
                </div>
                <p className="agent-dash__muted">
                  {t('agents.dash.streak', { n: streak, of: STREAK_DAYS })}
                </p>
              </>
            ) : null}
            {verdict.tools.length ? (
              <p className="agent-dash__muted">
                {t('agents.dash.tools', { tools: verdict.tools.join(' · ') })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="agent-dash__muted">{t('agents.dash.noCheck')}</p>
        )}
      </section>

      <section className="agent-dash__card">
        <h2>{t('agents.dash.skills')}</h2>
        <AgentSkillsPanel agentId={agent.id} />
      </section>

      {canOpen ? (
        <section className="agent-dash__card" data-testid="agent-dash-recent">
          <h2>{t('agents.dash.recent')}</h2>
          {recent === null ? null : recent.length ? (
            <ul className="agent-dash__recent">
              {recent.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="agent-dash__muted">{t('agents.dash.noWork')}</p>
          )}
        </section>
      ) : null}

      {agent.evidence.length ? (
        <section className="agent-dash__card">
          <h2>{t('agents.dash.promises')}</h2>
          <ul className="agent-dash__evidence">
            {agent.evidence.map(e => (
              <li key={e.en}>{e[l]}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="agent-dash__actions">
        {canOpen ? (
          <Link
            className="agent-dash__cta"
            to={`/agents/${agent.id}/work`}
            data-testid="agent-dash-open"
          >
            {t('agents.dash.open')} →
          </Link>
        ) : (
          <span className="agent-dash__cta agent-dash__cta--disabled">
            {t('agents.dash.wait')}
          </span>
        )}
        <Link className="agent-dash__link" to="/crm">
          {t('agents.dash.clients')}
        </Link>
      </div>
    </div>
  )
}
