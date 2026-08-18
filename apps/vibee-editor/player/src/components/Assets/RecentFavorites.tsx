import { useState, useMemo, useCallback } from 'react';
import { Clock, Star, ChevronRight, X, Video, Image, Music } from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import './RecentFavorites.css';

export interface RecentAsset {
  id: string;
  type: 'video' | 'image' | 'audio';
  name: string;
  thumbnail?: string;
  url: string;
  usedAt: number;
}

export interface FavoriteAsset extends Omit<RecentAsset, 'usedAt'> {
  favoritedAt: number;
}

interface RecentFavoritesProps {
  recentAssets: RecentAsset[];
  favoriteAssets: FavoriteAsset[];
  maxRecent?: number;
  onSelectAsset: (asset: RecentAsset | FavoriteAsset) => void;
  onRemoveRecent?: (id: string) => void;
  onToggleFavorite: (asset: RecentAsset | FavoriteAsset) => void;
  onClearRecent?: () => void;
}

export function RecentFavorites({
  recentAssets,
  favoriteAssets,
  maxRecent = 10,
  onSelectAsset,
  onRemoveRecent,
  onToggleFavorite,
  onClearRecent,
}: RecentFavoritesProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'recent' | 'favorites'>('recent');
  const [isExpanded, setIsExpanded] = useState(true);

  // Sort and limit recent
  const sortedRecent = useMemo(() => {
    return [...recentAssets].sort((a, b) => b.usedAt - a.usedAt).slice(0, maxRecent);
  }, [recentAssets, maxRecent]);

  // Sort favorites
  const sortedFavorites = useMemo(() => {
    return [...favoriteAssets].sort((a, b) => b.favoritedAt - a.favoritedAt);
  }, [favoriteAssets]);

  const isFavorite = useCallback(
    (id: string) => {
      return favoriteAssets.some((f) => f.id === id);
    },
    [favoriteAssets]
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <Video size={12} />;
      case 'image':
        return <Image size={12} />;
      case 'audio':
        return <Music size={12} />;
      default:
        return null;
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('time.justNow') || 'Just now';
    if (minutes < 60) return `${minutes}${t('time.minAgo') || 'm ago'}`;
    if (hours < 24) return `${hours}${t('time.hourAgo') || 'h ago'}`;
    return `${days}${t('time.dayAgo') || 'd ago'}`;
  };

  const currentAssets = activeTab === 'recent' ? sortedRecent : sortedFavorites;
  const isEmpty = currentAssets.length === 0;

  return (
    <div className="recent-favorites">
      {/* Header with toggle */}
      <button className="recent-favorites__header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="recent-favorites__tabs">
          <button
            className={`recent-favorites__tab ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab('recent');
            }}
          >
            <Clock size={14} />
            <span>{t('assets.recent') || 'Recent'}</span>
            {sortedRecent.length > 0 && (
              <span className="recent-favorites__badge">{sortedRecent.length}</span>
            )}
          </button>
          <button
            className={`recent-favorites__tab ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTab('favorites');
            }}
          >
            <Star size={14} />
            <span>{t('assets.favorites') || 'Favorites'}</span>
            {sortedFavorites.length > 0 && (
              <span className="recent-favorites__badge">{sortedFavorites.length}</span>
            )}
          </button>
        </div>
        <ChevronRight
          size={16}
          className={`recent-favorites__chevron ${isExpanded ? 'expanded' : ''}`}
        />
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="recent-favorites__content">
          {/* Clear all button (for recent only) */}
          {activeTab === 'recent' && sortedRecent.length > 0 && onClearRecent && (
            <button className="recent-favorites__clear" onClick={onClearRecent}>
              {t('actions.clearAll') || 'Clear all'}
            </button>
          )}

          {/* Asset list */}
          {isEmpty ? (
            <div className="recent-favorites__empty">
              {activeTab === 'recent' ? (
                <>
                  <Clock size={24} />
                  <p>{t('assets.noRecent') || 'No recent assets'}</p>
                </>
              ) : (
                <>
                  <Star size={24} />
                  <p>{t('assets.noFavorites') || 'No favorites yet'}</p>
                </>
              )}
            </div>
          ) : (
            <div className="recent-favorites__list">
              {currentAssets.map((asset) => (
                <div key={asset.id} className="recent-asset">
                  {/* Thumbnail */}
                  <button
                    className="recent-asset__thumb"
                    onClick={() => onSelectAsset(asset)}
                  >
                    {asset.thumbnail ? (
                      <img src={asset.thumbnail} alt={asset.name} />
                    ) : (
                      <div className="recent-asset__placeholder">
                        {getTypeIcon(asset.type)}
                      </div>
                    )}
                    <span className="recent-asset__type-badge">{getTypeIcon(asset.type)}</span>
                  </button>

                  {/* Info */}
                  <div className="recent-asset__info">
                    <button
                      className="recent-asset__name"
                      onClick={() => onSelectAsset(asset)}
                    >
                      {asset.name}
                    </button>
                    <span className="recent-asset__time">
                      {formatTimeAgo(
                        activeTab === 'recent'
                          ? (asset as RecentAsset).usedAt
                          : (asset as FavoriteAsset).favoritedAt
                      )}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="recent-asset__actions">
                    <button
                      className={`recent-asset__fav ${isFavorite(asset.id) ? 'active' : ''}`}
                      onClick={() => onToggleFavorite(asset)}
                      title={isFavorite(asset.id) ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star size={14} fill={isFavorite(asset.id) ? 'currentColor' : 'none'} />
                    </button>
                    {activeTab === 'recent' && onRemoveRecent && (
                      <button
                        className="recent-asset__remove"
                        onClick={() => onRemoveRecent(asset.id)}
                        title="Remove from recent"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Hook for managing recent/favorites in localStorage
const RECENT_KEY = 'vibee-recent-assets';
const FAVORITES_KEY = 'vibee-favorite-assets';

export function useRecentFavorites(maxRecent: number = 20) {
  const [recentAssets, setRecentAssets] = useState<RecentAsset[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [favoriteAssets, setFavoriteAssets] = useState<FavoriteAsset[]>(() => {
    try {
      const saved = localStorage.getItem(FAVORITES_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const addRecent = useCallback(
    (asset: Omit<RecentAsset, 'usedAt'>) => {
      setRecentAssets((prev) => {
        const filtered = prev.filter((a) => a.id !== asset.id);
        const updated = [{ ...asset, usedAt: Date.now() }, ...filtered].slice(0, maxRecent);
        localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
        return updated;
      });
    },
    [maxRecent]
  );

  const removeRecent = useCallback((id: string) => {
    setRecentAssets((prev) => {
      const updated = prev.filter((a) => a.id !== id);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecent = useCallback(() => {
    setRecentAssets([]);
    localStorage.removeItem(RECENT_KEY);
  }, []);

  const toggleFavorite = useCallback((asset: RecentAsset | FavoriteAsset) => {
    setFavoriteAssets((prev) => {
      const exists = prev.some((a) => a.id === asset.id);
      let updated: FavoriteAsset[];

      if (exists) {
        updated = prev.filter((a) => a.id !== asset.id);
      } else {
        const { usedAt, ...rest } = asset as RecentAsset;
        updated = [{ ...rest, favoritedAt: Date.now() }, ...prev];
      }

      localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isFavorite = useCallback(
    (id: string) => {
      return favoriteAssets.some((a) => a.id === id);
    },
    [favoriteAssets]
  );

  return {
    recentAssets,
    favoriteAssets,
    addRecent,
    removeRecent,
    clearRecent,
    toggleFavorite,
    isFavorite,
  };
}
