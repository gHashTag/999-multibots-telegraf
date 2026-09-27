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

import { LOGIN_QUERY } from './live-proxy'

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

/**
 * OUR SOUND, IN PLACE OF THE ENGINE'S CHAT CHIME.
 *
 * The app's own file (player/public/sounds, generated from
 * player/src/lib/bambooSound.ts), at the same origin for the same reason as
 * the mark above. The engine asks for "chat.mp3" relative to the page; the
 * proxy answers that one path with a redirect here.
 */
export const BRAND_SOUND_URL = '/sounds/bamboo.wav'
export const ENGINE_CHAT_SOUND = '/chat.mp3'

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

/** Where the loader's live frames come from (frames.ts, which checks this). */
export const FRAMES_PATH = '/__frames'

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
  /*
   * THE COLOUR ONLY -- NEVER THE SHORTHAND, HERE EITHER.
   *
   * This was the background shorthand with !important, which also sets
   * background-image to none and beats anything written inline. So the
   * person's Telegram photo was fetched, loaded, painted on the disc -- and
   * erased by this line every time. The disc stayed green with two letters
   * on it, photographed by the owner.
   */
  background-color: ${GREEN} !important;
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
 * ONE DISC PER PERSON, AND IT IS THEIR FACE.
 *
 * Every screen that opens the window joins the room as its own member: the
 * phone, the laptop, a tab left open. They are all the same person -- one
 * pod per person, and everybody who logs in through the broker logs in
 * under that person's Telegram name -- and neko drew each of them as its
 * own disc with the same two letters. Three of them overlapping in a 28px
 * cell is what the owner photographed.
 *
 * So the bar shows ONE disc, the person's own, with their Telegram photo on
 * it; and when more screens are watching, a count on that disc says how
 * many. The sign that somebody else is watching is kept -- as a number,
 * rather than as copies of the same face.
 *
 * The photo is a CSS variable on the root, set by the face script once the
 * image has loaded. Not a style on the disc: Vue re-renders the disc when
 * the room changes, and a style written onto the old element went with it.
 */
.members-list li:not(:first-child) { display: none !important; }
.members-list li:nth-child(2)::before { content: none !important; }
.members .member::before,
.members .member::after { content: none !important; }
html[data-t27-face] .members .self .avatar {
  background-image: var(--t27-face) !important;
  background-size: cover !important;
  background-position: center !important;
  color: transparent !important;
}
.members .self[data-t27-more]::after {
  content: attr(data-t27-more) !important;
  display: block !important;
  position: absolute !important;
  right: -6px;
  bottom: -4px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: 7px;
  background: ${CHROME};
  border: 1px solid ${IDLE_BORDER};
  color: ${GREEN};
  font: 600 9px/12px ${FONT_STACK};
  text-align: center;
  margin: 0 !important;
  width: auto !important;
}

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
 * THE SPEAKER SLAB IN THE MIDDLE OF SOMEBODY'S SCREEN -- AND THE LAYER THAT
 * MUST NEVER GO WITH IT.
 *
 * neko draws a full-size "click to unmute" over the picture. The same
 * control is a 15px icon in the bar, so the slab is a duplicate that covers
 * the one thing that must stay visible. It is a DIV.
 *
 * neko's input layer is a TEXTAREA with the very same class name, lying over
 * the picture: it is what turns a click or a tap into a click inside the
 * person's browser. Hiding ".overlay" hid that too, and from 2026-09-22 the
 * owner could not press anything by hand -- the tap reached the video
 * element and stopped there. Their own window said so: elementFromPoint
 * answered "video" while hosting was true (TOUCH_REPORT_SCRIPT below). Only
 * DIVs are hidden now, and the textarea is kept alive and clickable: while
 * nobody holds control, a click on it is how control is asked for.
 */
.video-container > .video > div[class*='overlay'],
.player div.overlay, .video div.overlay, div.player-overlay {
  display: none !important;
}
textarea.overlay {
  display: block !important;
  pointer-events: auto !important;
}

