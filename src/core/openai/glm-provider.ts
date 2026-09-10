import { logger } from '@/utils/logger'

type Message = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export class GLMProvider {
  private readonly apiKey: string
  // A trailing slash on the variable would build `//chat/completions`; see
  // endpointBase in the render's provider catalogue for the measured 404.
  private readonly baseURL = (
    process.env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4'
  )
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
  private readonly model = process.env.GLM_MODEL || 'glm-5.3'

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async chatCompletion(messages: Message[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('GLM_API_KEY is not configured')
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('[GLMProvider] API error', {
          status: response.status,
          error: errorText,
          model: this.model,
        })
        throw new Error(`GLM API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const content = data.choices?.[0]?.message?.content

      if (!content) {
        logger.error('[GLMProvider] Empty response', { data })
        throw new Error('Empty response from GLM')
      }

      logger.info('[GLMProvider] Successfully got response', {
        model: this.model,
        contentLength: content.length,
      })

      return content
    } catch (error) {
      logger.error('[GLMProvider] Request failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
