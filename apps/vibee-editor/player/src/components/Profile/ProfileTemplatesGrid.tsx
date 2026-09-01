import { useCallback, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Heart,
  Eye,
  Video,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Play,
  Pause,
} from 'lucide-react'
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
  const [failedVideos, setFailedVideos] = useState<Set<number>>(() => new Set())
  const [failedPosters, setFailedPosters] = useState<Set<number>>(
    () => new Set()
  )
  const [playingId, setPlayingId] = useState<number | null>(null)
  const videoRefs = useRef(new Map<number, HTMLVideoElement>())
  const playRequestRef = useRef(0)
  const activePreviewRef = useRef<number | null>(null)

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

  const setVideoRef = (templateId: number, node: HTMLVideoElement | null) => {
    if (node) videoRefs.current.set(templateId, node)
    else videoRefs.current.delete(templateId)
  }

  const togglePreview = async (template: FeedTemplate) => {
    const video = videoRefs.current.get(template.id)
    if (!video) return

    const requestId = ++playRequestRef.current

    if (activePreviewRef.current === template.id) {
      activePreviewRef.current = null
      video.pause()
      setPlayingId(null)
      return
    }

    for (const [templateId, candidate] of videoRefs.current) {
      if (templateId !== template.id) candidate.pause()
    }

    activePreviewRef.current = template.id
    setPlayingId(template.id)
    try {
      await video.play()
      if (
        playRequestRef.current !== requestId ||
        activePreviewRef.current !== template.id
      ) {
        video.pause()
      }
    } catch {
      if (
        playRequestRef.current !== requestId ||
        activePreviewRef.current !== template.id
      ) {
        return
      }
      activePreviewRef.current = null
      setFailedVideos(current => new Set(current).add(template.id))
      setPlayingId(null)
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
        {templates.map(template => {
          const videoAvailable =
            Boolean(template.videoUrl) && !failedVideos.has(template.id)
          const posterAvailable =
            Boolean(template.thumbnailUrl) && !failedPosters.has(template.id)
          const isPlaying = playingId === template.id

          return (
            <article key={template.id} className="profile-templates__item">
              <div className="profile-templates__thumbnail">
                {videoAvailable ? (
                  <video
                    ref={node => setVideoRef(template.id, node)}
                    src={template.videoUrl}
                    poster={posterAvailable ? template.thumbnailUrl : undefined}
                    muted
                    loop
                    playsInline
                    preload={posterAvailable ? 'none' : 'metadata'}
                    crossOrigin="anonymous"
                    onLoadedMetadata={event => {
                      if (posterAvailable || isPlaying) return
                      const duration = event.currentTarget.duration
                      event.currentTarget.currentTime =
                        Number.isFinite(duration) && duration > 0
                          ? Math.min(0.8, duration / 2)
                          : 0.8
                    }}
                    onError={() => {
                      if (activePreviewRef.current === template.id) {
                        activePreviewRef.current = null
                      }
                      setFailedVideos(current =>
                        new Set(current).add(template.id)
                      )
                      setPlayingId(current =>
                        current === template.id ? null : current
                      )
                    }}
                  />
                ) : null}

                {posterAvailable && !isPlaying ? (
                  <img
                    src={template.thumbnailUrl}
                    alt={template.name}
                    onError={() =>
                      setFailedPosters(current =>
                        new Set(current).add(template.id)
                      )
                    }
                  />
                ) : !videoAvailable ? (
                  <div className="profile-templates__placeholder">
                    <Video size={32} />
                  </div>
                ) : null}

                <div
                  className="profile-templates__media-gradient"
                  aria-hidden="true"
                />

                {videoAvailable && (
                  <button
                    type="button"
                    className={`profile-templates__preview-toggle ${isPlaying ? 'is-playing' : ''}`}
                    aria-label={`${t(
                      isPlaying
                        ? 'profile.pause_preview'
                        : 'profile.preview_template'
                    )} ${template.name}`}
                    onClick={() => void togglePreview(template)}
                  >
                    {isPlaying ? (
                      <Pause size={24} fill="currentColor" />
                    ) : (
                      <Play size={24} fill="currentColor" />
                    )}
                  </button>
                )}

                <div className="profile-templates__meta">
                  <span className="profile-templates__name">
                    {template.name}
                  </span>
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

                {isOwn && (
                  <div className="profile-templates__social-actions">
                    <button
                      type="button"
                      className="profile-templates__social-action profile-templates__social-action--edit"
                      aria-label={`${t('profile.edit_template')} ${template.name}`}
                      onClick={() => handleEditTemplate(template)}
                      disabled={
                        editingId === template.id || deletingId === template.id
                      }
                    >
                      {editingId === template.id ? (
                        <Loader2 className="spinning" size={22} />
                      ) : (
                        <Pencil size={22} />
                      )}
                      <span>{t('profile.edit_template')}</span>
                    </button>
                    <button
                      type="button"
                      className="profile-templates__social-action profile-templates__social-action--delete"
                      aria-label={`${t('profile.delete_template')} ${template.name}`}
                      onClick={() => setPendingDelete(template)}
                      disabled={
                        editingId === template.id || deletingId === template.id
                      }
                    >
                      <Trash2 size={22} />
                      <span>{t('profile.delete_template')}</span>
                    </button>
                  </div>
                )}
              </div>
            </article>
          )
        })}
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