/*
 * THE EMOJI LAYER IS GLASS, NOT A SHEET.
 *
 * neko draws flying emoji in .player-container > .emotes, an absolute layer
 * exactly the size of the picture. Two rules above paint ".emotes" in the bar's
 * colour -- meant for the emoji picker down in the controls -- and they hit
 * this layer too: an opaque #111 sheet over the whole stream that also took
 * every click. Measured 2026-09-21 in a live viewer: the video playing at
 * 704x592 with real frames (mean luma 22, max 205), elementFromPoint at the
 * centre answering DIV.emotes, background rgb(17,17,17), pointer-events auto.
 * The owner saw a grey window where the browser should be, and a click did
 * nothing. Made transparent and click-through, the picture was there.
 */
.player-container > .emotes {
  background: transparent !important;
  pointer-events: none !important;
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
#t27-boot { overflow: hidden; }
/*
 * WATCH MODE: the same element, no longer a loader (skin.ts, BOOT_SCRIPT).
 * The frames are the picture now, so they get full brightness and the ring
 * goes; the words move out of the middle and sit at the bottom, where a
 * status line belongs. Taps pass through: this layer answers nothing, and
 * neko underneath has its own card for the connection it never made.
 */
#t27-boot[data-watch='1'] {
  justify-content: flex-end;
  gap: 6px;
  padding: 24px 20px 28px;
  pointer-events: none;
  background: transparent;
}
#t27-boot[data-watch='1'] img.poster { filter: none; }
#t27-boot[data-watch='1'] .ring,
#t27-boot[data-watch='1'] img:not(.poster) { display: none; }
#t27-boot[data-watch='1'] .said,
#t27-boot[data-watch='1'] .hint {
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.62);
}
/*
 * THE PAGE UNDER THE RING. Dimmed, not blurred away: the point is that the
 * person recognises their own page at once. Everything else in the loader
 * sits above it.
 */
#t27-boot img.poster {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  opacity: 1;
  filter: brightness(0.45);
  z-index: 0;
}
#t27-boot > :not(.poster) { position: relative; z-index: 1; }
#t27-boot img:not(.poster) {
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

/* ── when the connection is lost ──────────────────────────────────────── */
/*
 * THE CARD THAT ASKED FOR A PASSWORD NOBODY HAS.
 *
 * neko shows this card whenever it is not connected. The first time it logs
 * in by itself, from the address; if that first attempt fails -- a pod that
 * restarted, a phone that dropped the network -- it forgets the address and
 * falls back to a form asking for a name and a password. The password is a
 * generated token the person has never seen, so the form was a dead end
 * dressed as a login page, with a cat on it.
 *
 * So the card is ours: our mark, our name, our palette. And the form is
 * replaced by what the person actually needs, which is one button that
 * connects again. The fields are hidden only once the connect script has
 * taken the card over (the data-t27 mark): without the script the card is
 * still styled, and still neko's own.
 *
 * Every selector starts at the neko id because the card lives inside it,
 * and the pill rule for buttons above is written against that id -- a
 * weaker selector here would simply lose to it.
 */
#neko .connect {
  background: ${BLACK} !important;
  font-family: ${FONT_STACK} !important;
}
#neko .connect .window {
  width: 320px !important;
  max-width: calc(100vw - 32px) !important;
  box-sizing: border-box !important;
  padding: 28px 24px 24px !important;
  background: ${CHROME} !important;
  border: 1px solid ${LINE} !important;
  border-radius: 16px !important;
}
/* Its click opened the engine's About box; the credit lives in the source. */
#neko .connect .window .logo {
  flex-direction: column !important;
  gap: 12px !important;
  margin-bottom: 20px !important;
  pointer-events: none !important;
  cursor: default !important;
}
#neko .connect .window .logo img { display: none !important; }
#neko .connect .window .logo::before {
  content: '';
  width: 44px;
  height: 44px;
  background: url('${LOGO_URL}') center / contain no-repeat;
}
#neko .connect .window .logo span { font-size: 0 !important; line-height: 0 !important; }
#neko .connect .window .logo span::after {
  content: '${BRAND_NAME}';
  font: 600 16px/1.2 ${FONT_STACK};
  color: #fff;
}
#neko .connect .window .message { gap: 10px !important; }
#neko .connect .window .message > span {
  text-transform: none !important;
  font: 500 14px/1.4 ${FONT_STACK} !important;
  color: #fff !important;
}
#neko .connect .window .message input {
  height: 40px !important;
  margin: 0 !important;
  padding: 0 14px !important;
  background: ${BLACK} !important;
  border: 1px solid ${IDLE_BORDER} !important;
  border-radius: 10px !important;
  color: #fff !important;
  font: 400 14px/1.2 ${FONT_STACK} !important;
  outline: none !important;
}
#neko .connect .window .message input:focus { border-color: ${GREEN} !important; }
#neko .connect .window .message button {
  height: 40px !important;
  margin: 6px 0 0 !important;
  padding: 0 16px !important;
  background: ${GREEN} !important;
  border: 1px solid ${GREEN} !important;
  border-radius: 20px !important;
  color: ${BLACK} !important;
  font: 600 14px/1 ${FONT_STACK} !important;
  text-transform: none !important;
}
#neko .connect .window .message button:hover { filter: brightness(1.08); }

