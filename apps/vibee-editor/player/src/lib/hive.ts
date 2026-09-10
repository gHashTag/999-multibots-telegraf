/**
 * The game's address. One constant, imported by the page and by the test, so
 * a moved page is changed in one place and the test tells us if it was not.
 *
 * The hash route is hers: t27.ai is a single-page site and `#/queen` is the
 * board. Do not "clean it up" to `/queen` -- GitHub Pages would answer 404.
 */
export const QUEEN_PAGE = 'https://t27.ai/#/queen'
