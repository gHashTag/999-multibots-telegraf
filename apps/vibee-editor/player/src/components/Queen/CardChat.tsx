import { useEffect, useRef, useState } from 'react'
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
  const logRef = useRef<HTMLDivElement>(null)

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
            {card.column && (
              <span className="card-chat__column">{card.column}</span>
            )}
            {card.repo && <span className="card-chat__repo">{card.repo}</span>}
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
          {messages.map(m => (
            <div
              key={m.id}
              className={`card-chat__msg card-chat__msg--${m.role}`}
            >
              {m.surface === 'agent' && m.role === 'assistant' && (
                <span className="card-chat__via">{t('cardChat.viaA2A')}</span>
              )}
              {m.text ||
                (m.role === 'assistant' && busy ? t('cardChat.thinking') : '')}
            </div>
          ))}
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