/* What the connect script says, in place of the engine's words. */
#neko .connect .window[data-t27] .message input { display: none !important; }
#neko .connect .window .message > span[data-say],
#neko .connect .window .message button[data-say] {
  font-size: 0 !important;
}
#neko .connect .window .message > span[data-say]::after,
#neko .connect .window .message button[data-say]::after {
  content: attr(data-say);
  font-size: 14px;
}
/* While it is still trying by itself there is nothing to press. */
#neko .connect .window[data-t27='retry'] .message button { display: none !important; }
#neko .connect .window[data-t27='retry'] .message::after {
  content: '';
  align-self: center;
  width: 34px;
  height: 34px;
  margin-top: 8px;
  border: 2px solid ${LINE};
  border-top-color: ${GREEN};
  border-radius: 50%;
  animation: t27-spin 0.9s linear infinite;
}

/* The engine's two bouncing discs become the app's own ring. */
#neko .connect .window .loader {
  width: 34px !important;
  height: 34px !important;
  border: 2px solid ${LINE};
  border-top-color: ${GREEN};
  border-radius: 50%;
  animation: t27-spin 0.9s linear infinite;
}
#neko .connect .window .loader > div { display: none !important; }
@media (prefers-reduced-motion: reduce) {
  #neko .connect .window .loader,
  #neko .connect .window[data-t27='retry'] .message::after { animation: none; }
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
  var hidden = false;
  function want() { return { w: window.innerWidth, h: window.innerHeight }; }
  function worth(next) {
    if (!last) return true;
    var turned = (last.w >= last.h) !== (next.w >= next.h);
    if (turned) return true;
    var off = function (a, b) { return Math.abs(a - b) / Math.max(a, b, 1); };
    return off(last.w, next.w) > 0.1 || off(last.h, next.h) > 0.1;
  }
  // A window nobody is looking at does not get to shape the screen: a hidden
  // frame measures 0, and a background tab is somebody else's turn. Every size
  // request restarts the video, so two windows asking in turn is a black
  // picture for both (screen.ts isVisibleBox has the measurement).
  function looked() {
    return document.visibilityState === 'visible' && window.innerWidth >= 2 && window.innerHeight >= 2;
  }
  function fit() {
    var m = location.pathname.match(/^\\/live\\/([^/]+)/);
    if (!m) return;
    if (!looked()) { hidden = true; return; }
    if (hidden) { hidden = false; last = null; }
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
  // Coming back into view, this window takes the screen back once: another
  // window may have shaped it while this one was hidden.
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { last = null; later(); }
  });
})();
`.replace('__FIT__', FIT_PATH)

/** What it says while the browser is coming up. */
export const BOOT_SAID = 'Поднимаю браузер…' // cyrillic-ok: read by a person
export const BOOT_HINT =
  'Первый запуск дольше остальных: браузер поднимается вместе с вашим профилем.' // cyrillic-ok

/**
 * The same words for everybody else. The markup carries the Russian so the
 * first paint has words in it; the boot script swaps them before that paint
 * when the browser does not ask for Russian -- English is the default here,
 * as everywhere in the app.
 */
export const BOOT_SAID_EN = 'Starting your browser…'
export const BOOT_HINT_EN =
  'The first start takes longer: the browser comes up together with your profile.'

/** Longer than a cold pod takes, shorter than anyone will stare at a ring. */
export const BOOT_GIVE_UP_MS = 45_000

/**
 * WHEN THE VIDEO NEVER COMES AND THE PICTURES DO.
 *
 * Reported 2026-09-27, with a screenshot: the page was there, dimmed, under a
 * ring that said "starting your browser". What the screenshot could not show
 * is what happens forty-five seconds later -- the loader gives up and removes
 * itself, and the poster is INSIDE it, so the live frames go out with the
 * ring. The screen ends up black. "I don't see the pages on screen" was exact.
 *
 * The give-up was written for one failure -- a pod that never comes up, where
 * removing the loader reveals neko's own error card underneath. It is wrong
 * for the other failure: WebRTC that cannot cross the network while Chromium's
 * own screencast crosses it fine. There the loader is not hiding an error, it
 * is holding the only working picture there is.
 *
 * So the give-up asks first: are frames arriving? If they are, the ring and
 * the words go, the dimming goes, and the JPEG stream becomes the picture --
 * watch mode. View only, and it says so, because input rides the video's own
 * channel to the pod (frames.ts) and there is nothing honest to pretend here.
 * If the video ever does play, watch mode ends and the real video takes over.
 */
export const WATCH_SAID = 'Смотрите картинкой' // cyrillic-ok: read by a person
export const WATCH_HINT =
  'Видео не пробилось через сеть — показываю кадры браузера. Управление пока недоступно.' // cyrillic-ok
export const WATCH_SAID_EN = 'Watching as pictures'
export const WATCH_HINT_EN =
  'The video could not cross the network — showing the browser frame by frame. Control is unavailable.'

/**
 * How long a picture may be stale before watch mode stops claiming to be
 * live. Chromium sends a frame per change, so a still page sends nothing for
 * minutes -- this is only about the socket having died, and the reconnect
 * below is what answers it.
 */
export const WATCH_RETRY_MS = 3_000

export const BOOT_HTML =
  `<div id="t27-boot">` +
  /*
   * The person's own page as it is right now, under the loader (the proxy
   * answers __poster from the browser itself; fast-start.ts). Relative on
   * purpose: the document lives at /live/<id>/. It removes itself when
   * there is no poster, and the loader stands on its own.
   */
  `<img class="poster" src="__poster" alt="" onerror="this.style.visibility='hidden'">` +
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
  if (!/^ru\\b/i.test(navigator.language || '')) {
    el.querySelector('.said').textContent = __SAID_EN__;
    el.querySelector('.hint').textContent = __HINT_EN__;
  }
  var gone = false;
  var watching = false;
  var frameSeen = 0;
  /*
   * LIVE FRAMES UNDER THE LOADER until the video plays (frames.ts): the
   * page as it changes, one JPEG at a time, over a socket that is up in one
   * round trip. Pictures only -- nothing is sent back on it.
   */
  var poster = el.querySelector('img.poster');
  var frames = null;
  var lastFrame = null;
  var here = location.pathname.match(/^\\/live\\/([^/]+)/);
  var canFrame = !!(here && poster && window.WebSocket && window.URL && URL.createObjectURL);
  function open() {
    if (gone || !canFrame) return;
    try {
      var dpr = window.devicePixelRatio || 1;
      frames = new WebSocket(
        (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host +
        '/live/' + here[1] + '__FRAMES__' +
        '?w=' + Math.round(innerWidth * dpr) + '&h=' + Math.round(innerHeight * dpr)
      );
      frames.binaryType = 'blob';
      frames.onmessage = function (ev) {
        if (gone) return;
        frameSeen++;
        var url = URL.createObjectURL(ev.data);
        poster.onload = function () {
          if (lastFrame) URL.revokeObjectURL(lastFrame);
          lastFrame = url;
        };
        poster.style.visibility = 'visible';
        poster.src = url;
      };
      /*
       * The server caps one screencast (FRAMES_MAX_MS) because a bridge is
       * not meant to be held forever. In watch mode it IS the picture, so
       * the window asks again -- the cap stays a resource guard and stops
       * being an expiry date on the only thing the person can see.
       */
      frames.onclose = function () {
        frames = null;
        if (gone || !watching) return;
        setTimeout(open, __RETRY__);
      };
    } catch (e) { frames = null; }
  }
  open();
  function done() {
    if (gone) return;
    gone = true;
    watching = false;
    if (frames) { try { frames.close(); } catch (e) {} }
    el.setAttribute('data-done', '1');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  }
  /*
   * Not a loader any more: the picture, plus one honest line about what this
   * is. Pointer events go through, so neko underneath still gets the taps --
   * it has its own card to show for a connection it never made.
   */
  function watchMode() {
    if (gone || watching) return;
    watching = true;
    el.setAttribute('data-watch', '1');
    var said = el.querySelector('.said');
    var hint = el.querySelector('.hint');
    var ru = /^ru\\b/i.test(navigator.language || '');
    if (said) said.textContent = ru ? __WATCH_SAID__ : __WATCH_SAID_EN__;
    if (hint) hint.textContent = ru ? __WATCH_HINT__ : __WATCH_HINT_EN__;
    if (!frames) open();
  }
  /*
   * GIVING UP IS A CHOICE BETWEEN TWO FAILURES. No frames means the loader is
   * hiding something -- neko's own error card -- so it must leave. Frames mean
   * the loader is holding the only working picture, so it must stay and stop
   * pretending to be a loader.
   */
  function giveUp() { if (frameSeen > 0) watchMode(); else done(); }
  setTimeout(giveUp, __GIVEUP__);
  /*
   * The reconnect script (CONNECT_SCRIPT) reaches the same conclusion sooner:
   * it has counted its retries and knows the video is not coming. It asks
   * here rather than deciding for itself -- the choice between "leave, you are
   * hiding an error" and "stay, you are the only picture" lives in one place.
   */
  try { window.__t27GiveUp = giveUp; } catch (e) {}
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
`
  .replace('__GIVEUP__', String(BOOT_GIVE_UP_MS))
  .replace('__RETRY__', String(WATCH_RETRY_MS))
  .replace('__FRAMES__', FRAMES_PATH)
  .replace('__SAID_EN__', () => JSON.stringify(BOOT_SAID_EN))
  .replace('__HINT_EN__', () => JSON.stringify(BOOT_HINT_EN))
  .replace('__WATCH_SAID__', () => JSON.stringify(WATCH_SAID))
  .replace('__WATCH_HINT__', () => JSON.stringify(WATCH_HINT))
  .replace('__WATCH_SAID_EN__', () => JSON.stringify(WATCH_SAID_EN))
  .replace('__WATCH_HINT_EN__', () => JSON.stringify(WATCH_HINT_EN))

