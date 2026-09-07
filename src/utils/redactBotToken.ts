/**
 * Mask the Telegram bot token embedded in file URLs before it reaches a log.
 *
 * Telegram file URLs are built as
 *   https://api.telegram.org/file/bot<id>:<hash>/<path>  telegram-api-root-ok
 * where <id>:<hash> is the bot token — a full-control credential. Those URLs
 * flow into logs on ordinary paths (a service's logger.error meta, a scene's
 * debug console.log), and anyone with log access could hijack the bot. The
 * <hash> is the secret; mask it and keep the non-secret numeric <id> so the log
 * still tells you which bot.
 *
 * The `{20,}` guard on the hash means a short, token-shaped fragment like
 * "bot123:ok" (a real hash is ~35 chars) is left untouched, so this does not
 * mangle unrelated text.
 *
 * The pattern anchors on `bot<id>:` and never on the host, so it keeps redacting
 * whether the URL came from the cloud API or from a local Bot API server. The
 * host above is an illustration, not a call site: it must not be routed through
 * the telegramApi helpers.
 */
export function redactBotToken(value: unknown): string {
  return String(value).replace(/(bot\d+:)[A-Za-z0-9_-]{20,}/g, '$1<redacted>')
}
