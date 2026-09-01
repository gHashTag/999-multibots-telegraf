import { useCallback, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Heart, Eye, Video, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { useSetAtom } from 'jotai'
import { deleteTemplateAtom, editTemplateAtom } from '@/atoms'
import type { FeedTemplate } from '@/atoms'
import { useLanguage } from '@/hooks/useLanguage'
import { API_BASE } from '../../config'

interface ProfileTemplatesGridProps {
  username: string
  isOwn: boolean
}

export function ProfileTemplatesGrid({
  username,
  isOwn,
}: ProfileTemplatesGridProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<FeedTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [pendingDelete, setPendingDelete] = useState<FeedTemplate | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const editTemplate = useSetAtom(editTemplateAtom)
  const deleteTemplate = useSetAtom(deleteTemplateAtom)

  const loadTemplates = useCallback(
    async (pageNum = 0) => {
      setLoading(true)
      try {
        const response = await fetch(
          `${API_BASE}/api/users/${encodeURIComponent(username)}/templates?page=${pageNum}&limit=20`
        )
        if (response.ok) {
          const data = await response.json()
          if (pageNum === 0) {
            setTemplates(data.templates || [])
          } else {
            setTemplates(prev => [...prev, ...(data.templates || [])])
          }
          setHasMore((data.templates || []).length === 20)
          setPage(pageNum)
        }
      } catch (error) {
        console.error('Failed to load templates:', error)
      } finally {
        setLoading(false)
      }
    },
    [username]
  )

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const handleEditTemplate = async (template: FeedTemplate) => {
    setEditingId(template.id)
    setActionError(null)
    try {
      await editTemplate(template.id)
      navigate('/editor')
    } catch {
      setActionError(t('profile.template_action_failed'))
    } finally {
      setEditingId(null)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!pendingDelete) return
    setDeletingId(pendingDelete.id)
    setActionError(null)
    try {
      await deleteTemplate(pendingDelete.id)
      setTemplates(current =>
        current.filter(item => item.id !== pendingDelete.id)
      )
      setPendingDelete(null)
    } catch {
      setActionError(t('profile.template_action_failed'))
    } finally {
      setDeletingId(null)
    }
  }

  const formatNumber = (num: number | undefined | null): string => {
    if (num == null) return '0'
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  if (loading && templates.length === 0) {
    return (
      <div className="profile-templates__grid">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="profile-templates__item">
            <div
              className="skeleton skeleton-card"
              style={{ aspectRatio: '9/16' }}
            />
            <div className="profile-templates__info">
              <div className="skeleton skeleton-text skeleton-text--md" />
              <div
                className="skeleton skeleton-text skeleton-text--sm"
                style={{ width: '50%' }}
              />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">
          <Video size={48} />
        </div>
        <h3 className="empty-state__title">{t('profile.no_templates')}</h3>
        <p className="empty-state__desc">{t('profile.no_templates_desc')}</p>
        <button
          className="empty-state__action"
          onClick={() => navigate('/editor')}
        >
          <Plus size={18} />
          <span>{t('profile.create_first_video')}</span>
        </button>
      </div>
    )
  }

  return (
    <div className="profile-templates">
      <div className="profile-templates__grid">
        {templates.map(template => (
          <div key={template.id} className="profile-templates__item">
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
              {isOwn && (
                <div className="profile-templates__actions">
                  <button
                    type="button"
                    className="profile-templates__action profile-templates__action--edit"
                    aria-label={`${t('profile.edit_template')} ${template.name}`}
                    onClick={() => handleEditTemplate(template)}
                    disabled={
                      editingId === template.id || deletingId === template.id
                    }
                  >
                    {editingId === template.id ? (
                      <Loader2 className="spinning" size={16} />
                    ) : (
                      <Pencil size={16} />
                    )}
                    <span>{t('profile.edit_template')}</span>
                  </button>
                  <button
                    type="button"
                    className="profile-templates__action profile-templates__action--delete"
                    aria-label={`${t('profile.delete_template')} ${template.name}`}
                    onClick={() => setPendingDelete(template)}
                    disabled={
                      editingId === template.id || deletingId === template.id
                    }
                  >
                    <Trash2 size={16} />
                    <span>{t('profile.delete_template')}</span>
                  </button>
                </div>
              )}
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

      {actionError && (
        <p className="profile-templates__error" role="alert">
          {actionError}
        </p>
      )}

      {pendingDelete && (
        <div className="profile-templates__confirm-overlay" role="presentation">
          <div
            className="profile-templates__confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="profile-template-delete-title"
          >
            <Trash2 size={30} aria-hidden="true" />
            <h3 id="profile-template-delete-title">
              {t('profile.delete_template_confirm')}
            </h3>
            <p>{pendingDelete.name}</p>
            <div className="profile-templates__confirm-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="profile-templates__confirm-delete"
                data-action="confirm-delete"
                onClick={handleDeleteTemplate}
                disabled={deletingId === pendingDelete.id}
              >
                {deletingId === pendingDelete.id && (
                  <Loader2 className="spinning" size={16} />
                )}
                {t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