/**
 * PUT THE PERSON'S OWN FACE ON THE DISC, AND COUNT THEIR OTHER SCREENS.
 *
 * The face goes on the ROOT, as a CSS variable, once the picture has really
 * loaded; the stylesheet applies it to the person's own disc only. A 404
 * means there is no photo, nothing is set, and the initials stay.
 *
 * The count goes on the person's own disc as an attribute, rewritten
 * whenever the room changes: the number of OTHER members, that is, the
 * person's other screens (see the stylesheet for why they are all theirs).
 */
export const FACE_SCRIPT = `
(function () {
  var m = location.pathname.match(/^\\/live\\/([^/]+)/);
  if (!m) return;
  var root = document.documentElement;
  var url = '/live/' + m[1] + '__AVATAR__';
  var img = new Image();
  img.onload = function () {
    root.style.setProperty('--t27-face', 'url("' + url + '")');
    root.setAttribute('data-t27-face', '1');
  };
  img.src = url;
  function count() {
    var self = document.querySelector('.members .self');
    if (!self) return;
    var more = document.querySelectorAll('.members-list > li').length - 1;
    var want = more > 0 ? '+' + more : '';
    if ((self.getAttribute('data-t27-more') || '') === want) return;
    if (want) self.setAttribute('data-t27-more', want);
    else self.removeAttribute('data-t27-more');
  }
  count();
  new MutationObserver(count).observe(root, { childList: true, subtree: true });
})();
`.replace('__AVATAR__', AVATAR_PATH)

