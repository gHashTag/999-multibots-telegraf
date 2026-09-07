// ===============================
// Feed Atoms - Social feed for public templates
// ===============================

import { atom } from 'jotai'
import type { TemplateSettings, Template } from './templates'
import { templatesAtom, selectedTemplateIdAtom } from './templates'
import { assetsAtom } from './assets'
import { tracksAtom } from './tracks'
import type {
  Asset,
  Track,
  FeedTemplate,
  RemixSource,
  PublishData,
  FeedSort,
  FeedType,
  FeedStats,
} from '@vibee/atoms'
import { userAtom } from './user'
import { API_BASE } from '../config'
import { openInvoice } from '../lib/telegram'
import { apiFetch, explainApiError } from '../lib/apiFetch'
import { getErrorMessage } from '../features/script/utils/errorMessages'
import { languageAtom } from './language'

// Re-export feed types for backward compatibility (types are now in @vibee/atoms)
export type {
  FeedTemplate,
  RemixSource,
  PublishData,
  FeedSort,
  FeedType,
  FeedStats,
}

// Current remix source (set when using a template from feed)
export const currentRemixSourceAtom = atom<RemixSource | null>(null)
export const editingFeedTemplateIdAtom = atom<number | null>(null)

// Global muted state for all feed videos (starts with audio ON for better UX)
export const feedMutedAtom = atom(false)

// Currently playing video ID - only ONE video plays sound at a time (TikTok-style)
// Other videos are muted when not the active one
export const currentlyPlayingFeedIdAtom = atom<number | null>(null)

// ===============================
// Atoms
// ===============================

// Feed type (For You / Following)
export const feedTypeAtom = atom<FeedType>('for_you')

// Feed templates list (for_you)
export const feedTemplatesAtom = atom<FeedTemplate[]>([])

// Following feed templates list
export const followingFeedTemplatesAtom = atom<FeedTemplate[]>([])

// Loading state
export const feedLoadingAtom = atom(false)

// Error state
export const feedErrorAtom = atom<string | null>(null)

// Current page for pagination (for_you)
export const feedPageAtom = atom(0)

// Current page for following feed
export const followingFeedPageAtom = atom(0)

// Has more pages (for_you)
export const feedHasMoreAtom = atom(true)

// Has more pages (following)
export const followingFeedHasMoreAtom = atom(true)

// Sort order
export const feedSortAtom = atom<FeedSort>('recent')

// Current feed index (for swipe navigation)
export const currentFeedIndexAtom = atom(0)

// ===============================
// API Functions
// ===============================

/**
 * Приводит ответ ленты к FeedTemplate.
 *
 * Читаем ОБА написания. Сервер (`GET /api/feed`) отдаёт camelCase —
 * creatorName, videoUrl, templateSettings, — а этот преобразователь ждал
 * только snake_case. Совпадений не было НИ ПО ОДНОМУ полю, поэтому каждое
 * падало в значение по умолчанию: автор становился «Anonymous», дата —
 * undefined и дальше «NaNmo», обложка и видео пропадали, настройки шаблона
 * превращались в пустой объект. Карточка выглядела пустой, и шаблон нельзя
 * было взять в работу.
 *
 * Поддерживаем оба вида, а не переписываем контракт сервера: им может
 * пользоваться и другой клиент.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pick = (raw: any, ...keys: string[]) => {
  for (const k of keys) {
    if (raw?.[k] !== undefined && raw?.[k] !== null) return raw[k]
  }
  return undefined
}

/**
 * Дата из Postgres в ISO. `created_at::text` даёт «2026-08-23 08:26:26+00»:
 * пробел вместо T и смещение без двоеточия — Safari и часть движков читают
 * это как Invalid Date, и в карточке появлялось «NaNmo».
 */
const toIso = (v: unknown): string | undefined => {
  if (typeof v !== 'string' || !v) return undefined
  const iso = v.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  return Number.isNaN(Date.parse(iso)) ? undefined : iso
}

