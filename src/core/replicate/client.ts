import Replicate, { type WebhookEventType } from 'replicate'

export const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
})

export type { WebhookEventType }