/**
 * What the card says once the connect script has it. Russian when the
 * browser asks for Russian -- the same test neko uses for its own words, so
 * the card never speaks two languages at once -- and English otherwise.
 */
export const LOST_WORDS = {
  ru: {
    lost: 'Связь прервалась, переподключаю…', // cyrillic-ok: read by a person
    stuck: 'Браузер не отвечает', // cyrillic-ok: read by a person
    again: 'Подключить снова', // cyrillic-ok: read by a person
  },
  en: {
    lost: 'Connection lost, reconnecting…',
    stuck: 'The browser is not answering',
    again: 'Connect again',
  },
}

/**
 * The `source` of every message this window posts to its parent. The parent
 * accepts it only from its own origin and only from its own frame.
 */
export const WINDOW_EVENT = 't27-browser'

/** Attempts it makes by itself before it hands the person the button. */
export const RECONNECT_TRIES = 3
/** How long the form must stay up before it counts as a failure. */
export const RECONNECT_SETTLE_MS = 1200
/** Pause before attempt n is n times this. */
export const RECONNECT_PAUSE_MS = 1500

/**
 * CONNECTING AGAIN IS A RELOAD, NOT A FORM.
 *
 * The one address that logs the page in by itself is the login address --
 * the proxy swaps its placeholder for the real token -- so reconnecting means
 * landing there again. The script does that on its own a few times, then
 * stops and shows the button, because a page that reloads forever against a
 * pod that is down is worse than a page that says so.
 *
 * Three things it is careful about:
 *
 *   - The form flashes for a moment on EVERY load, in the first render
 *     before neko starts logging in. Only a form that is still there after
 *     a while counts.
 *   - The count lives in the tab's session storage and is cleared the moment
 *     the card goes away, which is the moment neko is connected. Storage it
 *     cannot use counts as "out of tries": no loop is better than a loop.
 *   - The engine's own submit is stopped before it runs. It would send
 *     whatever is in the fields, and nothing a person can type there is the
 *     password.
 */
