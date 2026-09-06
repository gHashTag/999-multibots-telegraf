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
import { поШаблонам } from './группыШаблонов'

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
  const [nearViewportIds, setNearViewportIds] = useState<Set<number>>(
    () => new Set()
  )
  const [playingId, setPlayingId] = useState<number | null>(null)
  /**
   * Какие шаблоны раскрыты. По умолчанию НИ ОДИН: вкладка «Шаблоны» должна
   * показывать шаблоны, а не сорок шесть роликов, снятых по трём из них.
   */
  const [раскрытые, setРаскрытые] = useState<Set<string>>(() => new Set())
  /** Сколько роликов у каждого шаблона ВСЕГО — приходит с сервера. */
  const [всегоВГруппе, setВсегоВГруппе] = useState<Record<string, number>>(
    () => ({})
  )
  const videoRefs = useRef(new Map<number, HTMLVideoElement>())
  const mediaRefs = useRef(new Map<number, HTMLDivElement>())
  const mediaRefCallbacks = useRef(
    new Map<number, (node: HTMLDivElement | null) => void>()
  )
  const previewObserverRef = useRef<IntersectionObserver | null>(null)
  const fallbackScanRef = useRef<(() => void) | null>(null)
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
          // Итоги по шаблонам считает сервер по ВСЕМ записям: страница
          // урезана `limit`, и посчитать по ней целое нельзя в принципе.
          if (data.compositionCounts) setВсегоВГруппе(data.compositionCounts)
          if (pageNum === 0) {
            setTemplates(data.templates || [])
          } else {
            /*
             * ПО id, А НЕ ПРОСТО КОНКАТЕНАЦИЯ.
             *
             * Дочитывание страниц запускается эффектом, а React в разработке
             * вызывает эффекты дважды — страница добавлялась второй раз, и
             * заголовок группы показывал 66 там, где роликов 43. Неверное
             * число хуже отсутствующего.
             */
            setTemplates(prev => {
              const было = new Set(prev.map(т => т.id))
              const новые = (data.templates || []).filter(
                (т: FeedTemplate) => !было.has(т.id)
              )
              return новые.length ? [...prev, ...новые] : prev
            })
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

  /**
   * ГРУППЫ СЧИТАЮТСЯ ПО ВСЕМ РОЛИКАМ, А НЕ ПО ПЕРВОЙ СТРАНИЦЕ.
   *
   * Страница отдаёт по 20, и у владельца первые двадцать — один и тот же
   * шаблон. Значит на экране была ОДНА группа, а шаблонов три: два других
   * лежали на следующих страницах и до вкладки «Шаблоны» не доходили вовсе.
   *
   * Дочитываем остальное сразу. Записей у профиля десятки, не тысячи, а
   * список шаблонов, показывающий не все шаблоны, — это тот же неверный
   * ответ, только тише.
   *
   * Потолок в 10 страниц — предохранитель от бесконечного цикла, если сервер
   * вдруг начнёт отдавать полную страницу всегда. Он назван, а не подразуме-
   * вается: молчаливое усечение читается как «здесь всё».
   */
  useEffect(() => {
    if (loading || !hasMore || page >= 9) return
    void loadTemplates(page + 1)
  }, [loading, hasMore, page, loadTemplates])

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      let frame = 0
      const scanNearViewport = () => {
        frame = 0
        const nearIds: number[] = []
        mediaRefs.current.forEach((node, id) => {
          const bounds = node.getBoundingClientRect()
          if (bounds.bottom >= -320 && bounds.top <= window.innerHeight + 320) {
            nearIds.push(id)
          }
        })
        if (nearIds.length > 0) {
          setNearViewportIds(current => {
            if (nearIds.every(id => current.has(id))) return current
            const next = new Set(current)
            nearIds.forEach(id => next.add(id))
            return next
          })
        }
      }
      const scheduleScan = () => {
        if (frame !== 0) return
        frame =
          typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame(scanNearViewport)
            : window.setTimeout(scanNearViewport, 0)
      }

      fallbackScanRef.current = scheduleScan
      window.addEventListener('scroll', scheduleScan, { passive: true })
      window.addEventListener('resize', scheduleScan)
      scheduleScan()
      return () => {
        if (typeof window.cancelAnimationFrame === 'function') {
          window.cancelAnimationFrame(frame)
        } else {
          window.clearTimeout(frame)
        }
        window.removeEventListener('scroll', scheduleScan)
        window.removeEventListener('resize', scheduleScan)
        fallbackScanRef.current = null
      }
    }

    const observer = new IntersectionObserver(
      entries => {
        const visibleIds = entries
          .filter(entry => entry.isIntersecting || entry.intersectionRatio > 0)
          .map(entry =>
            Number((entry.target as HTMLElement).dataset.templateId)
          )
          .filter(Number.isFinite)

        if (visibleIds.length === 0) return
        setNearViewportIds(current => {
          if (visibleIds.every(id => current.has(id))) return current
          const next = new Set(current)
          visibleIds.forEach(id => next.add(id))
          return next
        })
        entries.forEach(entry => {
          if (entry.isIntersecting || entry.intersectionRatio > 0) {
            observer.unobserve(entry.target)
          }
        })
      },
      { rootMargin: '320px 0px' }
    )

    previewObserverRef.current = observer
    mediaRefs.current.forEach(node => observer.observe(node))
    return () => {
      observer.disconnect()
      previewObserverRef.current = null
    }
  }, [])

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

  const setMediaRef = (templateId: number, node: HTMLDivElement | null) => {
    const previous = mediaRefs.current.get(templateId)
    if (previous) previewObserverRef.current?.unobserve(previous)
    if (node) {
      mediaRefs.current.set(templateId, node)
      if (previewObserverRef.current) previewObserverRef.current.observe(node)
      else {
        fallbackScanRef.current?.()
        window.setTimeout(() => {
          if (mediaRefs.current.get(templateId) !== node) return
          const bounds = node.getBoundingClientRect()
          if (bounds.bottom < -320 || bounds.top > window.innerHeight + 320)
            return
          setNearViewportIds(current => {
            if (current.has(templateId)) return current
            return new Set(current).add(templateId)
          })
        }, 0)
      }
    } else {
      mediaRefs.current.delete(templateId)
    }
  }

  const mediaRefFor = (templateId: number) => {
    const existing = mediaRefCallbacks.current.get(templateId)
    if (existing) return existing
    const callback = (node: HTMLDivElement | null) =>
      setMediaRef(templateId, node)
    mediaRefCallbacks.current.set(templateId, callback)
    return callback
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

    activePreviewRef.current = template.id
    for (const [templateId, candidate] of videoRefs.current) {
      if (templateId !== template.id) candidate.pause()
    }

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

  /*
   * ГРУППЫ ВМЕСТО СТЕНЫ КАРТОЧЕК.
   *
   * Вкладка показывала 46 роликов подряд, а шаблонов ТРИ: сорок три карточки
   * были одним шаблоном с разным текстом. Свёрнутые группы дают то, что
   * человек и ожидает увидеть на вкладке «Шаблоны», — сами шаблоны.
   *
   * Раскрытая группа показывает свои ролики той же сеткой: второй способ их
   * рисовать разошёлся бы с первым.
   */
  const группы = поШаблонам(templates)
  /**
   * СВЁРНУТО ВСЕГДА, И ПРАВИЛО «ОДНУ ГРУППУ НЕ СВОРАЧИВАЕМ» БЫЛО ОШИБКОЙ.
   *
   * Я вывел его из ПАДАВШИХ ТЕСТОВ, а не из данных: двенадцать проверок
   * рисуют один ролик и ждут карточку, и авторазворот сделал их зелёными.
   *
   * На живом профиле оно дало ровно то, что чинили. Страница грузит по 20
   * записей, у владельца первые двадцать — один и тот же `TrinityBlogReel`,
   * значит группа ОДНА, значит развёрнута, значит на экране снова стена
   * карточек. Владелец увидел это первым и назвал верно: «нет по группе, там
   * все одинаковые».
   *
   * Вкладка называется «Шаблоны» и обязана показывать шаблоны. Открывают их
   * нажатием — и тесты теперь тоже.
   */
  const раскрыта = (ключ: string | null) => раскрытые.has(ключ ?? '')

  return (
    <div className="profile-templates">
      {группы.map(г => (
        <div key={г.ключ ?? 'без'} className="profile-templates__group">
          <button
            type="button"
            className="profile-templates__group-head"
            aria-expanded={раскрыта(г.ключ)}
            data-group={г.ключ ?? ''}
            onClick={() =>
              setРаскрытые(п => {
                const н = new Set(п)
                const к = г.ключ ?? ''
                if (н.has(к)) н.delete(к)
                else н.add(к)
                return н
              })
            }
          >
            <span className="profile-templates__group-name">{г.имя}</span>
            <span className="profile-templates__group-count">
              {/*
                ЧИСЛО — ПО ВСЕМ РОЛИКАМ ШАБЛОНА, а не по загруженной странице.
                Страница отдаёт 20, и у шаблона с 43 роликами стояло «20».
                Неверное число хуже отсутствующего: по нему принимают решение.
              */}
              {всегоВГруппе[г.ключ ?? ''] ?? г.ролики.length}
            </span>
          </button>
          {раскрыта(г.ключ) && (
            <div className="profile-templates__grid">
              {г.ролики.map(template => {
          const videoAvailable =
            Boolean(template.videoUrl) && !failedVideos.has(template.id)
          const posterAvailable =
            Boolean(template.thumbnailUrl) && !failedPosters.has(template.id)
          const isPlaying = playingId === template.id
          const isNearViewport = nearViewportIds.has(template.id)

          return (
            <article key={template.id} className="profile-templates__item">
              <div
                ref={mediaRefFor(template.id)}
                className="profile-templates__thumbnail"
                data-template-id={template.id}
              >
                {videoAvailable ? (
                  <video
                    ref={node => setVideoRef(template.id, node)}
                    src={template.videoUrl}
                    poster={posterAvailable ? template.thumbnailUrl : undefined}
                    muted
                    loop
                    playsInline
                    preload={
                      posterAvailable || !isNearViewport ? 'none' : 'metadata'
                    }
                    crossOrigin="anonymous"
                    onLoadedMetadata={event => {
                      if (posterAvailable || isPlaying || !isNearViewport)
                        return
                      const duration = event.currentTarget.duration
                      event.currentTarget.currentTime =
                        Number.isFinite(duration) && duration > 0
                          ? Math.min(0.8, duration / 2)
                          : 0.8
                    }}
                    onPause={() => {
                      if (activePreviewRef.current !== template.id) return
                      activePreviewRef.current = null
                      setPlayingId(current =>
                        current === template.id ? null : current
                      )
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
                    loading="lazy"
                    decoding="async"
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
                      {/*
                        БЕЗ ПОДПИСИ И МЕНЬШЕ.

                        Подпись под значком не помещалась и обрезалась
                        (`max-width: 3.1rem`), а кружок в 3.3rem закрывал
                        обложку. Значение остаётся в `aria-label` — для тех,
                        кто читает экран голосом, подпись как раз нужна.
                      */}
                      {editingId === template.id ? (
                        <Loader2 className="spinning" size={16} />
                      ) : (
                        <Pencil size={16} />
                      )}
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
                      <Trash2 size={16} />
                    </button>
                  </div>
                )}
              </div>
            </article>
          )
              })}
            </div>
          )}
        </div>
      ))}

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
