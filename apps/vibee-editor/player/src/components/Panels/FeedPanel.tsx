import { useEffect, useCallback, useRef } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import {
  feedTemplatesAtom,
  feedLoadingAtom,
  feedErrorAtom,
  feedSortAtom,
  feedHasMoreAtom,
  loadFeedAtom,
  changeFeedSortAtom,
  type FeedSort,
} from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { Globe, TrendingUp, Clock, Loader2, RefreshCw } from 'lucide-react'
import { FeedCard } from './FeedCard'
import './FeedPanel.css'

interface FeedPanelProps {
  fullscreen?: boolean
}

/**
 * How far below the panel's own top edge our floating chrome reaches, which is
 * the top bound of the card's action rail.
 *
 * Kept pure and exported so the rule can be tested: jsdom has no layout engine,
 * so every rect in a test would be zero and an effect-level test would assert
 * nothing. The two cases that matter are both edge cases:
 *   - chips with no box (hidden, or not mounted yet) reserve NOTHING. The tab
 *     bar learned the same thing the hard way: an observer reports 0 for a
 *     display: none element, and whoever reserves its height leaves a band of
 *     emptiness behind.
 *   - chips that end ABOVE the panel (a scrolled or offset layout) also reserve
 *     nothing, instead of a negative inset that would push the rail off the top.
 */
export function chromeInsetPx(
  panelTop: number,
  chips: { bottom: number; height: number } | null,
  gap = 12
): number {
  if (!chips || chips.height <= 0) return 0
  return Math.max(0, Math.round(chips.bottom - panelTop + gap))
}

export function FeedPanel({ fullscreen = false }: FeedPanelProps) {
  const { t } = useLanguage()
  const templates = useAtomValue(feedTemplatesAtom)
  const loading = useAtomValue(feedLoadingAtom)
  const error = useAtomValue(feedErrorAtom)
  const sort = useAtomValue(feedSortAtom)
  const hasMore = useAtomValue(feedHasMoreAtom)
  const loadFeed = useSetAtom(loadFeedAtom)
  const changeSort = useSetAtom(changeFeedSortAtom)

  // Use ref to track if we've already triggered initial load - prevents race condition
  const hasLoadedRef = useRef(false)

  // Load feed on mount - empty deps to run only once
  useEffect(() => {
    console.log(
      '[FeedPanel] Mount, templates:',
      templates.length,
      'hasLoaded:',
      hasLoadedRef.current
    )
    if (!hasLoadedRef.current && templates.length === 0) {
      hasLoadedRef.current = true
      console.log('[FeedPanel] Loading feed...')
      loadFeed(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // THE CHIPS SAY HOW MUCH ROOM THEY TAKE, AND THE RAIL READS IT.
  //
  // The card's action rail is bounded by `top: var(--feed-chrome-top, 70px)`,
  // and that 70px was a measured constant -- true only where the chips happen
  // to sit at top: 70px. They move: centred below 768px, top: 65px below 480px,
  // and their height follows the label text and the font. A number written in
  // one place about something that changes in another is a bug waiting for the
  // next breakpoint; this publishes the real distance instead.
  //
  // Published ON THE PANEL, not on documentElement like the tab bar's
  // --tabbar-actual-h. Only descendants of this panel consume it, and the app
  // can hold two feed panels at once (the embedded one inside the game frame),
  // which would otherwise overwrite each other's global.
  const panelRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const publish = () => {
      const chips = sortRef.current
      const rect = chips ? chips.getBoundingClientRect() : null
      const inset = chromeInsetPx(panel.getBoundingClientRect().top, rect)
      panel.style.setProperty('--feed-chrome-top', `${inset}px`)
    }
    publish()
    // AND AGAIN AFTER THE LAYOUT SETTLES. Measured on the deployed site, the
    // value published on mount was a pixel short -- 67 against 68 at 1723x720,
    // 82 against 83 at 390x844 -- because the app's chrome was still mounting
    // and the panel's own top was still moving. A MOVE resizes neither the
    // panel nor the chips, so the observers below never fire to correct it and
    // the stale number simply stays. One frame later the layout is settled.
    const frame =
      typeof requestAnimationFrame !== 'undefined'
        ? requestAnimationFrame(publish)
        : null
    // Guarded because jsdom has no ResizeObserver: the value published on mount
    // still holds, it simply stops following later changes.
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null
    if (ro) {
      ro.observe(panel)
      if (sortRef.current) ro.observe(sortRef.current)
    }
    window.addEventListener('resize', publish)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', publish)
      panel.style.removeProperty('--feed-chrome-top')
    }
  }, [])

  const handleSortChange = useCallback(
    (newSort: FeedSort) => {
      changeSort(newSort)
    },
    [changeSort]
  )

  const handleRefresh = useCallback(() => {
    loadFeed(true)
  }, [loadFeed])

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadFeed()
    }
  }, [loading, hasMore, loadFeed])

  return (
    <div
      ref={panelRef}
      className={`feed-panel ${fullscreen ? 'fullscreen' : ''}`}
    >
      <div className="panel-header">
        <Globe size={14} />
        <span>{t('feed.title')}</span>
        <button
          className="feed-refresh"
          onClick={handleRefresh}
          disabled={loading}
          title={t('feed.refresh')}
        >
          <RefreshCw size={14} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div ref={sortRef} className="feed-sort">
        <button
          className={`sort-btn ${sort === 'recent' ? 'active' : ''}`}
          onClick={() => handleSortChange('recent')}
        >
          <Clock size={12} />
          {t('feed.recent')}
        </button>
        <button
          className={`sort-btn ${sort === 'popular' ? 'active' : ''}`}
          onClick={() => handleSortChange('popular')}
        >
          <TrendingUp size={12} />
          {t('feed.popular')}
        </button>
      </div>

      {error && (
        <div className="feed-error">
          {/* Текст приходит уже локализованным: атом зовёт getErrorMessage,
              который знает язык и сам подбирает формулировку и подсказку
              действия. Оборачивать в t() не нужно — и вредно, потому что
              t() на неизвестном ключе вернул бы аргумент как есть, скрыв
              ошибку в цепочке. */}
          {error}
          <button onClick={handleRefresh}>{t('feed.retry')}</button>
        </div>
      )}

      <div className="feed-list">
        {templates.map(template => (
          <FeedCard key={template.id} template={template} />
        ))}

        {loading && templates.length === 0 && (
          <div className="feed-loading">
            <Loader2 size={24} className="spinning" />
            <span>{t('feed.loading')}</span>
          </div>
        )}

        {!loading && templates.length === 0 && !error && (
          <div className="feed-empty">
            <Globe size={32} />
            <span>{t('feed.empty')}</span>
          </div>
        )}

        {hasMore && templates.length > 0 && (
          <button
            className="feed-load-more"
            onClick={handleLoadMore}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={14} className="spinning" />
                {t('feed.loading')}
              </>
            ) : (
              t('feed.loadMore')
            )}
          </button>
        )}
      </div>
    </div>
  )
}
