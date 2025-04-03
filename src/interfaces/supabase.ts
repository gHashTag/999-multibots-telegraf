export interface SupabaseError {
  message: string
  details?: string
  hint?: string
  code?: string
}

export interface SupabaseResponse<T = any> {
  data: T[] | null
  error: SupabaseError | null
  status: number
  statusText: string
  count?: number
}
