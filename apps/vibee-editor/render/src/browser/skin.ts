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
 * ── WHERE ATTRIBUTION LIVES ───────────────────────────────────────────────
 *
 * Not on this screen, by the owner's decision of 2026-09-21. That is allowed:
 * Apache-2.0 hangs its notice duties on DISTRIBUTING the work, and running it
 * as a hosted service is not distribution. What the licence does ask for is
 * kept: upstream's LICENSE and notices are untouched inside the image, and
 * `deployment/remote-browser/Dockerfile` says plainly what it is built from.
 *
 * Its marks are not used either -- that part was never optional.
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

/** Kept here as a literal: skin.ts must not import live-pipe.ts, which
 *  imports this file. One constant, one home -- live-pipe re-exports it. */
export const FIT_PATH = '/__fit'

/**
 * Where the window asks for the watcher's own face.
 *
 * neko draws initials on a disc -- "YO" for everybody whose name starts that
 * way, which on a screen showing YOUR browser is a stranger's placeholder.
 */
export const AVATAR_PATH = '/__avatar'

/** What the app's own header says. One brand, spelled one way. */
export const BRAND_NAME = 'Trinity S\u00B3AI'

/*
 * MEASURED OFF THE LIVE APP (app.t27.ai, 2026-09-21), not chosen by eye.
 * The first attempt guessed, and guessing produced a glowing green rule and
 * a big bold title -- loud where the product is restrained. The app is
 * neutral black with hairlines, and green appears only ON something
 * interactive, always with BLACK text on it.
 *
 *   body            #000
 *   chrome          #111        header height 48px
 *   hairline        #1a1a1a     1px, never coloured
 *   secondary text  #888
 *   idle border     #444
 *   accent          #00ff88     black text on it, pill radius 16px
 *   brand text      16px / 600 / #fff, beside a 30px mark
 *   type            Outfit
 */
const BLACK = '#000'
const CHROME = '#111'
const LINE = '#1a1a1a'
const DIM = '#888'
const IDLE_BORDER = '#444'
const GREEN = '#00ff88'

/** The same family and the same weights the app asks for. */
export const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
const FONT_STACK =
  "Outfit, -apple-system, system-ui, 'Segoe UI', Roboto, sans-serif"

