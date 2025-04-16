export interface ServiceStats {
  total_requests: number
  successful_requests: number
  failed_requests: number
  average_response_time: number
  last_used: Date
}

export interface ServiceStatsUpdate {
  service_type: string
  success: boolean
  response_time: number
}
