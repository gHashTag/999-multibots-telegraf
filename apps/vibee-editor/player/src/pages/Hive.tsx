import { useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { queenPage } from '@/lib/hive'
import { IS_EMBED } from '@/lib/embed'
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
 * rectangle (WebGL off, third-party frame blocked), but it lives in the
 * loading placeholder now: visible until the frame reports `load`, gone after.
 */
export default function HivePage() {
  const { lang, t } = useLanguage()
  const [loaded, setLoaded] = useState(false)
  const page = queenPage(lang)

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
        {!loaded && (
          <p className="hive-loading">
            <span>{t('hive.loading')}</span>
            <a
              className="hive-out"
              href={page}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('hive.openOutside')}
            </a>
          </p>
        )}
        <iframe
          className={`hive-frame${loaded ? ' hive-frame--ready' : ''}`}
          src={page}
          title={t('hive.frameTitle')}
          allow="fullscreen; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
    </div>
  )
}