export const BRAND_CSS = `
:root {
  --t27-accent: ${GREEN};
  /*
   * ONE NUMBER FOR THE BAR, and everything that has to agree with it reads
   * it here: the bar itself, the footer pinned into the bar, and the height
   * left for the picture. They were three separate literals and they
   * disagreed by 3px -- the controls centred on 24 while the bar's own
   * icons centred on 22, which is exactly the crookedness that was
   * complained about.
   */
  --t27-bar: 48px;
  /*
   * The room left for neko's own three icons, so the controls pinned into
   * the bar stop before them instead of landing on top -- which is what a
   * guessed 96px did: the speaker sat on the mouse.
   *
   * It is arithmetic, not a guess: three items of 32px with 4px between
   * them is 104, plus the bar's 12px padding.
   */
  --t27-menu: 116px;
}

html, body, #neko, .neko-main, .video-container, .video, .player {
  background: ${BLACK} !important;
}
body {
  color: #fff;
  font-family: ${FONT_STACK} !important;
}
/*
 * Everything EXCEPT the icons. Forcing the family on every node hit the
 * Font Awesome glyphs too, and every icon in the bar turned into a row of
 * little bars -- the icon font was overridden, so the private-use
 * codepoints fell back to whatever Outfit has there. Icons carry their
 * font in their own class; leave it alone.
 */
#neko *:not(i):not([class*='fa-']):not(.fas):not(.far):not(.fab) {
  font-family: ${FONT_STACK} !important;
}

/* ── the bar ──────────────────────────────────────────────────────────── */
/*
 * THE BAR FLOATS ON THE PICTURE, AS FROSTED GLASS.
 *
 * Two things at once, and they are the same thing: the bar stops taking a
 * 48px slice of the window, so the picture is the WHOLE window and the
 * black edges go; and what the bar covers is still visible through it.
 *
 * POINTER EVENTS PASS THROUGH THE GLASS. The bar covers the top strip of
 * the person's own browser -- their tabs, their address bar. Seeing them
 * through frosted glass but being unable to click them would be worse than
 * an opaque bar, so the glass itself takes no clicks and only the controls
 * on it do.
 */
.header-container {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  z-index: 10 !important;
  background: transparent !important;
  pointer-events: none !important;
}
.header {
  background: rgba(17, 17, 17, 0.55) !important;
  -webkit-backdrop-filter: blur(16px) saturate(140%) !important;
  backdrop-filter: blur(16px) saturate(140%) !important;
  /* A hairline, not a rule. The app never puts colour on an edge. */
  border-bottom: 1px solid rgba(255, 255, 255, 0.07) !important;
  box-shadow: none !important;
  pointer-events: none !important;
}
.header .menu, .header .menu li, .room-container {
  pointer-events: auto !important;
}
.header {
  height: var(--t27-bar) !important;
  min-height: var(--t27-bar) !important;
  box-sizing: border-box !important;
  padding: 0 12px !important;
}

/* The app's own header geometry: a 30px mark, 8px, 16px/600 white. */
.header a.neko img, .header a.neko span { display: none !important; }
.header a.neko {
  display: inline-flex !important;
  align-items: center;
  gap: 8px;
  /* Never grows. Measured stretched to 235px on a phone, where its visible
     part is a 22px mark -- an invisible box lying across half the bar. */
  flex: 0 0 auto !important;
  height: 30px;
  padding-left: 38px;
  background-image: url('${LOGO_URL}');
  background-repeat: no-repeat;
  background-position: left center;
  background-size: 30px 30px;
  color: #fff !important;
  text-decoration: none !important;
  white-space: nowrap;
}
.header a.neko::before {
  content: '${BRAND_NAME}';
  font: 600 16px/1.2 ${FONT_STACK};
  letter-spacing: 0.01em;
  color: #fff;
}
/*
 * NO ENGINE NAME ON SCREEN. Owner's decision, 2026-09-21.
 *
 * It is permitted: Apache-2.0 attaches its notice duties to DISTRIBUTING the
 * work, and running it as a hosted service is not that. Upstream's LICENSE
 * and notices stay untouched inside the image, and the Dockerfile says what
 * it is built FROM -- attribution lives in the source, which is where the
 * licence asks for it.
 *
 * The logo is also no longer a link: the anchor's href points at the
 * engine's repository and CSS cannot change an href, so a credit removed
 * from the text but reachable by a click would not be removed at all.
 *
 * HONEST LIMIT: this is the visible surface only. Anyone reading the page
 * source, the bundle names or the socket protocol can still tell what runs
 * underneath. It is not a disguise and must not be sold as one.
 */
.header a.neko::after { content: none !important; }
.header a.neko { pointer-events: none !important; cursor: default !important; }

/*
 * ONE GROUP OF CONTROLS, IN ONE PLACE.
 *
 * neko scatters them: three icons in the bar, a floating column of two on
 * the right edge of the picture, and one more in the bottom corner. A person
 * watching their own browser should not be hunting for the controls of the
 * window they are already inside.
 *
 * So the floating ones go (below), and these are gathered into a single
 * aligned row: equal boxes, equal gaps, flush right.
 */
.header .menu {
  display: flex !important;
  align-items: center;
  gap: 4px !important;
  margin: 0 0 0 auto !important;
  padding: 0 !important;
  list-style: none !important;
}
.header .menu li {
  display: flex !important;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: 0 !important;
  border-radius: 8px;
}
.header .menu li:hover { background: ${LINE} !important; }
/*
 * THE GLYPH, NOT ONLY ITS BOX.
 *
 * Every box in this bar centred on 23.5 and the icons on the right still
 * looked higher than the rest, because these three were left as inline text:
 * a Font Awesome glyph sits on the font's baseline, not in the middle of its
 * line box. The controls further along were already flex-centred, so the two
 * halves of one bar disagreed by a few pixels -- measured identical, seen as
 * crooked, which is the only measurement that matters.
 */
.header .menu i, .header .menu li i {
  color: ${DIM} !important;
  font-size: 14px !important;
  line-height: 1 !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 28px !important;
  width: 28px !important;
}
.header .menu i:hover { color: #fff !important; }
.header .menu i:not(.disabled) { color: ${GREEN} !important; }

/*
 * THE PICTURE TAKES THE WINDOW, AND NOTHING FLOATS ON IT.
 *
 * ul.video-menu.top is a column of two buttons pinned to the right edge of
 * the stream, ul.video-menu.bottom is one more in the corner. They sit ON
 * the person's own screen, which is the one thing that must stay unobscured
 * -- the whole point of watching is seeing every pixel of what happens.
 */
.player .video-menu, .video-menu.top, .video-menu.bottom {
  display: none !important;
}
.neko-main, .video-container, .video, .player {
  width: 100% !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
.video video, .player video {
  width: 100% !important;
  height: 100% !important;
  /* contain, never cover: cropping somebody's screen hides what they
     came to watch. The letterbox is answered by resizing the DESKTOP to the
     box (screen.ts), not by cutting the picture. */
  object-fit: contain !important;
  background: ${BLACK} !important;
}

/* ── the chrome below ─────────────────────────────────────────────────── */
.room-container, .controls, .members, .members-container, .room-menu,
.settings, .emotes {
  background: ${CHROME} !important;
  border-color: ${LINE} !important;
  color: #fff;
}
.room-container { border-top: 1px solid ${LINE} !important; }

/*
 * THE HAMBURGER'S GREY BOX.
 *
 * neko gives the open toggle a filled slab in its own palette (#36393f),
 * which on our bar reads as a stray grey square. The control stays; the box
 * becomes the same 8px hover square every other icon here uses.
 */
.header .menu .toggle,
.header .menu i.toggle {
  background: transparent !important;
  border-radius: 8px !important;
  padding: 0 !important;
}

/*
 * ICONS ON THE LOGO'S LINE.
 *
 * The bar's height is neko's, and it changes with the window; centring by
 * eye holds at one size and slips at the next. Both sides are centred
 * against the bar itself, so they line up at every height.
 */
.header { display: flex !important; align-items: center !important; }
.header a.neko, .header .menu, .header .menu li { align-self: center !important; }

/* ── the row along the bottom ─────────────────────────────────────────── */
/*
 * Everything down there was still neko's: Discord greys, a teal slider, a
 * pale-green avatar. Same language as the top now -- #888 at rest, white on
 * hover, and the accent only where something is actually on.
 */
.room-menu, .settings, .controls, .emotes {
  background: ${CHROME} !important;
  border: 0 !important;
}
/*
 * ONE AXIS FOR THE WHOLE ROW.
 *
 * The items are different heights by nature -- a 15px question mark, a 24px
 * toggle, a 20px slider -- and a row that only puts them side by side lets
 * each sit on its own baseline. Measured before this: centres at 675, 678
 * and 683, which reads exactly as crooked as it is.
 *
 * Every container centres its children, and every control gets the same box
 * height, so they share one axis no matter what is inside them.
 */
.room-menu { display: flex !important; align-items: center !important; }
.settings, .controls {
  display: flex !important;
  align-items: center !important;
}
.settings > ul, .controls > ul {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  margin: 0 !important;
  padding: 0 !important;
  list-style: none !important;
}
.settings > ul > li, .controls > ul > li {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 28px !important;
  margin: 0 !important;
}
.controls .volume {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  height: 28px !important;
}
.room-menu i, .settings i, .controls i, .emotes i {
  color: ${DIM} !important;
  font-size: 15px !important;
  line-height: 1 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 28px !important;
}
.room-menu i:hover, .settings i:hover, .controls i:hover, .emotes i:hover {
  color: #fff !important;
}
/* Faded means unavailable, and it should look unavailable, not merely dim. */
.controls i.faded { color: #4a4a4a !important; }

/* The language chip, as a pill like everything else the app offers. */
.settings select {
  background: ${LINE} !important;
  color: ${DIM} !important;
  border: 1px solid ${IDLE_BORDER} !important;
  border-radius: 8px !important;
  padding: 2px 6px !important;
  font: 500 11px/1.2 ${FONT_STACK} !important;
}

/* The toggle: off is a neutral track, on is the accent. */
.controls label.switch span {
  background: ${IDLE_BORDER} !important;
  border-radius: 999px !important;
}
.controls label.switch input:checked + span {
  background: ${GREEN} !important;
}

/*
 * The volume. accent-color paints the fill and the thumb in one line and is
 * what the platform does natively; the explicit track and thumb below are
 * for the engines that ignore it.
 */
.controls .volume input[type='range'] {
  accent-color: ${GREEN} !important;
  background: transparent !important;
  height: 20px !important;
}
.controls .volume input[type='range']::-webkit-slider-runnable-track {
  height: 3px !important;
  border-radius: 999px !important;
  background: ${IDLE_BORDER} !important;
}
.controls .volume input[type='range']::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px !important;
  height: 12px !important;
  margin-top: -4.5px !important;
  border-radius: 50% !important;
  background: ${GREEN} !important;
  border: 0 !important;
}

/*
 * WHO IS IN THE ROOM. The avatars were a pale green of neko's own; they are
 * the one place the accent belongs down here, because a person present is
 * exactly the kind of "on" this palette colours.
 */
.members .avatar, .members-list .avatar, div.avatar {
  background: ${GREEN} !important;
  color: ${BLACK} !important;
  border: 0 !important;
  /*
   * FAMILY AND WEIGHT ONLY -- NEVER THE SHORTHAND.
   *
   * neko centres the initials with an INLINE style on the element:
   * width 50, height 50, line-height 50, font-size 25. The font shorthand
   * resets everything it does not name, and with !important it
   * beat that inline rule: the initials rendered at 13px on a 13px line and
   * sat outside the top of the circle. Photographed by the owner.
   */
  font-family: ${FONT_STACK} !important;
  font-weight: 600 !important;
  text-align: center !important;
  /*
   * Resized for the bar, and LINE-HEIGHT MATCHES THE HEIGHT. That equality
   * is the whole of neko's centring; breaking it is what put the initials
   * outside the circle in the first place.
   */
  width: 24px !important;
  height: 24px !important;
  line-height: 24px !important;
  font-size: 11px !important;
}

/*
 * EVERYTHING IN ONE BAR, AND THE REST IS PICTURE.
 *
 * neko puts its controls in a footer 126px tall: a row of avatars above a
 * row of buttons. On a person's own browser that is 126px of chrome under
 * the thing they actually came to look at, and a second place to look for
 * controls after the bar at the top.
 *
 * CSS cannot move a node, but it can take one out of flow: the footer is
 * pinned into the top bar instead, so the player gets the whole window and
 * every control is in one place. The nodes stay where neko put them, which
 * is why this survives the engine rearranging its own markup.
 *
 * The avatars come along rather than being hidden. They are the only sign
 * that SOMEBODY ELSE IS WATCHING, and that is not a decoration to drop for
 * tidiness -- it is shrunk to 24px and set beside the buttons.
 */
.room-container {
  position: fixed !important;
  top: 0 !important;
  right: var(--t27-menu) !important;
  left: auto !important;
  bottom: auto !important;
  width: auto !important;
  /*
   * ONE PIXEL SHORTER THAN THE BAR, ON PURPOSE.
   *
   * The bar is border-box with a 1px hairline, so its CONTENT box is
   * 47 and its own items centre on 23.5. A pinned row of the full 48
   * centres on 24, and half a pixel of disagreement is still visible as
   * crookedness. Matching the content boxes is what makes one axis.
   */
  height: calc(var(--t27-bar) - 1px) !important;
  box-sizing: border-box !important;
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 12px !important;
  padding: 0 !important;
  margin: 0 !important;
  background: transparent !important;
  border: 0 !important;
  /*
   * ABOVE THE GLASS, NOT BEHIND IT.
   *
   * At z-index 6 the controls sat UNDER the bar's backdrop-filter and came
   * out blurred -- frosted glass over the very buttons it was meant to
   * float beside. They belong on top of it.
   */
  z-index: 11 !important;
}
/*
 * EVERY LEVEL CENTRES ITS CHILD, all the way down to the initials.
 *
 * Measured otherwise: .members centred at 23.5 like the rest of the bar,
 * but .members-container was a block, so the list sat at the top of it
 * (13.5), and the member inside carried a 10px top margin of neko's. The
 * avatar came out 5px above everything else -- a single round thing out of
 * line, which is exactly what the eye catches first.
 */
.members, .members-container, .room-menu, .settings, .controls {
  width: auto !important;
  height: calc(var(--t27-bar) - 1px) !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: 0 !important;
  display: flex !important;
  align-items: center !important;
}
.member, .self.member {
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.members-list {
  margin: 0 !important;
  padding: 0 !important;
  gap: 4px !important;
  display: flex !important;
  align-items: center !important;
}
/*
 * The avatar was top-aligned in its cell -- centre 22 against the row's 24.
 * The cell centres its child; the child is no longer asked to know where it
 * is.
 */
.members-list li {
  width: 28px !important;
  height: 28px !important;
  margin: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}
.member, .self.member { width: 24px !important; height: 24px !important; }

/*
 * THE PICTURE IS THE WHOLE WINDOW.
 *
 * Not the window minus a bar: the bar floats over it now. This is what
 * removes the black edges -- the fitter asks the desktop to be the shape of
 * the window, and the window is exactly what the picture gets, so the two
 * agree and there is nothing left over to letterbox.
 */
.neko-main, .video-container, .video, .player {
  height: 100vh !important;
  max-height: none !important;
}

/*
 * THE SPEAKER SLAB IN THE MIDDLE OF SOMEBODY'S SCREEN.
 *
 * neko draws a full-size "click to unmute" over the picture. The same
 * control is a 15px icon in the bar, so the slab is a duplicate that covers
 * the one thing that must stay visible.
 */
.video-container > .video > div[class*='overlay'],
.player .overlay, .video .overlay, .player-overlay {
  display: none !important;
}

/* ── buttons are pills ────────────────────────────────────────────────── */
#neko button, .room-menu button, .controls button {
  border-radius: 16px !important;
  font: 500 11px/1.2 ${FONT_STACK} !important;
  padding: 6px 12px !important;
  background: transparent !important;
  border: 1px solid ${IDLE_BORDER} !important;
  color: ${DIM} !important;
}
#neko button:hover { color: #fff !important; border-color: ${DIM} !important; }
#neko button.primary, .controls .request-control {
  background: ${GREEN} !important;
  border-color: ${GREEN} !important;
  color: ${BLACK} !important;
  font-weight: 600 !important;
}

/* ── what it says while it connects ───────────────────────────────────── */
.vue-notification-group .vue-notification {
  background: ${LINE} !important;
  border: 1px solid #2a2a2a !important;
  border-left: 1px solid #2a2a2a !important;
  border-radius: 8px !important;
  color: #fff !important;
  font: 500 13px/1.35 ${FONT_STACK} !important;
  padding: 10px 14px !important;
}
/* Green says "good" in the type, not as a slab down the side. */
.vue-notification-group .vue-notification.success { color: ${GREEN} !important; }
.vue-notification-group .vue-notification.error { color: #ff6b6b !important; }

/* ── while it comes up ────────────────────────────────────────────────── */
/*
 * OUR LOADER, NOT A BLACK RECTANGLE.
 *
 * Until the stream arrives the window is simply black, and a black window is
 * indistinguishable from a broken one. The geometry is the app's own boot
 * ring -- 34px, 2px, 0.9s linear -- so it is recognisably the same product
 * while it waits, in this window's palette.
 *
 * It removes itself when the picture starts AND after a timeout, because a
 * loader that outlives the thing it waits for hides the error underneath it.
 */
#t27-boot {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 32px;
  text-align: center;
  background: ${BLACK};
  font-family: ${FONT_STACK};
  transition: opacity 0.35s ease;
}
#t27-boot[data-done='1'] { opacity: 0; pointer-events: none; }
#t27-boot img {
  width: 44px;
  height: 44px;
  opacity: 0.9;
}
#t27-boot .ring {
  width: 34px;
  height: 34px;
  border: 2px solid ${LINE};
  border-top-color: ${GREEN};
  border-radius: 50%;
  animation: t27-spin 0.9s linear infinite;
}
#t27-boot .said {
  margin: 0;
  font: 500 14px/1.4 ${FONT_STACK};
  color: #fff;
}
#t27-boot .hint {
  margin: 0;
  max-width: 280px;
  font: 400 12px/1.5 ${FONT_STACK};
  color: ${DIM};
}
@keyframes t27-spin { to { transform: rotate(360deg); } }
/* A spinner next to somebody who asked the system not to move things is not
   a nice touch. The ring stays, the motion goes. */
@media (prefers-reduced-motion: reduce) {
  #t27-boot .ring { animation: none; border-top-color: ${GREEN}; }
}

/* ── a phone ──────────────────────────────────────────────────────────── */
@media (max-width: 480px) {
  .header a.neko {
    height: 24px;
    padding-left: 30px;
    background-size: 24px 24px;
  }
  .header a.neko::before { font-size: 14px; }
}

/* ─────────────────────────────────────────────────────────────────────────
 * A PHONE CANNOT HOLD TEN CONTROLS AND A WORDMARK IN ONE 375px BAR.
 *
 * Measured: they collided with the logo and with each other. So on a narrow
 * screen the bar keeps what somebody actually uses on a phone and drops the
 * rest -- said plainly rather than hidden:
 *
 *   KEPT    the mark, who is watching, the keyboard, mute, and the menu
 *           (which is where neko's own settings live).
 *   DROPPED the wordmark (the mark carries it), the help link, the language
 *           chip, pause, the emoji picker, and the volume SLIDER -- muting
 *           is the control a phone needs; setting a level with a fingertip
 *           on a 150px track is not.
 *
 * Nothing here removes a control the person cannot reach another way, and
 * nothing removes the sign that somebody else is watching.
 * ───────────────────────────────────────────────────────────────────────── */
@media (max-width: 700px) {
  /* The bar gets shorter; everything that reads the number follows. */
  :root { --t27-bar: 44px; }
  .header { padding: 0 8px !important; }

  .header a.neko::before { display: none !important; }
  .header a.neko { padding-left: 26px; background-size: 22px 22px; height: 22px; }

  /* Same arithmetic, with the phone's 8px bar padding. */
  :root { --t27-menu: 112px; }
  .room-container { gap: 8px !important; }

  .settings li:has(i.fa-question-circle),
  .settings i.fa-question-circle,
  .settings select,
  .emotes,
  .controls li:has(i.fa-pause-circle),
  .controls i.fa-pause-circle,
  .controls .volume input[type='range'] {
    display: none !important;
  }
}
`

