import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSetAtom } from 'jotai'
import { useLanguage } from '@/hooks/useLanguage'
import { openLoginAtom } from '@/atoms'
import '@/components/Auth/styles.css'
import {
  answerIdentityRequests,
  boardHash,
  frameHashFor,
  gamePathFor,
  queenPage,
  queenPublicPage,
} from '@/lib/hive'
import { IS_EMBED } from '@/lib/embed'
import { API_BASE } from '@/config'
import { getAppAccessToken } from '@/lib/appSession'
import { getInitData } from '@/lib/telegram'
import { sessionTrustedIn, type FramedWindow } from '@/lib/framedSession'
import {
  cardFromHref,
  cardFromMessage,
  cardFromSearch,
  keepCard,
  searchWithCard,
  withoutCard,
  type OpenCard,
} from '@/lib/cardChat'
import { CardChat } from '@/components/Queen/CardChat'
import './Hive.css'

/**
 * THE HIVE -- THE GAME, AS A TAB. THE WHOLE PAGE, NOT PIECES OF IT.
 *
 * Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game as
 * another tab with all its sub-tabs". Owner, 2026-09-10, after seeing the
 * first version, which re-drew her board piece by piece from the same data:
 * show the whole page, not parts of it; only adapt it for phones.
 *
 * So this tab is her page. One `<iframe>` over the full height above the tab
 * bar, pointed at t27.ai/#/queen. Her comb, her specs,
 * her kanban, mission map, factory and technology tree, her Queen chat -- in
 * her own vocabulary and her own menu order, because they ARE her menu.
 *
 * THE FRAME HOLDS THIS ORIGIN'S COPY (owner, 2026-09-26: "embed the
 * Queen's board into the app"). It used to point at t27.ai while the same
 * board was already built into this server at /queen/, so the product had two
 * addresses for one board and app.t27.ai/queen/#/queen said "queen" twice. Now
 * the frame is /queen/ (lib/hive.ts queenPage), the address people see is
 * app.t27.ai/queen, and t27.ai is only the way out when the frame is blank.
 *
 * WHY A FRAME AND NOT A RE-IMPLEMENTATION
 *
 * The first version was a re-implementation: six panels reading her public
 * JSON, plus a 3-D comb and later a 2-D map ported from her layout code. It
 * was honest about the data and still wrong for the person using it: two
 * boards for one game drift apart the day either changes, and every one of her
 * sub-tabs had to be rebuilt here or left out. The frame has neither problem.
 * Making the page fit a phone is done where the page lives -- in
 * gHashTag/trinity, `apps/website` -- and this app gets it for free.
 *
 * MEASURED, NOT ASSUMED (2026-09-10)
 *
 * t27.ai is served by GitHub Pages and sends neither `X-Frame-Options` nor a
 * `frame-ancestors` policy, so the browser will put it in a frame. This app's
 * own policy (`frame-ancestors 'self' https://web.telegram.org ...`) is about
 * who may frame US, and does not restrict what we frame.
 *
 * NO APP HEADER, NO LINE UNDER THE FRAME (2026-09-10, SECOND PICTURE)
 *
 * The first cut kept this app's header above the frame and a one-line "open in
 * the browser" link below it. The owner opened the tab on an iPhone and got the
 * desktop chrome squeezed into the phone and no starry sky: her page switches
 * to its phone layout by media query, and the frame -- the phone minus
 * Telegram's own header, our header (56px) and our tab bar (64px) -- was
 * shorter than that query allowed. The page's gate is now orientation-based
 * (gHashTag/trinity, `queen-phone.css`), and this side stops spending height:
 * the header and the line are gone, the frame owns everything above the tab
 * bar. Her page has its own head row with its own menu, so nothing is lost --
 * and the owner's words for the earlier preview were "full screen looks great,
 * that is how it must be".
 *
 * The "open in the browser" link is still the explanation for a dark
 * rectangle (WebGL off, a frame blocked), but it lives in the placeholder:
 * visible until the board has drawn itself, and again if it never does.
 *
 * ONE ADDRESS PER VIEW (owner, 2026-10-01: "every tab must have its own
 * unique link", "rename the main page to /game"). The board writes its view
 * into the frame's hash with replaceState, which fires no event, and the
 * frame is this origin's /queen/ -- so the page reads the frame's hash on a
 * short timer and writes the matching /game/<tab> into the app's address
 * (lib/hive.ts gamePathFor). Back, a link, or the tab bar moving the app's
 * address moves the frame the other way (frameHashFor).
 *
 * A CARD OPENS ITS CONVERSATION (owner, 2026-10-01: "tap any card and a chat
 * with the agent opens, with its history, so any task can be carried on";
 * spec kanban-card-chat.t27). The sheet lives HERE, over the frame, because
 * the agent, the person's session and the task thread are this app's. A card
 * asks to open three ways (lib/cardChat.ts): the board's `open-card` message,
 * a tap on the card's GitHub anchor inside the frame, or ?card= in the
 * address. ?card= belongs to the app: the frame never sees it (withoutCard),
 * and the board rewriting its own view keeps it (keepCard).
 */
