/**
 * Telegram bot identity that owns Trinity authentication in each runtime.
 *
 * Username and token slot stay together so the browser opens the same bot
 * whose secret validates initData. Secret values themselves never enter this
 * package; only environment variable names do.
 */
export type TelegramAuthEnvironment = 'production' | 'development' | 'test'

export interface TelegramAuthBotConfig {
  username: string
  tokenEnv: 'BOT_TOKEN_12' | 'TELEGRAM_AUTH_BOT_TOKEN' // secret-guard-ok: environment variable names, never values
  configured: boolean
  launch: 'bot-chat' | 'main-mini-app'
}

const PRODUCTION_AUTH_BOT: Readonly<TelegramAuthBotConfig> = {
  username: 't27ai_bot',
  tokenEnv: 'BOT_TOKEN_12',
  configured: true,
  launch: 'bot-chat',
}

const BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{3,30}bot$/i

const unconfiguredAuthBot = (): TelegramAuthBotConfig => ({
  username: '',
  tokenEnv: 'TELEGRAM_AUTH_BOT_TOKEN',
  configured: false,
  launch: 'main-mini-app',
})

const developmentAuthBot = (value?: string): TelegramAuthBotConfig => {
  const username = (value || '').trim().replace(/^@/, '')
  const configured =
    BOT_USERNAME.test(username) && username.toLowerCase() !== 't27ai_bot'
  return configured
    ? {
        username,
        tokenEnv: 'TELEGRAM_AUTH_BOT_TOKEN',
        configured: true,
        launch: 'main-mini-app',
      }
    : unconfiguredAuthBot()
}

/**
 * Resolve an exact auth identity. Unknown/missing environments do not guess
 * production, and development/test never fall back to the production bot.
 */
export function telegramAuthBotForEnvironment(
  environment?: string,
  developmentUsername?: string
): TelegramAuthBotConfig {
  const normalized = (environment || '').trim().toLowerCase()
  if (normalized === 'production') return { ...PRODUCTION_AUTH_BOT }
  if (
    normalized === 'development' ||
    normalized === 'dev' ||
    normalized === 'test'
  ) {
    return developmentAuthBot(developmentUsername)
  }
  return unconfiguredAuthBot()
}

export function telegramAuthLoginUrl(
  environment?: string,
  developmentUsername?: string
): string | null {
  const config = telegramAuthBotForEnvironment(environment, developmentUsername)
  if (!config.configured) return null
  return config.launch === 'main-mini-app'
    ? `https://t.me/${config.username}?startapp=local`
    : `https://t.me/${config.username}?start=login`
}