/**
 * THE WINDOW ASKS THE DESKTOP TO BE ITS SHAPE.
 *
 * Without this, opening the viewer URL directly gives a 1280x800 desktop
 * letterboxed into whatever the window is -- on a phone, a stamp. The mini
 * app's Browser tab already does this from the outside; a window opened on
 * its own had nobody to do it for it.
 *
 * It is deliberately tiny and deliberately quiet: it measures, it asks once,
 * and it asks again only when the window really changes shape. A failure is
 * ignored, because a browser that will not resize is still a browser.
 *
 * The session id comes from the page's own path, so the script needs to know
 * nothing and carry nothing.
 */
export const FIT_SCRIPT = `
(function () {
  var last = null;
  var timer = null;
  function want() { return { w: window.innerWidth, h: window.innerHeight }; }
  function worth(next) {
    if (!last) return true;
    var turned = (last.w >= last.h) !== (next.w >= next.h);
    if (turned) return true;
    var off = function (a, b) { return Math.abs(a - b) / Math.max(a, b, 1); };
    return off(last.w, next.w) > 0.1 || off(last.h, next.h) > 0.1;
  }
  function fit() {
    var m = location.pathname.match(/^\\/live\\/([^/]+)/);
    if (!m) return;
    var next = want();
    if (!worth(next)) return;
    last = next;
    fetch('/live/' + m[1] + '__FIT__?w=' + next.w + '&h=' + next.h,
          { method: 'POST', credentials: 'same-origin' })
      .catch(function () {});
  }
  function later() { clearTimeout(timer); timer = setTimeout(fit, 500); }
  fit();
  window.addEventListener('resize', later);
  window.addEventListener('orientationchange', later);
})();
`.replace('__FIT__', FIT_PATH)

