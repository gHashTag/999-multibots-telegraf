export interface EventPayload {
  id: string
  name: string
  data: Record<string, any>
  ts?: number
  user?: {
    id: string
    [key: string]: any
  }
  v?: number
}
