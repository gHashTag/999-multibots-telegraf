export type VideoModelConfig = {
  model: string
  pricePerVideo: number
  canMorph?: boolean
  title?: string
  api?: {
    model: string
    input: Record<string, any>
  }
  imageKey?: string
}
