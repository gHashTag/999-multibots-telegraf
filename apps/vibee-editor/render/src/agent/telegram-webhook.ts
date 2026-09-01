import { timingSafeEqual } from 'node:crypto'

/** Independent URL-path and Telegram header authentication boundary. */
export function telegramWebhookSecretMatches(
  expectedPath: string,
  pathValue: string,
  expectedHeader: string,
  headerValue: string
): boolean {
  if (!expectedPath || !pathValue || !expectedHeader || !headerValue) {
    return false
  }
  const pathExpected = Buffer.from(expectedPath)
  const pathActual = Buffer.from(pathValue)
  const headerExpected = Buffer.from(expectedHeader)
  const headerActual = Buffer.from(headerValue)
  return (
    pathExpected.length === pathActual.length &&
    timingSafeEqual(pathExpected, pathActual) &&
    headerExpected.length === headerActual.length &&
    timingSafeEqual(headerExpected, headerActual)
  )
}

export function telegramWebhookConfig(input: {
  url: string
  headerSecret: string
  agentEnabled: boolean
  sameBot: boolean
}): Record<string, unknown> {
  return {
    url: input.url,
    secret_token: input.headerSecret,
    allowed_updates:
      input.agentEnabled && input.sameBot
        ? ['message', 'pre_checkout_query', 'successful_payment']
        : ['pre_checkout_query', 'successful_payment'],
  }
}
