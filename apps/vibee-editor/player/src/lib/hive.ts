/**
 * The game's address. One function, imported by the page and by the test, so
 * a moved page is changed in one place and the test tells us if it was not.
 *
 * The hash route is hers: t27.ai is a single-page site and `#/queen` is the
 * board. Do not "clean it up" to `/queen` -- GitHub Pages would answer 404.
 *
 * The language rides in `?lang=` before the hash, because that is where her
 * page reads it (gHashTag/trinity, `apps/website/src/i18n/context.tsx`), and
 * only these codes; any other she would ignore, so it is sent as her default.
 */
const QUEEN_LANGS = ['en', 'ru', 'de', 'zh', 'es']

export function queenPage(lang: string): string {
  const code = QUEEN_LANGS.includes(lang) ? lang : 'en'
  return `https://t27.ai/?lang=${code}#/queen`
}
