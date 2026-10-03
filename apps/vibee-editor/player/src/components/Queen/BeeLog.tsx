import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '@/config'
import { authHeaders } from '@/lib/apiFetch'
import * as SPEC from '@/spec/kanban-card-chat.gen'
import {
  commandHead,
  nextPollS,
  toolCount,
  workFrom,
  workQuery,
  type BeeRow,
  type BeeWork,
} from '@/lib/cardWork'
import './BeeLog.css'

/**
 * Ask render for the bee on this card (BEE_DOOR) while the sheet is open:
 * every BEE_POLL_S while it runs and the person watches, BEE_IDLE_POLL_S
 * otherwise, never while the page is hidden, and not at all once render says
 * it has no token. A bare `#5382` (no repository yet) waits for the history
 * to name the card.
 */
export function useBeeWork(
  task: string,
  repo: string,
  watching: boolean
): BeeWork {
  const [work, setWork] = useState<BeeWork>({ kind: 'reading' })
  const had = useRef<BeeWork>(work)
  const watchingNow = useRef(watching)
  watchingNow.current = watching
  const askNow = useRef<() => void>(() => undefined)

  useEffect(() => {
    let alive = true
    let busy = false
    let timer: ReturnType<typeof setTimeout> | undefined
    had.current = { kind: 'reading' }
    setWork(had.current)
    if (!repo) return
    const ask = async () => {
      if (busy || !alive) return
      clearTimeout(timer)
      if (typeof document !== 'undefined' && document.hidden) {
        timer = setTimeout(ask, SPEC.BEE_IDLE_POLL_S * 1000)
        return
      }
      busy = true
      let status = 0
      let body: unknown = null
      try {
        const r = await fetch(
          `${API_BASE}${SPEC.BEE_DOOR}?${workQuery(task, had.current)}`,
          { headers: authHeaders() }
        )
        status = r.status
        body = await r.json().catch(() => null)
      } catch {
        status = 0
      }
      busy = false
      if (!alive) return
      had.current = workFrom(had.current, status, body)
      setWork(had.current)
      const s = nextPollS(had.current, watchingNow.current)
      if (s !== null) timer = setTimeout(ask, s * 1000)
    }
    askNow.current = () => void ask()
    void ask()
    return () => {
      alive = false
      clearTimeout(timer)
      askNow.current = () => undefined
    }
  }, [task, repo])

  // Turning to the bee asks at once rather than at the idle pace.
  useEffect(() => {
    if (watching) askNow.current()
  }, [watching])

  return work
}

const ICONS: Record<string, string> = {
  bash: '$',
  read: '📄',
  write: '✎',
  edit: '✎',
  ls: '📁',
  grep: '🔎',
  search: '🔎',
}

function clock(at: string, seconds = true): string {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
  })
}

function Row({ row }: { row: BeeRow }) {
  const { t } = useLanguage()
  const time = clock(row.at)
  if (row.kind === 'tool') {
    const line = row.text.trim()
    const first = line.split(/\s+/)[0] ?? ''
    const head = row.tool === 'bash' && commandHead(line) ? first : null
    const rest = head ? line.slice(first.length) : row.text
    return (
      <li className="bee-log__row bee-log__row--tool" data-tool={row.tool}>
        <span className="bee-log__icon" aria-label={row.tool}>
          {ICONS[row.tool ?? ''] ?? '⚙'}
        </span>
        <code className="bee-log__cmd">
          {row.tool !== 'bash' && (
            <span className="bee-log__tool">{row.tool} </span>
          )}
          {head && <b className="bee-log__cli">{head}</b>}
          {rest}
        </code>
        {time && <time className="bee-log__at">{time}</time>}
      </li>
    )
  }
  if (row.kind === 'result') {
    return (
      <li
        className={`bee-log__row bee-log__row--result bee-log__row--${row.ok ? 'ok' : 'failed'}`}
      >
        <span className="bee-log__icon" aria-hidden="true">
          {row.ok ? '✓' : '✗'}
        </span>
        <code className="bee-log__out">
          {row.text}
          {(row.lines ?? 0) > 1 && (
            <span className="bee-log__more">
              {' '}
              {t('cardChat.bee.lines', { n: (row.lines ?? 0) - 1 })}
            </span>
          )}
        </code>
      </li>
    )
  }
  if (row.kind === 'thought') {
    return (
      <li className="bee-log__row bee-log__row--thought">
        <span className="bee-log__icon" aria-hidden="true">
          💭
        </span>
        <span className="bee-log__words">
          {row.text || t('cardChat.bee.thinking')}
        </span>
      </li>
    )
  }
  return (
    <li className={`bee-log__row bee-log__row--${row.kind}`}>
      <span className="bee-log__icon" aria-hidden="true">
        {row.kind === 'error' ? '⚠' : 'Σ'}
      </span>
      <code className="bee-log__out">{row.text}</code>
    </li>
  )
}

