export const escapeMarkdownV2 = (text: string): string => {
  const escapeChars = /[-_*[\]()~`>#+=|{}.!\\\]]/g
  return text.replace(escapeChars, '\\$&')
}
