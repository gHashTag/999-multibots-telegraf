/** Resolve an author link only from ownership fields returned with the record. */
export function feedAuthorProfilePath(
  username: string | undefined,
  telegramId: string | number
): string {
  const target = username?.trim().replace(/^@/, '') || String(telegramId)
  return `/${encodeURIComponent(target)}`
}
