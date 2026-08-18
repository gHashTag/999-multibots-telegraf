// ===============================
// Feed Tabs - For You / Following
// TikTok-style tab switching
// ===============================

import { useAtom } from 'jotai';
import { feedTypeAtom, type FeedType } from '@/atoms/feed';
import { useLanguage } from '@/hooks/useLanguage';
import './FeedTabs.css';

interface FeedTabsProps {
  className?: string;
}

export function FeedTabs({ className = '' }: FeedTabsProps) {
  const { t } = useLanguage();
  const [feedType, setFeedType] = useAtom(feedTypeAtom);

  const tabs: { id: FeedType; label: string }[] = [
    { id: 'following', label: t('feed.following') },
    { id: 'for_you', label: t('feed.for_you') },
  ];

  return (
    <div className={`feed-tabs ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`feed-tabs__tab ${feedType === tab.id ? 'feed-tabs__tab--active' : ''}`}
          onClick={() => setFeedType(tab.id)}
        >
          {tab.label}
        </button>
      ))}
      <div
        className="feed-tabs__indicator"
        style={{
          transform: `translateX(${feedType === 'following' ? '0%' : '100%'})`,
        }}
      />
    </div>
  );
}

// Compact version for header overlay
export function FeedTabsCompact({ className = '' }: FeedTabsProps) {
  const { t } = useLanguage();
  const [feedType, setFeedType] = useAtom(feedTypeAtom);

  return (
    <div className={`feed-tabs-compact ${className}`}>
      <button
        className={`feed-tabs-compact__tab ${feedType === 'following' ? 'feed-tabs-compact__tab--active' : ''}`}
        onClick={() => setFeedType('following')}
      >
        {t('feed.following')}
      </button>
      <span className="feed-tabs-compact__divider">|</span>
      <button
        className={`feed-tabs-compact__tab ${feedType === 'for_you' ? 'feed-tabs-compact__tab--active' : ''}`}
        onClick={() => setFeedType('for_you')}
      >
        {t('feed.for_you')}
      </button>
    </div>
  );
}
