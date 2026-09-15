/**
 * THE CANNED MEDIA LINE, IN A LANGUAGE THE PERSON CAN READ.
 *
 * The text path was taught the client's language on 2026-09-15, from the words
 * they wrote. This path was forgotten, and it is the one with no words to read
 * at all: a photo with no caption carries none.
 *
 * So the only signal available is the locale their Telegram reports. That is a
 * poor source for a CONVERSATION -- a Russian speaker on an English phone
 * would be answered in English, which is exactly why the text path refuses to
 * use it -- and the best one available here, where the alternative is
 * answering everybody in Russian.
 *
 * A separate module for the same reason albumOnce is one: importing
 * businessBotService pulls in the whole scene graph and cannot be done from a
 * test.
 */

/**
 * Languages whose speakers commonly read Russian, plus the empty string.
 *
 * An unknown or missing locale keeps Russian on purpose: the owner's clients
 * are mostly Russian-speaking, and silence is not a signal to switch.
 */
const READS_RUSSIAN = ['ru', 'be', 'uk', 'kk', 'ky', 'uz', 'hy', 'az', '']

export function mediaReply(
  kind: { reply: string; replyEn: string },
  languageCode: string | undefined | null
): string {
  const lang = String(languageCode ?? '')
    .toLowerCase()
    .slice(0, 2)
  return READS_RUSSIAN.includes(lang) ? kind.reply : kind.replyEn
}
