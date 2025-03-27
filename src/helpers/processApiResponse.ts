export async function processApiResponse(output: unknown): Promise<string> {
    if (typeof output === 'string') return output
    if (Array.isArray(output) && typeof output[0] === 'string') return output[0]
    if (output && typeof output === 'object' && 'output' in output) {
      const obj = output as { output: string }
      return obj.output
    }
    throw new Error(`Некорректный ответ от API: ${JSON.stringify(output)}`)
  }
  