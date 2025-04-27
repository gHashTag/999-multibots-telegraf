export type ApiResponse = string | string[] | { output: string }

export interface ApiError extends Error {
  response?: {
    status: number
  }
}
