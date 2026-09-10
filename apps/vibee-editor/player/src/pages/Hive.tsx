import { useState } from 'react'
import { Header } from '@/components/Header'
import { useLanguage } from '@/hooks/useLanguage'
import { QUEEN_PAGE } from '@/lib/hive'
import './Hive.css'

/**
 * THE HIVE -- THE GAME, AS A TAB. THE WHOLE PAGE, NOT PIECES OF IT.
 *
 * Owner, 2026-09-07: "the game is https://t27.ai/#/queen", "add the game as
 * another tab with all its sub-tabs". Owner, 2026-09-10, after seeing the
 * first version, which re-drew her board piece by piece from the same data:
 * show the whole page, not parts of it; only adapt it for phones.
 *
 * So this tab is her page. One `<iframe>` over the full height between the
 * app header and the tab bar, pointed at t27.ai/#/queen. Her comb, her specs,
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
 * WHAT IS BELOW THE FRAME
 *
 * One line: a link that opens the same page in the browser proper. A frame
 * inside Telegram's web view is two sandboxes deep, and a phone with WebGL
 * switched off or a blocked third-party frame shows a dark rectangle and no
 * explanation. The link is the explanation.
 */
export default function HivePage() {
  const { t } = useLanguage()
  const [loaded, setLoaded] = useState(false)

  return (
    <div className="hive-page">
      <Header />
      <div className="hive-stage">
        {!loaded && <p className="hive-loading">{t('hive.loading')}</p>}
        <iframe
          className={`hive-frame${loaded ? ' hive-frame--ready' : ''}`}
          src={QUEEN_PAGE}
          title={t('hive.frameTitle')}
          allow="fullscreen; clipboard-write"
          referrerPolicy="strict-origin-when-cross-origin"
          onLoad={() => setLoaded(true)}
        />
      </div>
      <a
        className="hive-out"
        href={QUEEN_PAGE}
        target="_blank"
        rel="noreferrer noopener"
      >
        {t('hive.openOutside')}
      </a>
    </div>
  )
}
