import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import { DetentSheet } from '@/components/DetentSheet/DetentSheet'
import type { Detent } from '@/lib/sheetDetents'
import { taskMessagesAtomFor } from '@/atoms/agentChat'
import {
  agentBusyThreadsAtom,
  isAgentBusy,
  sendOrQueue,
  stopAgent,
  threadKeyOf,
} from '@/lib/agentStream'
import {
  adoptHistory,
  shouldAdoptHistory,
  turnsFromResponse,
} from '@/lib/agentHistory'
import { CARD_SHEET, cardFromHistory, type OpenCard } from '@/lib/cardChat'
import { answerFor, cardStates, parseCards } from '@/lib/agentCards'
import { readCardStatus, type CardStatus } from '@/lib/cardStatus'
import { AgentCards } from '@/components/Chat/AgentCards'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import './CardChat.css'

/**
 * THE CARD'S CONVERSATION, OVER THE BOARD (spec kanban-card-chat.t27).
 *
 * Mobile first: the sheet rises to HALF so the board stays in sight above it;
 * a drag, or a focus in the composer, takes it to FULL. The composer is pinned
 * to the bottom at every height (COMPOSER_PINNED). GitHub is a small link in
 * the header, never the tap (GITHUB_IS_SECONDARY). The history is the
 * server's task thread -- the same rows `tri card` and any A2A agent write --
 * so what an outside agent said is here when the person opens the card.
 *
 * v2: under the title, the pull requests that name the issue and their
 * checks (lib/cardStatus.ts) -- said as "not measured" when GitHub would not
 * answer, never as "no PR". The agent proposes with approve/decline cards
 * and acts on the tap (ACTIONS_ON_TAP_ONLY); the column is the Queen's
 * verdict, so no move is offered (MOVE_OFFERED false).
 */
