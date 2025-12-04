/**
 * Instagram Content Agent Interface Definitions
 */

export interface AnalyzeReelsEvent {
  name: 'instagram/analyze-reels'
  data: AnalyzeReelsEventPayload
}

export interface AnalyzeReelsEventPayload {
  username: string
  max_reels?: number
  days_back?: number
  project_id?: number
  requester_telegram_id?: string
  telegram_user_id?: string
  metadata?: Record<string, any>
}

export interface FindCompetitorsEvent {
  name: 'instagram/find-competitors'
  data: FindCompetitorsEventPayload
}

export interface FindCompetitorsEventPayload {
  username_or_id: string
  count?: number
  min_followers?: number
  project_id?: number
  requester_telegram_id?: string
  telegram_user_id?: string
  metadata?: Record<string, any>
}

