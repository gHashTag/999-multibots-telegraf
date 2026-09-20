/**
 * THE WINDOW LOOKS LIKE OURS, BECAUSE IT IS OURS.
 *
 * The viewer is neko's own page, and until now the person opened their
 * browser and landed on somebody else's product: a cat, the word "n.eko",
 * and a palette from another project. It is served through our proxy, at our
 * origin, inside our app -- the only reason it looked foreign is that nobody
 * had dressed it.
 *
 * ── WHAT IS AND IS NOT TOUCHED ────────────────────────────────────────────
 *
 * Only the DOCUMENT is rewritten, and only its head. The stream, the input
 * channel, the scripts and every asset go through untouched: this is paint,
 * not a fork, and the day neko changes its markup the worst case is a bar
 * that looks plain again.
 *
 * ── ATTRIBUTION STAYS ─────────────────────────────────────────────────────
 *
 * neko is Apache-2.0. The licence does not require its name on the screen,
 * and it does not permit using its marks -- so the cat goes and the CREDIT
 * stays, in words, next to our own mark, still linking to the repository it
 * came from. Taking the engine's name off a window it renders would be both
 * unnecessary and shabby.
 */

/**
 * THE MARK AND THE NAME ARE THE APP'S OWN, taken from its header rather
 * than invented here: `player/src/components/Header/Header.tsx` renders
 * `/t27-mark.svg` at 30px beside the words "Trinity S3AI", and this window
 * is the same product, so it says the same thing.
 *
 * By URL, not inlined. In every real deployment this document and that file
 * are the SAME ORIGIN -- nginx serves the app at `/` and proxies `/live/`
 * beside it -- so one request fetches the mark and the browser caches it.
 * Inlining would put a second copy of the logo in a second place, which is
 * how two logos start to disagree.
 *
 * Where it is absent the image does not paint and the words beside it carry
 * the bar. That is why the name is TEXT and not part of the picture.
 */
export const LOGO_URL = '/t27-mark.svg'

/** What the app's own header says. One brand, spelled one way. */
export const BRAND_NAME = 'Trinity S\u00B3AI'

/** The app's own tokens, copied deliberately: this page cannot import them. */
const GREEN = '#00ff88'
const INK = '#0a0c0b'
const SURFACE = '#121614'
const TEXT = '#e9f5ef'

export const BRAND_CSS = `
:root {
  --t27-green: ${GREEN};
}
html, body, #neko, .neko-main, .video-container, .video, .player {
  background: ${INK} !important;
}
body { color: ${TEXT}; }

/* The top bar. neko's own, restyled -- its icons still work. */
.header-container, .header {
  background: ${SURFACE} !important;
  border-bottom: 1px solid rgba(0, 255, 136, 0.18) !important;
}

/*
 * The mark and the name. The cat and the word "n.eko" are hidden rather than
 * removed, because they belong to neko's own markup; what replaces them is
 * our logo as a background and our name as generated text.
 */
.header a.neko img, .header a.neko span { display: none !important; }
/* The app's header geometry: a 30px square mark, 8px, then the wordmark. */
.header a.neko {
  display: inline-flex !important;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding-left: 38px;
  background-image: url('${LOGO_URL}');
  background-repeat: no-repeat;
  background-position: left center;
  background-size: 30px 30px;
  color: #fff !important;
  text-decoration: none !important;
  font: 600 16px/1.2 system-ui, -apple-system, 'Segoe UI', sans-serif;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
/* Our name, then the engine's -- the link still goes to the engine. */
.header a.neko::before {
  content: '${BRAND_NAME}';
  color: #fff;
}
.header a.neko::after {
  content: 'на движке n.eko';
  opacity: 0.45;
  font-size: 10px;
}

.header .menu i { color: ${TEXT} !important; opacity: 0.75; }
.header .menu i:hover { color: ${GREEN} !important; opacity: 1; }

/* Anything neko paints in its own blue answers to our green instead. */
.controls .request-control, .room-menu button, button.primary {
  background: ${GREEN} !important;
  color: ${INK} !important;
  border-color: ${GREEN} !important;
  font-weight: 600;
}

/* "Подключено" and its siblings. */
.vue-notification-group .vue-notification {
  background: ${SURFACE} !important;
  border-left: 3px solid ${GREEN} !important;
  color: ${TEXT} !important;
  border-radius: 8px;
}
.vue-notification-group .vue-notification.success {
  border-left-color: ${GREEN} !important;
}
.vue-notification-group .vue-notification.error {
  border-left-color: #ff6b6b !important;
}

/* A phone has no room for the credit line; the mark alone carries it. */
@media (max-width: 480px) {
  .header a.neko {
    height: 22px;
    padding-left: 28px;
    background-size: 22px 22px;
    font-size: 13px;
  }
  .header a.neko::after { display: none; }
}
`

/** What the tab says it is, in the person's own app rather than a stranger's. */
export const PAGE_TITLE = `Браузер · ${BRAND_NAME}` // cyrillic-ok: read by a person

/**
 * Dress the document.
 *
 * Returns the html unchanged when there is no `</head>` to insert before --
 * an error page, a redirect body, anything unexpected. A window that looks
 * plain is a working window; a window mangled by a careless replace is not.
 */
export function injectSkin(html: string): string {
  if (!html.includes('</head>')) return html
  const styled = html.replace(
    '</head>',
    `<style data-t27-skin>${BRAND_CSS}</style>\n</head>`
  )
  return styled
    .replace(/<title>[^<]*<\/title>/i, `<title>${PAGE_TITLE}</title>`)
    .replace(
      /<link rel="icon"[^>]*>/gi,
      `<link rel="icon" type="image/svg+xml" href="${LOGO_URL}">`
    )
}

/**
 * Only the document is rewritten; the stream and every asset stream on.
 *
 * A COMPRESSED document is left alone too. Reading a gzip body as utf8 text
 * would hand back mojibake with a `content-encoding: gzip` header still on
 * it, and the page would not load at all -- a blank window is far worse than
 * an unpainted one. neko does not compress its shell today; this is here so
 * that the day something in front of it does, the window still works.
 */
export function shouldDress(headers: {
  'content-type'?: string
  'content-encoding'?: string
}): boolean {
  if (headers['content-encoding']) return false
  return (headers['content-type'] || '').toLowerCase().includes('text/html')
}
