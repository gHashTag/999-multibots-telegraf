import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Heart, Eye, Video, Plus } from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { userAtom, useTemplateAtom } from '@/atoms';
import type { FeedTemplate } from '@/atoms';
import { useLanguage } from '@/hooks/useLanguage';
import { API_BASE } from '../../config';

interface ProfileTemplatesGridProps {
  username: string;
}

export function ProfileTemplatesGrid({ username }: ProfileTemplatesGridProps) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<FeedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const user = useAtomValue(userAtom);
  const useTemplate = useSetAtom(useTemplateAtom);

  useEffect(() => {
    loadTemplates();
  }, [username]);

  const loadTemplates = async (pageNum = 0) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/users/${encodeURIComponent(username)}/templates?page=${pageNum}&limit=20`
      );
      if (response.ok) {
        const data = await response.json();
        if (pageNum === 0) {
          setTemplates(data.templates || []);
        } else {
          setTemplates((prev) => [...prev, ...(data.templates || [])]);
        }
        setHasMore((data.templates || []).length === 20);
        setPage(pageNum);
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (template: FeedTemplate) => {
    await useTemplate(template.id);
    // Navigate to avatar generation page to record cameo
    navigate('/generate/avatar');
  };

  const formatNumber = (num: number | undefined | null): string => {
    if (num == null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading && templates.length === 0) {
    return (
      <div className="profile-templates__grid">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="profile-templates__item">
            <div className="skeleton skeleton-card" style={{ aspectRatio: '9/16' }} />
            <div className="profile-templates__info">
              <div className="skeleton skeleton-text skeleton-text--md" />
              <div className="skeleton skeleton-text skeleton-text--sm" style={{ width: '50%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <Video size={48} />
        </div>
        <h3 className="empty-state__title">{t('profile.no_templates')}</h3>
        <p className="empty-state__desc">{t('profile.no_templates_desc')}</p>
        <button className="empty-state__action" onClick={() => navigate('/editor')}>
          <Plus size={18} />
          <span>{t('profile.create_first_video')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="profile-templates">
      <div className="profile-templates__grid">
        {templates.map((template) => (
          <div
            key={template.id}
            className="profile-templates__item"
            onClick={() => handleUseTemplate(template)}
          >
            <div className="profile-templates__thumbnail">
              {template.thumbnailUrl ? (
                <img src={template.thumbnailUrl} alt={template.name} />
              ) : template.videoUrl ? (
                <video
                  src={template.videoUrl}
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="profile-templates__placeholder">
                  <Video size={32} />
                </div>
              )}
              {/* Play button on hover */}
              <div className="profile-templates__play-btn">
                <Play size={24} />
              </div>
            </div>

            <div className="profile-templates__info">
              <span className="profile-templates__name">{template.name}</span>
              <div className="profile-templates__stats">
                <span>
                  <Eye size={14} />
                  {formatNumber(template.viewsCount)}
                </span>
                <span>
                  <Heart size={14} />
                  {formatNumber(template.likesCount)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          className="profile-templates__load-more"
          onClick={() => loadTemplates(page + 1)}
          disabled={loading}
        >
          {loading ? 'Loading...' : t('profile.load_more')}
        </button>
      )}
    </div>
  );
}