/** How long a loaded frame may stay empty before the way out comes back. */
export const BOARD_GRACE_MS = 8000
/** How often the frame's address and drawing are read. */
const WATCH_MS = 400

export default function HivePage() {
  const { lang, t } = useLanguage()
  const [loaded, setLoaded] = useState(false)
  const [stuck, setStuck] = useState(false)
  const loadedAt = useRef<number | null>(null)
  const location = useLocation()
  const navigate = useNavigate()
  // The view the address asked for (/game/kanban), read once: after that the
  // board changes its own views inside the frame and the address follows it.
  // A bookmark from before /game -- /queen/#/queen?tab=kanban, sent here by
  // nginx with its fragment -- still names its view by hash, and wins.
  const [asked] = useState(() =>
    /^#\/queen/.test(location.hash)
      ? boardHash(location.hash)
      : frameHashFor(location.pathname, withoutCard(location.search))
  )
  // The card whose conversation is open over the board, from the address.
  const [card, setCard] = useState<OpenCard | null>(() =>
    cardFromSearch(location.search)
  )
  // The address as the router holds it, for the timer below to compare with.
  const here = useRef('')
  useEffect(() => {
    here.current = `${location.pathname}${location.search}${location.hash}`
  }, [location.pathname, location.search, location.hash])
  const page = queenPage(lang, asked)
  const outside = queenPublicPage(lang)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const openLogin = useSetAtom(openLoginAtom)

  // One door for every way a card opens or closes: the sheet and the address
  // move together, and the address is replaced, so Back leaves the game
  // rather than stepping through every card looked at.
  const openCard = useCallback(
    (next: OpenCard | null) => {
      setCard(next)
      const path = here.current.split('?')[0].split('#')[0]
      const search = here.current.includes('?')
        ? `?${here.current.split('?')[1].split('#')[0]}`
        : ''
      const to = `${path}${searchWithCard(search, next)}`
      if (to !== here.current) navigate(to, { replace: true })
    },
    [navigate]
  )

  // The address -> the sheet: a shared link, Back, a bookmark. Adjusted while
  // rendering, not in an effect, so the sheet never paints one frame behind
  // the address (react.dev, "adjusting some state when a prop changes").
  const [seenSearch, setSeenSearch] = useState(location.search)
  if (seenSearch !== location.search) {
    setSeenSearch(location.search)
    const fromAddress = cardFromSearch(location.search)
    setCard(open =>
      fromAddress?.number === open?.number &&
      (fromAddress?.repo || open?.repo) === open?.repo
        ? open
        : fromAddress
    )
  }

  // The board asks: {v:1, type:'t27-app', kind:'open-card', repo, number}.
  // Only from the frame this page holds, on this origin (SAME_ORIGIN_ONLY).
  useEffect(() => {
    if (IS_EMBED) return
    const on = (event: MessageEvent) => {
      const same =
        event.origin === window.location.origin &&
        !!frameRef.current &&
        event.source === frameRef.current.contentWindow
      const asked = cardFromMessage(event.data, same)
      if (asked) openCard(asked)
    }
    window.addEventListener('message', on)
    return () => window.removeEventListener('message', on)
  }, [openCard])

  // Until the board posts `open-card`, its cards are anchors to their GitHub
  // issues. The frame is this origin's, so a tap on one is caught before the
  // browser follows it and opens the conversation instead; a modified click
  // (new tab, new window) still goes to GitHub, and so does the sheet's own
  // small GitHub link.
  const catchCardTaps = useCallback(() => {
    let doc: Document | null | undefined
    try {
      doc = frameRef.current?.contentDocument
    } catch {
      return
    }
    // A frame that is not a page we can listen on (cross-origin, a stub)
    // simply keeps its links; the board's own message still opens cards.
    if (typeof doc?.addEventListener !== 'function') return
    doc.addEventListener(
      'click',
      (e: MouseEvent) => {
        if (e.defaultPrevented || e.button !== 0) return
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        const a = (e.target as Element | null)?.closest?.('a[href]')
        const asked = a ? cardFromHref((a as HTMLAnchorElement).href) : null
        if (!asked) return
        e.preventDefault()
        e.stopPropagation()
        openCard(asked)
      },
      true
    )
  }, [openCard])

  // The framed game asks who the visitor is. The answer is a 300 s game token
  // minted from this app's credential, never the credential itself, and only
  // to this frame on https://t27.ai (lib/hive.ts answerIdentityRequests).
  // Only where this app's own session is trusted: top level, or framed by this
  // app or Telegram. Framed by a t27.ai page, the session and Telegram's
  // launch data are already a guest's (framedSession.ts, telegram.ts), and
  // that page shares the origin of the game frame answered here, so it could
  // ask through that frame and skip the bridge's consent.
  //
  // Only while the frame still holds the Queen this page pointed it at. The
  // frame's window survives navigation, so a link inside it to any other
  // t27.ai page (twelve GitHub Pages sites share that origin) would inherit
  // the answer. The Queen changes views by hash and never reloads itself, so
  // a second `load` means another document: from then on nothing is
  // answered, until this page sets the address again. A page loaded there can
  // still ask before its own `load` fires; that window stays open.
  //
  // A signed-out game asks for sign-in with {v:1, type:'t27-app',
  // kind:'sign-in'}; the login modal opens here and the Hive stays.
  const loads = useRef(0)
  useLayoutEffect(() => {
    loads.current = 0
  }, [page])
  useEffect(() => {
    if (IS_EMBED || !sessionTrustedIn(window as unknown as FramedWindow)) {
      return
    }
    return answerIdentityRequests({
      win: window,
      frame: () =>
        loads.current <= 1 ? frameRef.current?.contentWindow : null,
      credential: () => ({
        initData: getInitData(),
        accessToken: getAppAccessToken(), // secret-guard-ok: runtime session value, never a literal credential
      }),
      apiBase: API_BASE,
      // The board asked for a sign-in, so the modal says so rather than
      // offering video renders to somebody looking at their clients.
      onSignIn: () => openLogin('board'),
      ownOrigin: window.location.origin,
    })
  }, [openLogin])

  // The frame -> the address, and "did the board draw anything". The frame is
  // this origin's, so both are plain reads; a frame holding somebody else's
  // document (the browser's error page) throws, and that counts as not drawn.
  useEffect(() => {
    if (IS_EMBED) return
    let seen: string | null = null
    const id = window.setInterval(() => {
      const frame = frameRef.current
      if (!frame || loadedAt.current === null) return
      let hash = ''
      let drawn = false
      try {
        hash = frame.contentWindow?.location.hash ?? ''
        const board = frame.contentDocument?.getElementById('root')
        drawn = (board?.childElementCount ?? 0) > 0
      } catch {
        // Not this origin's document: nothing to follow, nothing drawn.
      }
      setStuck(!drawn && Date.now() - loadedAt.current > BOARD_GRACE_MS)
      if (hash === seen) return
      seen = hash
      const path = gamePathFor(hash)
      const to = path && keepCard(path, here.current)
      if (to && to !== here.current) navigate(to, { replace: true })
    }, WATCH_MS)
    return () => window.clearInterval(id)
  }, [navigate])

  // The address -> the frame: Back, a link to /game/specs, the tab bar. The
  // frame's fragment is replaced, not assigned, so Back steps the app.
  useEffect(() => {
    const win = frameRef.current?.contentWindow
    if (IS_EMBED || !win || loadedAt.current === null) return
    const want = frameHashFor(location.pathname, withoutCard(location.search))
    try {
      if (gamePathFor(win.location.hash) === gamePathFor(want)) return
      win.location.replace(`${win.location.href.split('#')[0]}${want}`)
    } catch {
      // Not this origin's document: it has no view to move.
    }
  }, [location.pathname, location.search])

  // Inside the game's TRI frame the hive IS the page around this frame.
  // Framing it again would nest game > app > game > app without end, so no
  // path that reaches /hive there (the welcome exit, a start_param, a typed
  // link) gets a frame.
  if (IS_EMBED) {
    return (
      <div className="hive-page">
        <div className="hive-stage">
          <p className="hive-loading hive-inside-game">
            {t('hive.insideGame')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="hive-page">
      <div className="hive-stage">
        {(!loaded || stuck) && (
          <p className="hive-loading">
            <span>{t(stuck ? 'hive.stuck' : 'hive.loading')}</span>
            <a
              className="hive-out"
              href={outside}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('hive.openOutside')}
            </a>
          </p>
        )}
        {/*
         * NO CORNER LINK OVER THE BOARD (owner, 2026-10-01: "remove the
         * button, it covers the header"). It was there because `onLoad` is
         * not proof of a page: a refused frame loads the browser's error
         * document and the tab went black (25.09.2026). The frame is this
         * origin's now, so the page can look: the way out comes back when
         * the board has not drawn itself BOARD_GRACE_MS after the load.
         */}
        <iframe
          ref={frameRef}
          className={`hive-frame${loaded ? ' hive-frame--ready' : ''}`}
          src={page}
          title={t('hive.frameTitle')}
          allow="fullscreen; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => {
            loads.current += 1
            loadedAt.current = Date.now()
            setLoaded(true)
            catchCardTaps()
          }}
        />
        {card && (
          <CardChat
            key={card.number}
            card={card}
            onClose={() => openCard(null)}
            onResolved={setCard}
          />
        )}
      </div>
    </div>
  )
}
