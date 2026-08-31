export const escapeMarkdownV2 = (text: string): string => {
  const escapeChars = /[-_*[\]()~`>#+=|{}.!\\\]]/g
  return text.replace(escapeChars, '\\$&')
}

/**
 * Escapes text for embedding INSIDE a MarkdownV2 code block (``` ... ```).
 * Inside a code block only backslash and backtick are special -- escaping the
 * full MarkdownV2 set here would corrupt the shown text with literal
 * backslashes. A raw backtick/backslash in the content breaks the fence and
 * makes Telegram reject the whole message ("can't parse entities"), so LLM- or
 * user-derived text placed in a code block MUST pass through this first.
 */
export const escapeMarkdownV2CodeBlock = (text: string): string => {
  return text.replace(/\\/g, '\\\\').replace(/`/g, '\\`')
}
