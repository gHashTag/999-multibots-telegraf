// ===============================
// Empty State Components
// Beautiful empty states for all sections
// ===============================

import type { ReactNode } from 'react';
import {
  Video, Image, Music, Heart, Bookmark, MessageSquare,
  Bell, Search, Users, Inbox, FolderOpen, FileVideo,
  Sparkles, TrendingUp, Clock, Archive
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './EmptyState.css';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'medium',
  className = '',
}: EmptyStateProps) {
  return (
    <div className={`empty-state empty-state--${size} ${className}`}>
      {icon && <div className="empty-state__icon">{icon}</div>}
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__description">{description}</p>}
      {action && (
        <button className="empty-state__action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// Preset empty states
export function EmptyFeed({ onExplore }: { onExplore?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Video size={48} strokeWidth={1.5} />}
      title={t('empty.feed.title')}
      description={t('empty.feed.description')}
      action={onExplore ? { label: t('empty.feed.action'), onClick: onExplore } : undefined}
    />
  );
}

export function EmptySearch({ query }: { query?: string }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Search size={48} strokeWidth={1.5} />}
      title={query ? t('empty.search.noResults') : t('empty.search.title')}
      description={query ? t('empty.search.tryDifferent') : t('empty.search.description')}
    />
  );
}

export function EmptyMessages({ onStartChat }: { onStartChat?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<MessageSquare size={48} strokeWidth={1.5} />}
      title={t('empty.messages.title')}
      description={t('empty.messages.description')}
      action={onStartChat ? { label: t('empty.messages.action'), onClick: onStartChat } : undefined}
    />
  );
}

export function EmptyNotifications() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Bell size={48} strokeWidth={1.5} />}
      title={t('empty.notifications.title')}
      description={t('empty.notifications.description')}
    />
  );
}

export function EmptyLikes() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Heart size={48} strokeWidth={1.5} />}
      title={t('empty.likes.title')}
      description={t('empty.likes.description')}
    />
  );
}

export function EmptyBookmarks({ onExplore }: { onExplore?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Bookmark size={48} strokeWidth={1.5} />}
      title={t('empty.bookmarks.title')}
      description={t('empty.bookmarks.description')}
      action={onExplore ? { label: t('empty.bookmarks.action'), onClick: onExplore } : undefined}
    />
  );
}

export function EmptyFollowers() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Users size={48} strokeWidth={1.5} />}
      title={t('empty.followers.title')}
      description={t('empty.followers.description')}
    />
  );
}

export function EmptyFollowing({ onDiscover }: { onDiscover?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Users size={48} strokeWidth={1.5} />}
      title={t('empty.following.title')}
      description={t('empty.following.description')}
      action={onDiscover ? { label: t('empty.following.action'), onClick: onDiscover } : undefined}
    />
  );
}

export function EmptyDrafts({ onCreate }: { onCreate?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<FileVideo size={48} strokeWidth={1.5} />}
      title={t('empty.drafts.title')}
      description={t('empty.drafts.description')}
      action={onCreate ? { label: t('empty.drafts.action'), onClick: onCreate } : undefined}
    />
  );
}

export function EmptyAssets({ onUpload }: { onUpload?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<FolderOpen size={48} strokeWidth={1.5} />}
      title={t('empty.assets.title')}
      description={t('empty.assets.description')}
      action={onUpload ? { label: t('empty.assets.action'), onClick: onUpload } : undefined}
    />
  );
}

export function EmptyTrending() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<TrendingUp size={48} strokeWidth={1.5} />}
      title={t('empty.trending.title')}
      description={t('empty.trending.description')}
    />
  );
}

export function EmptySounds({ onBrowse }: { onBrowse?: () => void }) {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Music size={48} strokeWidth={1.5} />}
      title={t('empty.sounds.title')}
      description={t('empty.sounds.description')}
      action={onBrowse ? { label: t('empty.sounds.action'), onClick: onBrowse } : undefined}
    />
  );
}

export function EmptyArchive() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Archive size={48} strokeWidth={1.5} />}
      title={t('empty.archive.title')}
      description={t('empty.archive.description')}
    />
  );
}

export function EmptyHistory() {
  const { t } = useLanguage();
  return (
    <EmptyState
      icon={<Clock size={48} strokeWidth={1.5} />}
      title={t('empty.history.title')}
      description={t('empty.history.description')}
    />
  );
}
