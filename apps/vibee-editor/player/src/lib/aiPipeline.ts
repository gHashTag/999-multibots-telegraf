export type AiPipelineStageId =
  | 'script'
  | 'audio'
  | 'image'
  | 'avatar'
  | 'video'
  | 'editor'

export interface AiPipelineStage {
  id: AiPipelineStageId
  route: string
  labelRu: string
  labelEn: string
  emoji: string
}

/**
 * One source of truth for the workflow shared with the native iOS app.
 *
 * Ordering is product logic: every stage consumes something produced by an
 * earlier one. Keeping it here prevents the header, bottom bar and page-local
 * switch from presenting three different products again.
 */
export const AI_PIPELINE_STAGES: readonly AiPipelineStage[] = [
  {
    id: 'script',
    route: '/generate/script',
    labelRu: 'Сценарий',
    labelEn: 'Script',
    emoji: '📝',
  },
  {
    id: 'audio',
    route: '/generate/audio',
    labelRu: 'Голос',
    labelEn: 'Voice',
    emoji: '🎤',
  },
  {
    id: 'image',
    route: '/generate/image',
    labelRu: 'Фото',
    labelEn: 'Photo',
    emoji: '📷',
  },
  {
    id: 'avatar',
    route: '/generate/avatar',
    labelRu: 'Аватар',
    labelEn: 'Avatar',
    emoji: '🙂',
  },
  {
    id: 'video',
    route: '/generate/video',
    labelRu: 'Видео',
    labelEn: 'Video',
    emoji: '🎬',
  },
  {
    id: 'editor',
    route: '/generate/editor',
    labelRu: 'Редактор',
    labelEn: 'Editor',
    emoji: '🎛️',
  },
] as const
