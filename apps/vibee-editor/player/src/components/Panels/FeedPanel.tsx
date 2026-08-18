import { useEffect, useCallback, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
  feedTemplatesAtom,
  feedLoadingAtom,
  feedErrorAtom,
  feedSortAtom,
  feedHasMoreAtom,
  loadFeedAtom,
  changeFeedSortAtom,
  type FeedSort,
} from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { Globe, TrendingUp, Clock, Loader2, RefreshCw } from 'lucide-react';
import { FeedCard } from './FeedCard';
import './FeedPanel.css';

interface FeedPanelProps {
  fullscreen?: boolean;
}

export function FeedPanel({ fullscreen = false }: FeedPanelProps) {
  const { t } = useLanguage();
  const templates = useAtomValue(feedTemplatesAtom);
  const loading = useAtomValue(feedLoadingAtom);
  const error = useAtomValue(feedErrorAtom);
  const sort = useAtomValue(feedSortAtom);
  const hasMore = useAtomValue(feedHasMoreAtom);
  const loadFeed = useSetAtom(loadFeedAtom);
  const changeSort = useSetAtom(changeFeedSortAtom);

  // Use ref to track if we've already triggered initial load - prevents race condition
  const hasLoadedRef = useRef(false);

  // Load feed on mount - empty deps to run only once
  useEffect(() => {
    console.log('[FeedPanel] Mount, templates:', templates.length, 'hasLoaded:', hasLoadedRef.current);
    if (!hasLoadedRef.current && templates.length === 0) {
      hasLoadedRef.current = true;
      console.log('[FeedPanel] Loading feed...');
      loadFeed(true);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSortChange = useCallback((newSort: FeedSort) => {
    changeSort(newSort);
  }, [changeSort]);

  const handleRefresh = useCallback(() => {
    loadFeed(true);
  }, [loadFeed]);

  const handleLoadMore = useCallback(() => {
    if (!loading && hasMore) {
      loadFeed();
    }
  }, [loading, hasMore, loadFeed]);

  return (
    <div className={`feed-panel ${fullscreen ? 'fullscreen' : ''}`}>
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

      <div className="feed-sort">
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
          {error}
          <button onClick={handleRefresh}>{t('feed.retry')}</button>
        </div>
      )}

      <div className="feed-list">
        {templates.map((template) => (
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
  );
}