export const CONNECT_SCRIPT = `
(function () {
  var m = location.pathname.match(/^\\/live\\/([^/]+)/);
  if (!m) return;
  var home = '/live/' + m[1] + '/' + __QUERY__;
  var key = 't27-reconnect-' + m[1];
  var all = __WORDS__;
  var words = /^ru\\b/i.test(navigator.language || '') ? all.ru : all.en;
  var MAX = __TRIES__;
  function tries() {
    try { return parseInt(sessionStorage.getItem(key) || '0', 10) || 0; }
    catch (e) { return MAX; }
  }
  function note(n) { try { sessionStorage.setItem(key, String(n)); } catch (e) {} }
  function forget() { try { sessionStorage.removeItem(key); } catch (e) {} }
  function go() { location.replace(home); }
  function form() { return document.querySelector('.connect .message'); }
  var seen = false;
  var acted = false;
  var timer = null;
  /*
   * Tell the page around this window what the connection is doing
   * (__EVENT__, same origin only). Without it the Queen's panel and the
   * app's Browser tab showed a frozen frame for as long as neko retried,
   * and kept showing it after the session had closed. Browserbase's live
   * view does the same for its embedders.
   */
  function tell(state) {
    try {
      if (typeof window !== 'undefined' && window.parent && window.parent !== window)
        window.parent.postMessage({ source: __EVENT__, state: state, session: m[1] }, location.origin);
    } catch (e) {}
  }
  function settle() {
    timer = null;
    var f = form();
    if (!f) return;
    acted = true;
    var n = tries();
    var stuck = n >= MAX;
    var win = document.querySelector('.connect .window');
    var title = f.querySelector('span');
    var button = f.querySelector('button');
    if (win) win.setAttribute('data-t27', stuck ? 'stuck' : 'retry');
    tell(stuck ? 'stuck' : 'reconnecting');
    if (title) title.setAttribute('data-say', stuck ? words.stuck : words.lost);
    if (button) button.setAttribute('data-say', words.again);
    if (stuck) {
      /*
       * Out of retries. This used to remove the loader outright -- and the
       * live frames with it, because the picture lives inside it (BOOT_HTML).
       * On a network WebRTC cannot cross that turned a working picture into a
       * black screen. So ask the loader, which knows whether frames arrive.
       */
      var boot = document.getElementById('t27-boot');
      if (typeof window.__t27GiveUp === 'function') window.__t27GiveUp();
      else if (boot) boot.setAttribute('data-done', '1');
      return;
    }
    note(n + 1);
    setTimeout(go, __PAUSE__ * (n + 1));
  }
  function check() {
    if (document.querySelector('.connect')) seen = true;
    else if (seen) { seen = false; forget(); tell('connected'); }
    if (!form()) {
      if (timer) { clearTimeout(timer); timer = null; }
      acted = false;
      return;
    }
    if (timer || acted) return;
    timer = setTimeout(settle, __SETTLE__);
  }
  function mine(e) {
    var t = e.target;
    if (!t || !t.closest || !t.closest('.connect .message')) return;
    if (e.type === 'click' && !t.closest('button')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    go();
  }
  document.addEventListener('click', mine, true);
  document.addEventListener('submit', mine, true);
  check();
  new MutationObserver(check).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();
`
  .replace(/__EVENT__/g, () => JSON.stringify(WINDOW_EVENT))
  .replace('__QUERY__', () => JSON.stringify(LOGIN_QUERY))
  .replace('__WORDS__', () => JSON.stringify(LOST_WORDS))
  .replace('__TRIES__', String(RECONNECT_TRIES))
  .replace('__PAUSE__', String(RECONNECT_PAUSE_MS))
  .replace('__SETTLE__', String(RECONNECT_SETTLE_MS))