export function CardChat({
  card,
  onClose,
  onResolved,
}: {
  card: OpenCard
  onClose: () => void
  /**
   * The server named the card: the full key for a bare `#5382` (history
   * `thread`) and what the board calls it (history `card`).
   */
  onResolved?: (card: OpenCard) => void
}) {
  const { t } = useLanguage()
  const [detent, setDetent] = useState<Detent>(CARD_SHEET.openDetent)
  const thread = taskMessagesAtomFor(card.task)
  const [messages, setMessages] = useAtom(thread)
  const busyThreads = useAtomValue(agentBusyThreadsAtom)
  const key = threadKeyOf({ task: card.task })
  const busy = busyThreads.includes(key)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  // A board title runs to TITLE_MAX; two lines until the thumb asks for all.
  const [titleOpen, setTitleOpen] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<CardStatus | null>(null)

  // The task's work: the server's one read when it has a token, else this
  // client's own read of GitHub's public API.
  useEffect(() => {
    let alive = true
    setStatus(null)
    if (!card.repo) return
    const q = new URLSearchParams({
      repo: card.repo,
      n: String(card.number),
    })
    readCardStatus(card.repo, card.number, {
      door: () =>
        fetch(`${API_BASE}${CARD_SHEET.statusDoor}?${q}`, {
          headers: authHeaders(),
        }),
    }).then(s => alive && setStatus(s))
    return () => {
      alive = false
    }
  }, [card.repo, card.number])

  // The server's thread, read once per card. Silent on failure: the local
  // copy is shown and writing is never blocked by an unreachable history.
  useEffect(() => {
    let alive = true
    setLoading(true)
    const q = new URLSearchParams({
      limit: String(CARD_SHEET.historyLimit),
      [CARD_SHEET.field]: card.task,
    })
    fetch(`${API_BASE}${CARD_SHEET.historyDoor}?${q}`, {
      headers: authHeaders(),
    })
      .then(r => (r.ok ? r.json() : null))
      .then(body => {
        if (!alive) return
        const server = turnsFromResponse(body)
        setMessages(local =>
          shouldAdoptHistory({ server, local, busy: isAgentBusy(key) })
            ? adoptHistory(server)
            : local
        )
        const resolved = cardFromHistory(body, card)
        if (resolved) onResolved?.(resolved)
      })
      .catch(() => undefined)
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
    // One read per card; `key` and `setMessages` follow `card.task`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.task])

  // Newest turn in view, as a chat does.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, detent])

  // Telegram's own Back steps the sheet down one height, then closes it.
  useEffect(() => {
    const back = (
      window as unknown as {
        Telegram?: {
          WebApp?: {
            BackButton?: {
              show: () => void
              hide: () => void
              onClick: (f: () => void) => void
              offClick: (f: () => void) => void
            }
          }
        }
      }
    ).Telegram?.WebApp?.BackButton
    if (!back) return
    const on = () => {
      if (detent === 'full') setDetent('half')
      else onClose()
    }
    back.show()
    back.onClick(on)
    return () => {
      back.offClick(on)
      back.hide()
    }
  }, [detent, onClose])

  const send = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendOrQueue(trimmed, [], { task: card.task })
    setInput('')
  }

  const title =
    card.title && card.title !== `#${card.number}`
      ? card.title
      : t('cardChat.untitled', { n: card.number })
  const issue = card.repo
    ? `https://github.com/${card.repo}/issues/${card.number}`
    : null
  let lastAnswer = -1
  messages.forEach((m, i) => {
    if (m.role === 'assistant') lastAnswer = i
  })
  const cardsOf = (text: string, idx: number) => {
    const { cards } = parseCards(text)
    if (cards.length === 0) return null
    const later = messages
      .slice(idx + 1)
      .filter(x => x.role === 'user')
      .map(x => x.text || '')
    return (
      <AgentCards
        cards={cards}
        states={cardStates(cards, later)}
        actionable={idx === lastAnswer && !busy}
        onAnswer={(chosen, approve) => send(answerFor(chosen, approve))}
      />
    )
  }
  const starters = [
    t('cardChat.starter.state'),
    t('cardChat.starter.continue'),
    t('cardChat.starter.lacks'),
  ]

  return (
    <DetentSheet
      detent={detent}
      onDetent={d => setDetent(d)}
      label={t('cardChat.label', { n: card.number })}
      className="card-chat-sheet"
      // The body says the number and the whole title; the handle need not.
      compactHandle
      peek={
        <div className="card-chat__peek">
          <span className="card-chat__no">#{card.number}</span>
          <span className="card-chat__title">{title}</span>
          {busy && (
            <span className="card-chat__busy">{t('cardChat.busy')}</span>
          )}
        </div>
      }
    >
      <div className="card-chat" role="dialog" aria-label={title}>
        <header className="card-chat__head">
          <div className="card-chat__meta">
            <span className="card-chat__no">#{card.number}</span>
            {card.column && (
              <span className="card-chat__column" title={t('cardChat.verdict')}>
                {card.column}
              </span>
            )}
            {card.repo && (
              // The owner is every card's (TASK_OWNER); the name is the news.
              <span className="card-chat__repo" title={card.repo}>
                {card.repo.split('/').pop()}
              </span>
            )}
          </div>
          {issue && (
            <a
              className="card-chat__github"
              href={issue}
              target="_blank"
              rel="noreferrer noopener"
            >
              GitHub ↗
            </a>
          )}
          <button
            type="button"
            className="card-chat__close"
            onClick={onClose}
            aria-label={t('cardChat.close')}
          >
            ×
          </button>
        </header>
        <button
          type="button"
          className={`card-chat__heading${titleOpen ? ' card-chat__heading--open' : ''}`}
          aria-expanded={titleOpen}
          onClick={() => setTitleOpen(o => !o)}
        >
          {title}
        </button>
        {card.repo && (
          <WorkStrip
            status={status}
            issue={issue}
            label={t('cardChat.status.label')}
          />
        )}
        <div
          className="card-chat__log"
          ref={logRef}
          role="log"
          aria-live="polite"
        >
          {messages.length === 0 && (
            <div className="card-chat__empty">
              <p>{loading ? t('cardChat.loading') : t('cardChat.empty')}</p>
              {!loading && (
                <div className="card-chat__starters">
                  {starters.map(s => (
                    <button
                      key={s}
                      type="button"
                      className="card-chat__starter"
                      onClick={() => send(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m, idx) => {
            const assistant = m.role === 'assistant'
            // The markers are the agent's proposals; the bubble shows words.
            const text = assistant ? parseCards(m.text || '').text : m.text
            return (
              <div key={m.id} className="card-chat__turn">
                <div className={`card-chat__msg card-chat__msg--${m.role}`}>
                  {m.surface === 'agent' && assistant && (
                    <span className="card-chat__via">
                      {t('cardChat.viaA2A')}
                    </span>
                  )}
                  {text || (assistant && busy ? t('cardChat.thinking') : '')}
                </div>
                {assistant && m.text && cardsOf(m.text, idx)}
              </div>
            )
          })}
        </div>
        <form
          className="card-chat__composer"
          onSubmit={e => {
            e.preventDefault()
            send(input)
          }}
        >
          <textarea
            className="card-chat__input"
            value={input}
            rows={1}
            placeholder={t('cardChat.placeholder')}
            aria-label={t('cardChat.placeholder')}
            onFocus={() => setDetent('full')}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
          />
          {busy ? (
            <button
              type="button"
              className="card-chat__send card-chat__send--stop"
              onClick={() => stopAgent(key)}
              aria-label={t('cardChat.stop')}
            >
              ■
            </button>
          ) : (
            <button
              type="submit"
              className="card-chat__send"
              disabled={!input.trim()}
              aria-label={t('cardChat.send')}
            >
              ↑
            </button>
          )}
        </form>
      </div>
    </DetentSheet>
  )
}

/**
 * The pull requests that name the issue, one short row the thumb can
 * scroll; each chip is a way out to GitHub (GITHUB_IS_SECONDARY), never an
 * action. A read that did not happen says so and, if GitHub said, when.
 */
function WorkStrip({
  status,
  issue,
  label,
}: {
  status: CardStatus | null
  issue: string | null
  label: string
}) {
  const { t } = useLanguage()
  let body: ReactNode
  if (status === null)
    body = (
      <span className="card-chat__work-note">
        {t('cardChat.status.reading')}
      </span>
    )
  else if (status.kind === 'unmeasured')
    body = (
      <span
        className="card-chat__work-note card-chat__work-note--unmeasured"
        data-retry-at={status.retryAt ?? undefined}
      >
        {status.retryAt
          ? t('cardChat.status.retryAt', {
              time: new Date(status.retryAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })
          : t('cardChat.status.unmeasured')}
      </span>
    )
  else if (status.kind === 'none')
    body = (
      <span className="card-chat__work-note">{t('cardChat.status.none')}</span>
    )
  else
    body = (
      <>
        {status.prs.map(p => {
          const state = p.state === 'open' && p.draft ? 'draft' : p.state
          const checks = p.state === 'open' ? (p.checks ?? 'unknown') : null
          return (
            <a
              key={`${p.repo}#${p.number}`}
              className={`card-chat__pr card-chat__pr--${state}`}
              href={p.url}
              target="_blank"
              rel="noreferrer noopener"
              title={p.title}
            >
              <span className="card-chat__pr-no">
                {p.repo.split('/').pop()}#{p.number}
              </span>
              <span className="card-chat__pr-state">
                {t(`cardChat.pr.${state}`)}
              </span>
              {checks && (
                <span
                  className={`card-chat__checks card-chat__checks--${checks}`}
                  aria-label={t(`cardChat.checks.${checks}`)}
                  title={t(`cardChat.checks.${checks}`)}
                />
              )}
            </a>
          )
        })}
        {(status.more > 0 || status.partial) && issue && (
          <a
            className="card-chat__pr card-chat__pr--more"
            href={issue}
            target="_blank"
            rel="noreferrer noopener"
          >
            {!status.partial
              ? t('cardChat.status.more', { n: status.more })
              : status.more > 0
                ? t('cardChat.status.moreAtLeast', { n: status.more })
                : t('cardChat.status.moreUnread')}
          </a>
        )}
      </>
    )
  return (
    <section className="card-chat__work" aria-label={label} aria-live="polite">
      {body}
    </section>
  )
}
