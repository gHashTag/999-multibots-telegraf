import { useAtom } from 'jotai'
import { useEffect, useMemo, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { agentMessagesAtomFor } from '@/atoms/agentChat'
import { SendCardView } from '@/components/Chat/SendCardView'
import type { ClientTimeline as Timeline, TimelineEvent } from '@/lib/crm'
import { waitingCards } from '@/lib/sendCards'

/**
 * THE CLIENT CARD AS THE MAIN DASHBOARD (owner, 2026-09-26: "do all three").
 *
 *  - ClientSummary: the numbers above everything -- did they pay, how much we
 *    talked each way, how much they say in groups, since when we know them.
 *  - ClientFeed:    everything that happened with this person on one line of
 *    time -- DMs, their group lines, our touches (render crm-client-timeline).
 *  - ClientDrafts:  the send cards for this client still waiting for the
 *    owner's press, gathered out of the conversation so none is lost in the
 *    scroll. The server issues a card's one-time secret only into the answer
 *    that made it, so the cards the app already holds are the only pressable
 *    ones -- this lists exactly those, and pressing one is the same press as
 *    under the answer.
 */

const dayOf = (iso: string | null, lang: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
      })
}

const monthOf = (iso: string | null, lang: string): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-GB', {
        month: 'short',
        year: '2-digit',
      })
}

export function ClientSummary({ timeline }: { timeline: Timeline | null }) {
  const { t, lang } = useLanguage()
  if (!timeline) return null
  const s = timeline.stats
  return (
    <dl className="chat-aside__pulse chat-aside__summary">
      <div data-good={s.paid ? 'yes' : undefined}>
        <dt>{t('crm.summary.paid')}</dt>
        <dd
          title={
            s.lastPaidAt
              ? t('crm.summary.paid.last', { date: dayOf(s.lastPaidAt, lang) })
              : undefined
          }
        >
          {s.revenue
            ? `⭐ ${s.revenue.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB')}`
            : s.paid === null
              ? '—'
              : s.paid
                ? t('crm.summary.paid.yes')
                : t('crm.summary.paid.no')}
        </dd>
      </div>
      <div>
        <dt>{t('crm.summary.talk')}</dt>
        <dd title={t('crm.summary.talk.hint')}>
          ↓{s.inbound}·↑{s.outbound}
        </dd>
      </div>
      <div>
        <dt>{t('crm.summary.groups')}</dt>
        <dd>{s.groupPosts}</dd>
      </div>
      <div>
        <dt>{t('crm.summary.since')}</dt>
        <dd>{monthOf(s.firstAt, lang)}</dd>
      </div>
    </dl>
  )
}

const TOUCH_KEYS = new Set([
  'written',
  'replied',
  'later',
  'refused',
  'bought',
  'note',
])

function EventLine({ e, lang }: { e: TimelineEvent; lang: string }) {
  const { t } = useLanguage()
  // The dictionary names every move the card offers; an unknown id is shown
  // as it is rather than as a missing-key string.
  const moveName = (id: string) => {
    const k = `crm.move.${id}`
    const name = t(k)
    return name && name !== k ? name : id
  }
  const label =
    e.kind === 'touch'
      ? e.touch && TOUCH_KEYS.has(e.touch)
        ? t(`crm.feed.touch.${e.touch}`)
        : e.touch || t('crm.feed.touch.note')
      : e.kind === 'group'
        ? t('crm.feed.group', { group: e.chatTitle || e.chat || '' })
        : t(`crm.feed.${e.kind}`)
  // A pressed move is recorded as a note "move:<id>"; say it in words.
  const text =
    e.kind === 'touch' && e.text.startsWith('move:')
      ? t('crm.feed.move', { move: moveName(e.text.slice(5).trim()) })
      : e.text
  return (
    <li
      className="chat-aside__event"
      data-kind={e.kind}
      data-touch={e.touch ?? undefined}
    >
      <span className="chat-aside__event-meta">
        <span className="chat-aside__muted">{dayOf(e.at, lang)}</span>{' '}
        <b>{label}</b>
      </span>
      {text ? <span className="chat-aside__event-text">{text}</span> : null}
    </li>
  )
}

export function ClientFeed({ timeline }: { timeline: Timeline }) {
  const { t, lang } = useLanguage()
  const [filter, setFilter] = useState<'all' | TimelineEvent['kind']>('all')
  const [shown, setShown] = useState(15)
  const events = useMemo(
    () =>
      filter === 'all'
        ? timeline.events
        : timeline.events.filter(e =>
            filter === 'in'
              ? e.kind === 'in' || e.kind === 'out'
              : e.kind === filter
          ),
    [timeline, filter]
  )
  if (!timeline.events.length)
    return <p className="chat-aside__off">{t('crm.feed.empty')}</p>
  return (
    <>
      <div className="chat-aside__feed-filter" role="group">
        {(['all', 'in', 'group', 'touch'] as const).map(f => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'is-on' : ''}
            onClick={() => {
              setFilter(f)
              setShown(15)
            }}
          >
            {t(`crm.feed.filter.${f}`)}
          </button>
        ))}
      </div>
      <ul className="chat-aside__list chat-aside__feed">
        {events.slice(0, shown).map((e, i) => (
          <EventLine key={`${e.at}-${i}`} e={e} lang={lang} />
        ))}
      </ul>
      {events.length > shown ? (
        <button
          type="button"
          className="chat-aside__more"
          onClick={() => setShown(n => n + 20)}
        >
          {t('crm.feed.more', { n: events.length - shown })}
        </button>
      ) : null}
    </>
  )
}

export function ClientDrafts({ client }: { client: string }) {
  const { t } = useLanguage()
  const [messages, setMessages] = useAtom(agentMessagesAtomFor(client))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  // A card being sent or just answered stays on screen until it settles,
  // so the press shows its result here rather than vanishing.
  const [settling, setSettling] = useState<string[]>([])
  const live = waitingCards(messages, now)
  const shown = [
    ...live,
    ...messages
      .filter(m => m.sendCard && settling.includes(m.id))
      .filter(m => !live.some(l => l.messageId === m.id))
      .map(m => ({ messageId: m.id, card: m.sendCard! })),
  ]
  if (!shown.length) return null
  return (
    <section className="chat-aside__drafts" aria-label={t('crm.drafts.title')}>
      <h3 className="chat-aside__label">
        {t('crm.drafts.title')} · {live.length}
      </h3>
      {shown.map(({ messageId, card }) => (
        <SendCardView
          key={messageId}
          card={card}
          onChange={next => {
            setSettling(s => (s.includes(messageId) ? s : [...s, messageId]))
            setMessages(list =>
              list.map(m => (m.id === messageId ? { ...m, sendCard: next } : m))
            )
          }}
        />
      ))}
    </section>
  )
}