/** What it says while the browser is coming up. */
export const BOOT_SAID = 'Поднимаю браузер…' // cyrillic-ok: read by a person
export const BOOT_HINT =
  'Первый запуск дольше остальных: браузер поднимается вместе с вашим профилем.' // cyrillic-ok

/** Longer than a cold pod takes, shorter than anyone will stare at a ring. */
export const BOOT_GIVE_UP_MS = 45_000

export const BOOT_HTML =
  `<div id="t27-boot">` +
  `<img src="${LOGO_URL}" alt="">` +
  `<div class="ring"></div>` +
  `<p class="said">${BOOT_SAID}</p>` +
  `<p class="hint">${BOOT_HINT}</p>` +
  `</div>`

/**
 * IT MUST LEAVE, AND IT MUST LEAVE EVEN WHEN NOTHING ARRIVES.
 *
 * Hidden when a real frame plays -- not merely when the socket opens, since
 * a connected socket with no picture is exactly the state worth seeing. And
 * hidden anyway after a while, because a loader that outlives what it waits
 * for is a loader that hides the error underneath it.
 */
export const BOOT_SCRIPT = `
(function () {
  var el = document.getElementById('t27-boot');
  if (!el) return;
  var gone = false;
  function done() {
    if (gone) return;
    gone = true;
    el.setAttribute('data-done', '1');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  }
  setTimeout(done, __GIVEUP__);
  function watch(v) {
    if (v.readyState >= 2 && !v.paused) return done();
    v.addEventListener('playing', done, { once: true });
    v.addEventListener('loadeddata', function () { if (!v.paused) done(); });
  }
  var seen = document.querySelector('video');
  if (seen) watch(seen);
  new MutationObserver(function () {
    var v = document.querySelector('video');
    if (v) watch(v);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();
`.replace('__GIVEUP__', String(BOOT_GIVE_UP_MS))

