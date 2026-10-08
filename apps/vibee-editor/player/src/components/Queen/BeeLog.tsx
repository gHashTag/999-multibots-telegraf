import { useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import {
  commandHead,
  toolCount,
  type BeeRow,
  type BeeWork,
} from '@/lib/cardWork'
import './BeeLog.css'

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