/** What the tab says it is, in the person's own app rather than a stranger's. */
export const PAGE_TITLE = `Браузер · ${BRAND_NAME}` // cyrillic-ok: read by a person

/**
 * Dress the document.
 *
 * Returns the html unchanged when there is no `</head>` to insert before --
 * an error page, a redirect body, anything unexpected. A window that looks
 * plain is a working window; a window mangled by a careless replace is not.
 */
/*
 * INSIDE THE APP, NOT neko's BAR (owner, 2026-09-22, with a screenshot: "the
 * header covers the site -- it looks like a browser from the nineties").
 *
 * The glass bar floated over the top of the person's screen and lay across
 * Chromium's own tab strip, carrying a dozen of neko's controls -- sound,
 * emoji, pause, lock, a menu, "request control" -- none of which the app
 * needs: the person takes control by touching (implicit hosting), types
 * through the app's own sheet, and the app has its own bar. So when the
 * window is framed (the app's Browser tab, the Queen's panel) the bar goes
 * and the picture is the whole window. One thing stays: the small row of
 * who is watching, as a pill in the corner -- it is the sign that somebody
 * else is looking, and that is not a decoration.
 *
 * Set before the first paint (a script at the top of <head>), so the bar
 * never flashes on and off.
 */
export const FRAMED_SCRIPT = `try { if (window.parent && window.parent !== window) document.documentElement.setAttribute('data-t27-framed', ''); } catch (e) {}`

export const FRAMED_CSS = `
html[data-t27-framed] .header-container { display: none !important; }
html[data-t27-framed] .room-container {
  top: auto !important;
  bottom: 10px !important;
  right: 10px !important;
  height: 32px !important;
  padding: 0 8px !important;
  border-radius: 16px !important;
  background: rgba(10, 13, 11, 0.72) !important;
  border: 1px solid rgba(0, 255, 136, 0.3) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  backdrop-filter: blur(12px) !important;
  pointer-events: none !important;
}
html[data-t27-framed] .room-container .room-menu,
html[data-t27-framed] .room-container .settings,
html[data-t27-framed] .room-container .controls,
html[data-t27-framed] .room-container .emotes { display: none !important; }
html[data-t27-framed] .members,
html[data-t27-framed] .members-container { height: 30px !important; }
`

/*
 * SILENT BY DEFAULT (owner, 2026-09-22: "turn the sounds off by default -- my
 * child is asleep and wakes up when the browser reloads"). The window carries
 * the pod's audio: a video on X or LinkedIn playing with sound, and every
 * reload of the window starting the stream again. So the viewer's own media
 * elements are muted before the first frame and kept muted -- neko's client
 * unmutes on its own after autoplay, so one mute at load is not enough.
 * `?sound=1` on the window's address is the only way to hear it.
 */