/**
 * PUT THE PERSON'S OWN FACE ON THE DISC.
 *
 * Only on their OWN member -- `.self` -- because the other discs in the bar
 * belong to other viewers, and painting somebody else's face on them would
 * be worse than initials: it would be a lie about who is watching.
 *
 * A 404 means there is no photo, and the initials stay. The image is set as
 * a background so neko's own text stays underneath it and reappears if the
 * picture ever fails to decode.
 */
export const FACE_SCRIPT = `
(function () {
  var m = location.pathname.match(/^\\/live\\/([^/]+)/);
  if (!m) return;
  var url = '/live/' + m[1] + '__AVATAR__';
  var done = false;
  function paint() {
    if (done) return;
    var el = document.querySelector('.members .self .avatar, .members .self.member .avatar');
    if (!el) return;
    done = true;
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url(' + url + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.color = 'transparent';
    };
    img.src = url;
  }
  paint();
  new MutationObserver(paint).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
`.replace('__AVATAR__', AVATAR_PATH)

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
  /*
   * The type comes from the same place the app gets it. It is loaded by the
   * PERSON'S browser, which is already on the internet to be reading this,
   * and `display=swap` means a slow font never delays the window.
   */
  const head =
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link rel="stylesheet" href="${FONT_HREF}">` +
    `<style data-t27-skin>${BRAND_CSS}</style>` +
    `<script data-t27-fit>${FIT_SCRIPT}</script>` +
    `<script data-t27-face>${FACE_SCRIPT}</script>`
  const styled = html
    .replace('</head>', `${head}\n</head>`)
    /*
     * The loader goes in as MARKUP, right after <body>, not as something a
     * script builds: it has to be on screen in the first paint, before any
     * bundle has run. Its own script only takes it away again.
     */
    .replace(
      /<body([^>]*)>/i,
      `<body$1>${BOOT_HTML}<script data-t27-boot>${BOOT_SCRIPT}</script>`
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
