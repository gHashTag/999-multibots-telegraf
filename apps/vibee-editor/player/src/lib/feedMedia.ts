export const MAX_MEDIA_ATTEMPTS = 2

export type FeedMediaFailure =
  | 'video_url_missing'
  | 'video_url_invalid'
  | 'thumbnail_missing'
  | 'thumbnail_error'
  | 'network_error'
  | 'decode_error'
  | 'unsupported_codec'
  | 'load_aborted'
  | 'load_timeout'
  | 'unknown_error'

export interface FeedMediaState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  posterStatus: 'ready' | 'missing' | 'error'
  reason: FeedMediaFailure | null
  attempts: number
}

export type FeedMediaEvent =
  | {
      type: 'source_changed'
      videoUrl: string | undefined
      thumbnailUrl?: string
    }
  | { type: 'load_started' }
  | { type: 'video_ready' }
  | { type: 'video_error'; reason: FeedMediaFailure }
  | { type: 'poster_error' }
  | { type: 'timeout' }
  | { type: 'retry' }

export const isFeedVideoUrl = (value: string | undefined): boolean => {
  if (!value) return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

export function createFeedMediaState(
  videoUrl: string | undefined,
  thumbnailUrl?: string
): FeedMediaState {
  const posterStatus = thumbnailUrl ? 'ready' : 'missing'
  if (!videoUrl) {
    return {
      status: 'error',
      posterStatus,
      reason: 'video_url_missing',
      attempts: 0,
    }
  }
  if (!isFeedVideoUrl(videoUrl)) {
    return {
      status: 'error',
      posterStatus,
      reason: 'video_url_invalid',
      attempts: 0,
    }
  }
  return {
    status: 'idle',
    posterStatus,
    reason: thumbnailUrl ? null : 'thumbnail_missing',
    attempts: 0,
  }
}

export function canRetryMedia(state: FeedMediaState): boolean {
  return state.status === 'error' && state.attempts < MAX_MEDIA_ATTEMPTS
}

export function feedMediaReducer(
  state: FeedMediaState,
  event: FeedMediaEvent
): FeedMediaState {
  switch (event.type) {
    case 'source_changed':
      return createFeedMediaState(event.videoUrl, event.thumbnailUrl)
    case 'load_started':
      if (state.status === 'ready' || state.attempts >= MAX_MEDIA_ATTEMPTS) {
        return state
      }
      return {
        ...state,
        status: 'loading',
        attempts: state.attempts + 1,
      }
    case 'video_ready':
      return { ...state, status: 'ready', reason: null }
    case 'video_error':
      return { ...state, status: 'error', reason: event.reason }
    case 'poster_error':
      return {
        ...state,
        posterStatus: 'error',
        reason: state.status === 'ready' ? null : 'thumbnail_error',
      }
    case 'timeout':
      return state.status === 'loading'
        ? { ...state, status: 'error', reason: 'load_timeout' }
        : state
    case 'retry':
      return canRetryMedia(state)
        ? {
            ...state,
            status: 'idle',
            reason:
              state.posterStatus === 'missing'
                ? 'thumbnail_missing'
                : state.posterStatus === 'error'
                  ? 'thumbnail_error'
                  : null,
          }
        : state
  }
}

export function classifyVideoElementError(
  code: number | undefined
): FeedMediaFailure {
  if (code === 1) return 'load_aborted'
  if (code === 2) return 'network_error'
  if (code === 3) return 'decode_error'
  if (code === 4) return 'unsupported_codec'
  return 'unknown_error'
}

export const feedMediaReasonLabel = (
  reason: FeedMediaFailure | null
): string => {
  switch (reason) {
    case 'video_url_missing':
      return 'У записи нет ссылки на видео'
    case 'video_url_invalid':
      return 'Ссылка на видео некорректна'
    case 'thumbnail_missing':
      return 'Превью нет — загружаем видео'
    case 'thumbnail_error':
      return 'Превью не загрузилось'
    case 'network_error':
      return 'Видео недоступно по сети'
    case 'decode_error':
      return 'Ошибка декодирования видео'
    case 'unsupported_codec':
      return 'Браузер не поддерживает кодек видео'
    case 'load_aborted':
      return 'Загрузка видео прервана'
    case 'load_timeout':
      return 'Видео не ответило вовремя'
    case 'unknown_error':
      return 'Видео не загрузилось'
    default:
      return ''
  }
}
