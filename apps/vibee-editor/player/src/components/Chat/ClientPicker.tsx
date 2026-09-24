import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { Avatar } from '@/components/Crm/Avatar'
import {
  appendClients,
  loadClientsPage,
  matches,
  type ClientRow,
  type Reached,
} from '@/lib/crm'
import './ClientPicker.css'

/**
 * EVERY CLIENT, NOT ONLY THE TWELVE IN THE ROW.
 *
 * Owner, 2026-09-24: "make it possible to see ANY client, not only the ones
 * on the screen". The circles above the chat show the twelve most recent,
 * which is right for a glance and wrong for "where is Farisha?". This sheet
 * is the rest: every person, a page at a time, searched ON THE SERVER for
 * two letters or more (the contact book puts hundreds in the CRM, #2947),
 * by name, @username or id, with
 * the filter that matters for selling -- everybody, those who paid, those we
 * never sold to -- and a press opens that person's conversation.
 *
 * The search is the CRM screen's own `matches`, not a second copy of it.
 */
export type PickerFilter = 'all' | 'paid' | 'leads'

/** One page of people; the next arrives on "more". */
export const PAGE = 100

export function pickClients(
  rows: ClientRow[],
  q: string,
  filter: PickerFilter
): ClientRow[] {
  const recency = (r: ClientRow) =>
    r.lastSeen ? Date.parse(r.lastSeen) || 0 : 0
  return rows
    .filter(r => /^\d{5,15}$/.test(r.telegramId))
    .filter(r =>
      filter === 'paid' ? r.paid : filter === 'leads' ? !r.paid : true
    )
    .filter(r => matches(r, q))
    .sort((a, b) => recency(b) - recency(a))
}

export function ClientPicker({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [state, setState] = useState<Reached<ClientRow[]> | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<PickerFilter>('all')
  const search = useRef<HTMLInputElement>(null)

  const [more, setMore] = useState<'idle' | 'loading' | 'done'>('idle')

  useEffect(() => {
    let live = true
    void loadClientsPage({ limit: PAGE }).then(r => {
      if (!live) return
      setState({
        reachable: r.reachable,
        data: r.data?.clients ?? null,
        error: r.error,
      })
      if ((r.data?.clients.length ?? 0) < PAGE) setMore('done')
    })
    search.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      live = false
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Somebody not on the loaded pages is still found: the server searches
  // everybody, and what it finds is ADDED to the list, never replaces it.
  useEffect(() => {
    const needle = q.trim()
    if (needle.length < 2) return
    let live = true
    const timer = window.setTimeout(() => {
      void loadClientsPage({ limit: PAGE, query: needle }).then(r => {
        if (!live || !r.data) return
        const found = r.data.clients
        setState(prev =>
          prev?.data
            ? { ...prev, data: appendClients(prev.data, found) }
            : { reachable: true, data: found }
        )
      })
    }, 250)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
  }, [q])

  const loadMore = async () => {
    if (!state?.data || more !== 'idle') return
    setMore('loading')
    const r = await loadClientsPage({ limit: PAGE, offset: state.data.length })
    const next = r.data?.clients ?? []
    setState(prev =>
      prev?.data ? { ...prev, data: appendClients(prev.data, next) } : prev
    )
    setMore(next.length < PAGE ? 'done' : 'idle')
  }

  const rows = useMemo(
    () => pickClients(state?.data ?? [], q, filter),
    [state, q, filter]
  )

  return (
    <div className="client-picker" role="dialog" aria-modal="true">
      <div className="client-picker__backdrop" onClick={onClose} />
      <div className="client-picker__sheet">
        <div className="client-picker__head">
          <h3>{t('picker.title')}</h3>
          <button
            type="button"
            className="client-picker__close"
            aria-label={t('crm.aside.close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <input
          ref={search}
          type="search"
          className="client-picker__search"
          placeholder={t('crm.filter.search')}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div className="client-picker__filters" role="group">
          {(['all', 'paid', 'leads'] as const).map(f => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={filter === f ? 'is-on' : ''}
              onClick={() => setFilter(f)}
            >
              {t(`picker.filter.${f}`)}
            </button>
          ))}
          {state?.data ? (
            <span className="client-picker__count">{rows.length}</span>
          ) : null}
        </div>
        <ul className="client-picker__list">
          {state === null ? (
            <li className="client-picker__empty">…</li>
          ) : !state.reachable ? (
            <li className="client-picker__empty">
              {t('crm.client.unreachable')}
            </li>
          ) : rows.length === 0 ? (
            <li className="client-picker__empty">{t('picker.none')}</li>
          ) : (
            rows.map(r => {
              const label =
                r.name?.trim() || (r.username ? `@${r.username}` : r.telegramId)
              return (
                <li key={r.telegramId}>
                  <button
                    type="button"
                    className="client-picker__row"
                    onClick={() => {
                      onClose()
                      navigate(`/crm/${r.telegramId}/chat`)
                    }}
                  >
                    <Avatar name={label} url={r.avatarUrl} size={40} />
                    <span className="client-picker__who">
                      <b>{label}</b>
                      <small>
                        {r.username ? `@${r.username} · ` : ''}
                        {t(`crm.stage.${r.stage}`)}
                        {r.client ? ` · ${r.client}` : ''}
                      </small>
                    </span>
                    {r.paid ? (
                      <span className="client-picker__paid">
                        {t('crm.clients.paid')}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })
          )}
          {state?.data && more !== 'done' && !q.trim() ? (
            <li>
              <button
                type="button"
                className="client-picker__more"
                disabled={more === 'loading'}
                onClick={() => void loadMore()}
              >
                {more === 'loading' ? '…' : t('picker.more')}
              </button>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  )
}