/**
 * THE BEE AT WORK, AS THE PHONE SHOWS IT (spec v7, S20): who works, on what
 * model and branch, then each step as a line -- the command with the CLI
 * picked out, its outcome under it. The list follows the newest line unless
 * the thumb has scrolled back; then a button brings it back.
 */
export function BeeLog({ work }: { work: BeeWork }) {
  const { t } = useLanguage()
  const listRef = useRef<HTMLOListElement>(null)
  const [following, setFollowing] = useState(true)
  const rows = work.kind === 'bee' ? work.rows : []
  const last = rows.length ? rows[rows.length - 1].seq : 0

  useEffect(() => {
    const el = listRef.current
    if (el && following) el.scrollTop = el.scrollHeight
  }, [last, following])

  if (work.kind !== 'bee') {
    const say =
      work.kind === 'reading'
        ? t('cardChat.bee.reading')
        : work.kind === 'off'
          ? t('cardChat.bee.off')
          : work.kind === 'unmeasured'
            ? t('cardChat.bee.unmeasured')
            : t('cardChat.bee.none')
    return (
      <section
        className="bee-log bee-log--quiet"
        aria-label={t('cardChat.bee.label')}
        data-state={work.kind}
      >
        <p className="bee-log__note" role="status">
          {say}
        </p>
      </section>
    )
  }

  const { bee } = work
  const calls = toolCount(rows)
  const started = clock(bee.dispatchedAt, false)
  const meta = [
    bee.model,
    bee.branch,
    started && t('cardChat.bee.since', { time: started }),
    calls > 0 && t('cardChat.bee.calls', { n: calls }),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <section
      className="bee-log"
      aria-label={t('cardChat.bee.label')}
      data-state={bee.running ? 'running' : 'finished'}
    >
      <header className="bee-log__head">
        <span
          className={`bee-log__state bee-log__state--${bee.running ? 'running' : 'finished'}`}
          role="status"
        >
          {bee.running && (
            <span className="bee-log__pulse" aria-hidden="true" />
          )}
          {bee.running
            ? t('cardChat.bee.running')
            : bee.outcome
              ? t('cardChat.bee.finished', {
                  outcome: bee.outcome.replace(/_/g, ' '),
                })
              : t('cardChat.bee.finishedBare')}
        </span>
        {meta && <span className="bee-log__meta">{meta}</span>}
        {work.stale && (
          <span className="bee-log__stale">{t('cardChat.bee.stale')}</span>
        )}
      </header>
      {rows.length === 0 ? (
        <p className="bee-log__note">{t('cardChat.bee.empty')}</p>
      ) : (
        <ol
          className="bee-log__rows"
          ref={listRef}
          role="log"
          aria-live="polite"
          onScroll={e => {
            const el = e.currentTarget
            setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
          }}
        >
          {rows.map(r => (
            <Row key={`${r.seq}-${r.kind}`} row={r} />
          ))}
        </ol>
      )}
      {!following && (
        <button
          type="button"
          className="bee-log__jump"
          onClick={() => setFollowing(true)}
        >
          ↓ {t('cardChat.bee.jump')}
        </button>
      )}
    </section>
  )
}
