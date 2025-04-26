import type { ApiResponse } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function processApiResponse(output: ApiResponse): Promise<string> {
  if (typeof output === 'string') return output
  if (Array.isArray(output) && output[0]) return output[0]
  if (output && typeof output === 'object' && 'output' in output)
    return output.output
  throw new Error(`Некорректный ответ от API: ${JSON.stringify(output)}`)
}