/** jsonb может прийти объектом или строкой — принимаем оба. */
const asObject = (v: unknown, fallback: unknown) => {
  if (v == null) return fallback
  if (typeof v !== 'string') return v
  try {
    return JSON.parse(v)
  } catch {
    return fallback
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function transformTemplate(raw: any): FeedTemplate {
  return {
    id: raw.id,
    compositionId: pick(raw, 'composition_id', 'compositionId') ?? null,
    telegramId: pick(raw, 'telegram_id', 'telegramId'),
    creatorName: pick(raw, 'creator_name', 'creatorName') || 'Anonymous',
    creatorAvatar: pick(raw, 'creator_avatar', 'creatorAvatar'),
    creatorUsername: pick(raw, 'creator_username', 'creatorUsername'),
    name: raw.name,
    description: raw.description,
    thumbnailUrl: pick(raw, 'thumbnail_url', 'thumbnailUrl'),
    videoUrl: pick(raw, 'video_url', 'videoUrl'),
    templateSettings: asObject(
      pick(raw, 'template_settings', 'templateSettings'),
      {}
    ),
    assets: asObject(pick(raw, 'assets'), []),
    tracks: asObject(pick(raw, 'tracks'), []),
    likesCount: pick(raw, 'likes_count', 'likesCount') || 0,
    viewsCount: pick(raw, 'views_count', 'viewsCount') || 0,
    usesCount: pick(raw, 'uses_count', 'usesCount') || 0,
    isLiked: pick(raw, 'is_liked', 'isLiked') || false,
    isStarred: pick(raw, 'is_starred', 'isStarred') || false,
    isFeatured: pick(raw, 'is_featured', 'isFeatured') || false,
    starsCount: pick(raw, 'stars_count', 'starsCount') || 0,
    // Postgres отдаёт «2026-08-23 08:26:26.635176+00»: пробел вместо T и
    // смещение без двоеточия. new Date() на таком в части движков возвращает
    // Invalid Date, и в карточке появлялось «NaNmo». Приводим к ISO.
    // Пустая строка, а не undefined: поле объявлено обязательным, а карточка
    // умеет показать «дата неизвестна» лучше, чем «NaNmo».
    createdAt: toIso(pick(raw, 'created_at', 'createdAt')) ?? '',
    // Remix attribution
    parentTemplateId: pick(raw, 'parent_template_id', 'parentTemplateId'),
    originalCreatorName: pick(
      raw,
      'original_creator_name',
      'originalCreatorName'
    ),
    originalCreatorAvatar: pick(
      raw,
      'original_creator_avatar',
      'originalCreatorAvatar'
    ),
  }
}

async function fetchFeed(
  page: number,
  limit: number,
  sort: FeedSort,
  userId?: number
): Promise<FeedTemplate[]> {
  let url = `${API_BASE}/api/feed?page=${page}&limit=${limit}&sort=${sort}`
  if (userId) {
    url += `&user_id=${userId}`
  }
  console.log('[Feed] Fetching:', url)
  const response = await fetch(url)
  if (!response.ok) {
    // statusText пуст на HTTP/2 — стандарт убрал reason phrase, а Railway
    // отдаёт всё по h2. Из-за этого в UI выводилось «Failed to fetch feed:»
    // с обрывом на двоеточии, то есть ровно без той информации, за которой
    // человек и смотрит на ошибку. Берём код и тело ответа.
    const body = await response.text().catch(() => '')
    const detail =
      body.slice(0, 200) || response.statusText || 'no response body'
    throw new Error(`Failed to fetch feed: HTTP ${response.status} — ${detail}`)
  }
  const data = await response.json()
  console.log('[Feed] API response:', data)
  return (data.templates || []).map(transformTemplate)
}

async function likeTemplate(
  id: number,
  userId: number
): Promise<{ liked: boolean; likesCount: number }> {
  // apiFetch: маршрут не публичный, без подписи сервер отбивает до обработчика.
  // Отправляем ОБА написания — telegram_id принят на сервере, user_id остаётся
  // ради совместимости со старым клиентом, пока он не обновится у всех.
  const data = await apiFetch<{
    is_liked?: boolean
    liked?: boolean
    likes_count?: number
  }>(`${API_BASE}/api/feed/${id}/like`, {
    method: 'POST',
    body: JSON.stringify({ telegram_id: userId, user_id: userId }),
  })
  return {
    liked: data.is_liked ?? data.liked ?? false,
    likesCount: data.likes_count ?? 0,
  }
}

/**
 * Подарить звезду Telegram автору ролика. Полный контур:
 * 1. сервер создаёт инвойс Stars (XTR) и строку pending;
 * 2. клиент открывает инвойс — человек платит внутри Telegram;
 * 3. бот подтверждает оплату серверу (звезда падает автору на баланс);
 * 4. мы пингуем статус (до ~6 раз × 1.5 с) и возвращаем свежий stars_count.
 */
async function starTemplate(id: number): Promise<{
  status: 'paid' | 'cancelled' | 'failed' | 'unsupported' | 'pending'
  starsCount: number | null
}> {
  const created = await apiFetch<{ invoice_url?: string; payload?: string }>(
    `${API_BASE}/api/feed/${id}/star`,
    { method: 'POST' }
  )
  if (!created.invoice_url || !created.payload) {
    throw new Error('server did not return an invoice')
  }
  const invoiceResult = await openInvoice(created.invoice_url)
  if (invoiceResult !== 'paid') {
    return { status: invoiceResult, starsCount: null }
  }
  // Оплата прошла, но вебхук бота может добежать чуть позже — пингуем.
  for (let i = 0; i < 6; i++) {
    await new Promise(r => setTimeout(r, 1500))
    try {
      const st = await apiFetch<{ status?: string; stars_count?: number }>(
        `${API_BASE}/api/feed/${id}/star?payload=${encodeURIComponent(created.payload)}`
      )
      if (st.status === 'paid') {
        return { status: 'paid', starsCount: st.stars_count ?? null }
      }
    } catch {
      /* следующий пинг */
    }
  }
  return { status: 'pending', starsCount: null }
}

interface PublishUserInfo {
  telegramId: number
  creatorName: string
  creatorAvatar?: string
}

async function publishTemplate(
  data: PublishData,
  userInfo: PublishUserInfo
): Promise<FeedTemplate> {
  const requestBody = {
    telegram_id: userInfo.telegramId,
    creator_name: userInfo.creatorName,
    creator_avatar: userInfo.creatorAvatar ?? null, // must be null, not undefined (Gleam expects field to exist)
    name: data.name,
    description: data.description ?? null, // must be null, not undefined
    thumbnail_url: data.thumbnailUrl ?? null, // must be null, not undefined
    video_url: data.videoUrl,
    // Backend expects JSON strings, not objects
    template_settings: JSON.stringify(data.templateSettings || {}),
    assets: JSON.stringify(data.assets || []),
    tracks: JSON.stringify(data.tracks || []),
    post_to_telegram: data.postToTelegram ?? true, // Default to true - auto-post to Telegram
    post_to_instagram: data.postToInstagram ?? true, // Default to true - auto-post to Instagram
    telegram_caption: data.telegramCaption ?? null, // Custom caption for Telegram post
    // Remix attribution
    parent_template_id: data.parentTemplateId ?? null,
    original_creator_id: data.originalCreatorId ?? null,
    template_id: data.templateId ?? null,
  }

  console.log('[Feed] Publishing template with:', {
    video_url: data.videoUrl?.slice(0, 80),
    post_to_telegram: requestBody.post_to_telegram,
    post_to_instagram: requestBody.post_to_instagram,
    has_caption: !!requestBody.telegram_caption,
  })

  /**
   * apiFetch, а НЕ голый fetch.
   *
   * Голый fetch отправлял только Content-Type. Сервер работает в режиме
   * enforce, а POST /api/feed/publish намеренно не входит в публичные
   * маршруты (публичен только GET /api/feed), поэтому запрос отбивался
   * ДО обработчика с 401 — в том числе внутри Telegram, где валидная подпись
   * есть, но не отправлялась. Проверено живым запросом:
   *   POST /api/feed/publish без заголовков ->
   *   401 {"error":"unauthorized","detail":"no X-Api-Key and no Telegram initData"}
   *
   * То есть кнопка «Опубликовать» нажималась, а в ленту не попадало ничего,
   * и человеку показывалась общая ошибка вместо причины.
   *
   * apiFetch ставит X-Telegram-Init-Data и разбирает статус, поэтому причина
   * отказа доезжает до вызывающего, а не теряется в `await res.json()`.
   */
  const result = await apiFetch<{ template?: unknown }>(
    `${API_BASE}/api/feed/publish`,
    { method: 'POST', body: JSON.stringify(requestBody) }
  )
  console.log('[Feed] Publish success')
  return transformTemplate(
    (result as { template?: unknown }).template || result
  )
}

async function useTemplate(id: number): Promise<FeedTemplate> {
  // Remix. Ответ обязан содержать assets и tracks — без них редактор
  // откроется пустым, и «сеть коллабораций» станет кнопкой без эффекта.
  const data = await apiFetch<{ template?: unknown }>(
    `${API_BASE}/api/feed/${id}/use`,
    { method: 'POST', body: JSON.stringify({}) }
  )
  return transformTemplate((data as { template?: unknown }).template || data)
}

async function getTemplate(id: number): Promise<FeedTemplate> {
  const data = await apiFetch<{ template?: unknown }>(
    `${API_BASE}/api/feed/${id}`
  )
  return transformTemplate((data as { template?: unknown }).template || data)
}

async function trackView(
  id: number,
  userId: number
): Promise<{ viewsCount: number }> {
  const data = await apiFetch<{ views_count?: number; viewsCount?: number }>(
    `${API_BASE}/api/feed/${id}/view`,
    {
      method: 'POST',
      body: JSON.stringify({ telegram_id: userId, user_id: userId }),
    }
  )
  return { viewsCount: data.views_count ?? data.viewsCount ?? 0 }
}

// ===============================
// Action Atoms
// ===============================

// Module-level flag for synchronous load guard (prevents race conditions)
let isLoadingFeed = false

// Load feed (initial or refresh)
export const loadFeedAtom = atom(null, async (get, set, refresh?: boolean) => {
  // Synchronous guard - prevents race conditions from concurrent calls
  if (isLoadingFeed) {
    console.log('[Feed] Already loading (sync guard), skip')
    return
  }
  isLoadingFeed = true

  const sort = get(feedSortAtom)
  const user = get(userAtom)
  const userId = user?.id

  // If refresh, start from page 0
  const page = refresh ? 0 : get(feedPageAtom)
  const limit = 20

  console.log('[Feed] Loading feed...', { page, limit, sort, refresh, userId })

  set(feedLoadingAtom, true)
  set(feedErrorAtom, null)

  try {
    const templates = await fetchFeed(page, limit, sort, userId)
    console.log('[Feed] Loaded templates:', templates.length)

    // ALWAYS deduplicate by ID to prevent any duplicates
    const uniqueTemplates = templates.filter(
      (t, index, self) => self.findIndex(x => x.id === t.id) === index
    )

    if (refresh || page === 0) {
      set(feedTemplatesAtom, uniqueTemplates)
    } else {
      // Merge with existing, deduplicate
      const currentTemplates = get(feedTemplatesAtom)
      const existingIds = new Set(currentTemplates.map(t => t.id))
      const newTemplates = uniqueTemplates.filter(t => !existingIds.has(t.id))
      set(feedTemplatesAtom, [...currentTemplates, ...newTemplates])
    }

    set(feedPageAtom, page + 1)
    set(feedHasMoreAtom, templates.length === limit)
  } catch (error) {
    /**
     * В состояние кладём КЛЮЧ перевода, а не текст исключения.
     *
     * Замерено в живом приложении: при обрыве связи в русском интерфейсе
     * между «Новые», «Популярные» и «Повторить» стояло английское
     * «Failed to fetch» — сырое сообщение TypeError из fetch. Оно ничего
     * не говорит человеку и не переводится в принципе: этот текст даёт
     * браузер, а не мы.
     *
     * Атом живёт вне React и позвать t() не может, поэтому решение
     * простое: атом сообщает, ЧТО случилось, а вид решает, как это
     * сказать. Ключ разворачивается в FeedPanel.
     *
     * Обрыв связи опознаём по TypeError: именно его бросает fetch, когда
     * запрос не ушёл вовсе. Ошибки самого сервера (4xx/5xx) сюда не
     * попадают — они приходят как Error с осмысленным текстом, и его
     * терять не надо.
     */
    set(
      feedErrorAtom,
      getErrorMessage(error, get(languageAtom), { includeAction: false })
    )
  } finally {
    set(feedLoadingAtom, false)
    isLoadingFeed = false
  }
})

// Load more (next page)
export const loadMoreFeedAtom = atom(null, async (get, set) => {
  const hasMore = get(feedHasMoreAtom)
  const isLoading = get(feedLoadingAtom)

  if (!hasMore || isLoading) return

  set(loadFeedAtom)
})

// Change sort order
export const changeFeedSortAtom = atom(
  null,
  async (get, set, sort: FeedSort) => {
    set(feedSortAtom, sort)
    set(feedPageAtom, 0)
    set(loadFeedAtom, true) // refresh
  }
)

// Track in-flight like requests to prevent double-clicks
const likingTemplates = new Set<number>()

// Like/unlike template with optimistic UI
export const likeTemplateAtom = atom(
  null,
  async (get, set, templateId: number) => {
    // Prevent double-clicks
    if (likingTemplates.has(templateId)) {
      console.log('[Feed] Like already in progress for:', templateId)
      return
    }
    likingTemplates.add(templateId)

    // Get current state for optimistic update
    const templates = get(feedTemplatesAtom)
    const template = templates.find(t => t.id === templateId)
    if (!template) {
      likingTemplates.delete(templateId)
      return
    }

    // Get user for API call
    const user = get(userAtom)
    if (!user) {
      likingTemplates.delete(templateId)
      console.log('[Feed] Cannot like - user not authenticated')
      return
    }

    // Optimistic UI: update immediately
    const wasLiked = template.isLiked
    const oldLikesCount = template.likesCount
    const newIsLiked = !wasLiked
    const newLikesCount = wasLiked
      ? Math.max(0, oldLikesCount - 1)
      : oldLikesCount + 1

    set(
      feedTemplatesAtom,
      templates.map(t =>
        t.id === templateId
          ? { ...t, isLiked: newIsLiked, likesCount: newLikesCount }
          : t
      )
    )

    const userId = user.id

    try {
      const result = await likeTemplate(templateId, userId)

      // Update with server response (in case of discrepancy)
      const currentTemplates = get(feedTemplatesAtom)
      set(
        feedTemplatesAtom,
        currentTemplates.map(t =>
          t.id === templateId
            ? { ...t, isLiked: result.liked, likesCount: result.likesCount }
            : t
        )
      )
    } catch (error) {
      console.error('[Feed] Failed to like:', error)
      // Revert on error
      const currentTemplates = get(feedTemplatesAtom)
      set(
        feedTemplatesAtom,
        currentTemplates.map(t =>
          t.id === templateId
            ? { ...t, isLiked: wasLiked, likesCount: oldLikesCount }
            : t
        )
      )
    } finally {
      likingTemplates.delete(templateId)
    }
  }
)

const starringTemplates = new Set<number>()

/**
 * Подарить звезду автору. Возвращает итоговый статус — карточка покажет
 * честное сообщение (звезда на балансе автора / отмена / вне Telegram).
 */
export const starTemplateAtom = atom(
  null,
  async (
    get,
    set,
    templateId: number
  ): Promise<'paid' | 'cancelled' | 'failed' | 'unsupported' | 'pending'> => {
    if (starringTemplates.has(templateId)) return 'pending'
    starringTemplates.add(templateId)
    try {
      const result = await starTemplate(templateId)
      if (result.status === 'paid') {
        // Звезда оплачена: у ЭТОГО юзера звезда теперь «активна»,
        // счётчик — из ответа сервера (или +1, если пинг не успел).
        const currentTemplates = get(feedTemplatesAtom)
        set(
          feedTemplatesAtom,
          currentTemplates.map(t =>
            t.id === templateId
              ? {
                  ...t,
                  isStarred: true,
                  starsCount:
                    result.starsCount != null
                      ? result.starsCount
                      : t.starsCount + 1,
                }
              : t
          )
        )
      }
      return result.status
    } finally {
      starringTemplates.delete(templateId)
    }
  }
)

// Track viewed templates to avoid counting multiple times per session
const viewedTemplates = new Set<number>()

// Track view for a template (call when video starts playing)
// Views are unique per user - backend handles deduplication
export const trackViewAtom = atom(
  null,
  async (get, set, templateId: number) => {
    // Only track once per session (frontend guard)
    if (viewedTemplates.has(templateId)) {
      return
    }
    viewedTemplates.add(templateId)

    // Get user for unique tracking
    const user = get(userAtom)
    if (!user) {
      console.log('[Feed] Cannot track view - user not authenticated')
      return
    }

    try {
      const result = await trackView(templateId, user.id)
      // Update with server response (reflects actual unique count)
      const currentTemplates = get(feedTemplatesAtom)
      set(
        feedTemplatesAtom,
        currentTemplates.map(t =>
          t.id === templateId ? { ...t, viewsCount: result.viewsCount } : t
        )
      )
    } catch (error) {
      console.error('[Feed] Failed to track view:', error)
    }
  }
)

// Delete template (admin or owner only)
export const deleteTemplateAtom = atom(
  null,
  async (get, set, templateId: number) => {
    const user = get(userAtom)
    if (!user) {
      throw new Error('User not authenticated')
    }

    try {
      /**
       * apiFetch, а НЕ голый fetch — третий раз в этом файле.
       *
       * Здесь стоял `fetch` с заголовком `X-Telegram-Id`, которого сервер не
       * знает: он требует подпись `X-Telegram-Init-Data`. Кнопка с корзиной
       * на своей карточке ленты поэтому не работала НИ РАЗУ — 401, крутилка
       * гасла, карточка оставалась на месте.
       *
       * apiFetch ставит подпись и разбирает статус, поэтому причина отказа
       * доходит до человека словами, а не кодом.
       */
      await apiFetch(`${API_BASE}/api/feed/${templateId}`, { method: 'DELETE' })

      // Remove from local feed list
      const templates = get(feedTemplatesAtom)
      set(
        feedTemplatesAtom,
        templates.filter(t => t.id !== templateId)
      )

      console.log('[Feed] Template deleted:', templateId)
    } catch (error) {
      console.error('[Feed] Failed to delete:', error)
      // Человеку — по-человечески: «unauthorized» ему ничего не говорит.
      set(feedErrorAtom, explainApiError(error))
      throw error
    }
  }
)

// Use template - load into editor with remix tracking
export const useTemplateAtom = atom(
  null,
  async (get, set, templateId: number) => {
    try {
      const template = await useTemplate(templateId)

      // Add as a user template
      const templates = get(templatesAtom)
      const newId = `feed-template-${template.id}-${Date.now()}`

      // Create new template (always create fresh to allow multiple remixes)
      const newTemplate: Template = {
        id: newId,
        name: `Remix: ${template.name}`,
        description: template.description || '',
        thumbnail: template.thumbnailUrl,
        compositionId: 'SplitTalkingHead',
        defaultProps: template.templateSettings as Record<string, unknown>,
        assets: template.assets,
        tracks: template.tracks,
        createdAt: Date.now(),
        isUserCreated: true,
      }
      set(templatesAtom, [...templates, newTemplate])

      // Load assets and tracks from template (cast for atomWithStorage)
      if (template.assets?.length) {
        set(assetsAtom, template.assets as any)
      }
      if (template.tracks?.length) {
        set(tracksAtom, template.tracks as any)
      }

      // Select the template
      set(selectedTemplateIdAtom, newId)

      // Set remix source for attribution
      set(currentRemixSourceAtom, {
        templateId: template.id,
        templateName: template.name,
        creatorName: template.creatorName || 'Anonymous',
        creatorAvatar: template.creatorAvatar,
      })
      set(editingFeedTemplateIdAtom, null)

      console.log('[Feed] Template loaded for remix:', template.name)
      return true
    } catch (error) {
      console.error('[Feed] Failed to use template:', error)
      set(
        feedErrorAtom,
        error instanceof Error ? error.message : 'Failed to use template'
      )
      return false
    }
  }
)

// Load an owner's published template into the editor without turning it into
// a remix. Publishing it again with the same owner + name updates the existing
// public_templates row; the server still verifies ownership on every write.
export const editTemplateAtom = atom(
  null,
  async (get, set, templateId: number) => {
    const user = get(userAtom)
    if (!user) throw new Error('User not authenticated')

    try {
      const template = await getTemplate(templateId)
      const isOwner = String(template.telegramId) === String(user.id)
      if (!isOwner && user.is_admin !== true) {
        throw new Error('Only the owner can edit this template')
      }

      const localId = `feed-template-edit-${template.id}`
      const editableTemplate: Template = {
        id: localId,
        name: template.name,
        description: template.description || '',
        thumbnail: template.thumbnailUrl,
        compositionId: 'SplitTalkingHead',
        defaultProps: template.templateSettings as Record<string, unknown>,
        assets: template.assets,
        tracks: template.tracks,
        createdAt: Date.now(),
        isUserCreated: true,
      }

      const templates = get(templatesAtom)
      set(templatesAtom, [
        ...templates.filter(item => item.id !== localId),
        editableTemplate,
      ])
      // These storage atoms accept arrays at runtime; the cast bridges the
      // atomWithStorage setter union used by the shared package.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(assetsAtom, (template.assets || []) as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(tracksAtom, (template.tracks || []) as any)
      set(selectedTemplateIdAtom, localId)
      set(currentRemixSourceAtom, null)
      set(editingFeedTemplateIdAtom, template.id)
      set(feedErrorAtom, null)
      return true
    } catch (error) {
      const message = explainApiError(error)
      console.error('[Feed] Failed to edit template:', message)
      set(feedErrorAtom, message)
      throw error
    }
  }
)

// Publish current template to feed
export const publishToFeedAtom = atom(
  null,
  async (
    get,
    set,
    data: Omit<PublishData, 'templateSettings' | 'assets' | 'tracks'> & {
      templateSettings?: TemplateSettings
      postToTelegram?: boolean
      postToInstagram?: boolean
      telegramCaption?: string
    }
  ) => {
    // Get actual user from Telegram auth
    const user = get(userAtom)
    if (!user) {
      throw new Error('User not authenticated')
    }

    const userInfo: PublishUserInfo = {
      telegramId: user.id,
      creatorName: user.first_name || user.username || 'Anonymous',
      creatorAvatar: user.photo_url,
    }

    try {
      // Get remix source if this is a remix
      const remixSource = get(currentRemixSourceAtom)
      const editingTemplateId = get(editingFeedTemplateIdAtom)

      const fullData: PublishData = {
        ...data,
        templateSettings: (data.templateSettings || {}) as Record<
          string,
          unknown
        >,
        assets: get(assetsAtom),
        tracks: get(tracksAtom),
        postToTelegram: data.postToTelegram ?? true, // Default to true
        postToInstagram: data.postToInstagram ?? true, // Default to true
        telegramCaption: data.telegramCaption,
        templateId: editingTemplateId ?? undefined,
        // Remix attribution
        parentTemplateId: remixSource?.templateId,
        originalCreatorId: remixSource?.templateId, // Use parent template's telegram_id as original creator
      }

      const template = await publishTemplate(fullData, userInfo)

      // Add to feed list
      const templates = get(feedTemplatesAtom)
      set(feedTemplatesAtom, [template, ...templates])

      // Clear remix source after publishing
      set(currentRemixSourceAtom, null)
      set(editingFeedTemplateIdAtom, null)

      console.log(
        '[Feed] Published:',
        template.name,
        'with remix:',
        remixSource?.templateName
      )
      return template
    } catch (error) {
      console.error('[Feed] Failed to publish:', error)
      set(
        feedErrorAtom,
        error instanceof Error ? error.message : 'Failed to publish'
      )
      throw error
    }
  }
)

// ===============================
// Feed Statistics
// ===============================

// Stats atom
export const feedStatsAtom = atom<FeedStats>({
  creatorsCount: 0,
  reelsCount: 0,
  totalViews: 0,
  totalLikes: 0,
})

// Stats loading state
export const feedStatsLoadingAtom = atom(false)

// Fetch stats from API
async function fetchStats(): Promise<FeedStats> {
  // Маршрута /api/feed/stats на сервере НЕ БЫЛО: префиксный матчер отдавал
  // под этим адресом всю ленту с кодом 200, поэтому ни одно из четырёх полей
  // не находилось и все счётчики читались нулями через `|| 0`. Проверено
  // побайтовым сравнением ответов /api/feed/stats и /api/feed — совпадали.
  // Маршрут добавлен; здесь остаётся проверка формы ответа, чтобы такая
  // подмена больше не проходила молча.
  const response = await fetch(`${API_BASE}/api/feed/stats`)
  if (!response.ok) {
    throw new Error(`Failed to fetch stats: ${response.statusText}`)
  }
  const data = await response.json()
  return {
    creatorsCount: data.creators_count || 0,
    reelsCount: data.reels_count || 0,
    totalViews: data.total_views || 0,
    totalLikes: data.total_likes || 0,
  }
}

// Load stats action
export const loadStatsAtom = atom(null, async (get, set) => {
  const isLoading = get(feedStatsLoadingAtom)
  if (isLoading) return

  set(feedStatsLoadingAtom, true)
  try {
    const stats = await fetchStats()
    set(feedStatsAtom, stats)
  } catch (error) {
    console.error('[Feed] Failed to load stats:', error)
  } finally {
    set(feedStatsLoadingAtom, false)
  }
})