export const MUTE_SCRIPT = `(function () {
  var allowed = /[?&]sound=1(&|$)/.test(location.search);
  if (allowed) return;
  var hush = function (el) {
    if (!el || (el.tagName !== 'VIDEO' && el.tagName !== 'AUDIO')) return;
    el.defaultMuted = true;
    if (!el.muted) el.muted = true;
  };
  var all = function () {
    var list = document.querySelectorAll('video, audio');
    for (var i = 0; i < list.length; i++) hush(list[i]);
  };
  document.addEventListener('volumechange', function (e) { hush(e.target); }, true);
  document.addEventListener('play', function (e) { hush(e.target); }, true);
  document.addEventListener('DOMContentLoaded', all);
  new MutationObserver(all).observe(document.documentElement, { childList: true, subtree: true });
  all();
  /*
   * A SOUND NEED NOT BE IN THE PAGE TO BE HEARD. The events above only reach
   * media elements that are IN the document; a connection chime is usually
   * "new Audio(...).play()", which never is, and a beep is often Web Audio,
   * which has no element at all. So the two makers of sound are muted at the
   * source: every media element is born muted and stays muted through play(),
   * and an audio context is stopped the moment it is created.
   */
  try {
    var Media = window.HTMLMediaElement;
    if (Media && Media.prototype && !Media.prototype.__t27Hushed) {
      var play = Media.prototype.play;
      Media.prototype.play = function () { hush(this); return play.apply(this, arguments); };
      Media.prototype.__t27Hushed = true;
    }
    var Native = window.Audio;
    if (Native && !Native.__t27Hushed) {
      var Quiet = function (src) { var a = new Native(src); a.muted = true; a.defaultMuted = true; return a; };
      Quiet.prototype = Native.prototype;
      Quiet.__t27Hushed = true;
      window.Audio = Quiet;
    }
    var names = ['AudioContext', 'webkitAudioContext'];
    for (var n = 0; n < names.length; n++) {
      (function (name) {
        var Ctx = window[name];
        if (!Ctx || Ctx.__t27Hushed) return;
        var Silent = function () {
          var ctx = new Ctx(arguments[0]);
          try { ctx.suspend(); } catch (e) {}
          try { ctx.resume = function () { return Promise.resolve(); }; } catch (e) {}
          return ctx;
        };
        Silent.prototype = Ctx.prototype;
        Silent.__t27Hushed = true;
        window[name] = Silent;
      })(names[n]);
    }
  } catch (e) {}
})();`

/*
 * WHAT IS UNDER THE FINGER (2026-09-22). The owner could not press "Trust"
 * on Apple's page although the server had given their session control
 * ([browser:mouse] outcome "given"). From outside the window nobody can see
 * why a tap goes nowhere, so the first three taps after each load report,
 * to the app that frames the window: the element at the point, whether
 * neko's input layer takes pointer events, and neko's own idea of who
 * controls (hosting, controlling, locked, implicit hosting). The app logs
 * it (Browser.tsx). No coordinates of text, nothing typed.
 */
export const TOUCH_REPORT_SCRIPT = `(function () {
  if (!window.parent || window.parent === window) return;
  var left = 3;
  var name = function (el) {
    if (!el) return null;
    var c = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (c ? '.' + c : '');
  };
  var store = function () {
    var roots = [document.querySelector('#neko'), document.querySelector('#app'), document.body && document.body.firstElementChild];
    for (var i = 0; i < roots.length; i++) {
      var vm = roots[i] && roots[i].__vue__;
      var r = vm && vm.$accessor && vm.$accessor.remote;
      if (r) return { hosting: !!r.hosting, controlling: !!r.controlling, locked: !!r.locked, implicit: !!r.implicitHosting };
    }
    return null;
  };
  window.addEventListener('pointerdown', function (e) {
    if (left <= 0) return;
    left--;
    var overlay = document.querySelector('.overlay');
    try {
      window.parent.postMessage({
        source: __EVENT__,
        report: 'touch',
        pointer: e.pointerType,
        at: name(document.elementFromPoint(e.clientX, e.clientY)),
        target: name(e.target),
        overlay: overlay ? getComputedStyle(overlay).pointerEvents : 'missing',
        neko: store()
      }, location.origin);
    } catch (err) {}
  }, true);
})();`.replace(/__EVENT__/g, () => JSON.stringify(WINDOW_EVENT))

export function injectSkin(html: string): string {
  if (!html.includes('</head>')) return html
  /*
   * The type comes from the same place the app gets it. It is loaded by the
   * PERSON'S browser, which is already on the internet to be reading this,
   * and `display=swap` means a slow font never delays the window.
   */
  const head =
    `<script data-t27-framed>${FRAMED_SCRIPT}</script>` +
    `<script data-t27-mute>${MUTE_SCRIPT}</script>` +
    `<script data-t27-touch>${TOUCH_REPORT_SCRIPT}</script>` +
    `<style data-t27-framed>${FRAMED_CSS}</style>` +
    `<link rel="preconnect" href="https://fonts.googleapis.com">` +
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
    `<link rel="stylesheet" href="${FONT_HREF}">` +
    `<style data-t27-skin>${BRAND_CSS}</style>` +
    `<script data-t27-fit>${FIT_SCRIPT}</script>` +
    `<script data-t27-face>${FACE_SCRIPT}</script>` +
    `<script data-t27-connect>${CONNECT_SCRIPT}</script>`
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
