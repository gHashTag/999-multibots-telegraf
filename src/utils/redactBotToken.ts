/**
 * Mask the Telegram bot token embedded in file URLs before it reaches a log.
 *
 * Telegram file URLs are built as
 *   https://api.telegram.org/file/bot<id>:<hash>/<path>
 * where <id>:<hash> is the bot token — a full-control credential. Those URLs
 * flow into logs on ordinary paths (a service's logger.error meta, a scene's
 * debug console.log), and anyone with log access could hijack the bot. The
 * <hash> is the secret; mask it and keep the non-secret numeric <id> so the log
 * still tells you which bot.
 *
 * Our own Bot API server (`--local`, services/telegramApi.ts) names files by
 * an absolute path whose directory IS the token, with no `bot` prefix:
 *   /var/lib/telegram-bot-api/<id>:<hash>/videos/file_3.mp4
 * and its file endpoint serves exactly that path. So a token right after a
 * slash is masked too.
 *
 * The `{20,}` guard on the hash means a short, token-shaped fragment like
 * "bot123:ok" (a real hash is ~35 chars) is left untouched, so this does not
 * mangle unrelated text.
 */
export function redactBotToken(value: unknown): string {
  return String(value).replace(
    /((?:bot|\/)\d+:)[A-Za-z0-9_-]{20,}/g,
    '$1<redacted>'
  )
}
