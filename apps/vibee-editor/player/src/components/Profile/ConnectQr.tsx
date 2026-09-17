import { useMemo } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import { QUIET_ZONE, qrModules, qrPath } from './qrMatrix'
import './ConnectQr.css'

/**
 * THE QR SCREEN: THE WAY IN THAT WAITS FOR NO CODE.
 *
 * The owner spent two days on the code screen: Telegram said "sent" every time
 * and no message ever came. With a QR code nothing has to arrive. The person
 * scans it from the Telegram they are ALREADY signed in to (Settings > Devices
 * > Link Desktop Device), confirms on Telegram's own screen, and the account
 * that held the camera is the account that connects.
 *
 * ── WHAT THIS SCREEN HAS TO SAY OUT LOUD ───────────────────────────────────
 *
 * A QR code cannot be scanned by the phone it is displayed on. Somebody who
 * opens this inside the Mini App on their only phone would otherwise stare at
 * a code with nothing to point at it. So the screen says where to open it
 * instead -- a computer, or the bot in Telegram Desktop -- before they find
 * out the hard way.
 *
 * The code is always dark on white, whatever the theme: scanners look for
 * that contrast, and a green-on-black code is a picture of a QR code.
 */

export interface ConnectQrProps {
  /** The `tg://login?token=...` link; changes about every thirty seconds. */
  url: string
  error: string | null
  onBack: () => void
  /**
   * Android opens a `tg://login` link with its own confirmation, so the same
   * phone can approve. iOS answers that link with "go and scan it", which is
   * a dead end on one device -- so the button is not offered there.
   */
  canOpenHere: boolean
}

export function ConnectQr(props: ConnectQrProps) {
  const { t } = useLanguage()
  const { size, path } = useMemo(() => {
    const modules = qrModules(props.url)
    return { size: modules.length + QUIET_ZONE * 2, path: qrPath(modules) }
  }, [props.url])

  return (
    <section className="tg-qr">
      <header className="tg-qr__top">
        <button type="button" className="tg-qr__back" onClick={props.onBack}>
          <span aria-hidden="true">←</span> {t('connect.back')}
        </button>
      </header>

      <h3 className="tg-qr__title">{t('connect.qr.title')}</h3>

      <div className="tg-qr__code">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={t('connect.qr.alt')}
          shapeRendering="crispEdges"
        >
          <rect width={size} height={size} fill="#fff" />
          <path d={path} fill="#000" />
        </svg>
      </div>

      <ol className="tg-qr__steps">
        <li>{t('connect.qr.step1')}</li>
        <li>{t('connect.qr.step2')}</li>
        <li>{t('connect.qr.step3')}</li>
      </ol>

      <p className="tg-qr__note">{t('connect.qr.secondScreen')}</p>

      {props.canOpenHere && (
        <a className="tg-qr__here" href={props.url}>
          {t('connect.qr.openHere')}
        </a>
      )}

      {props.error ? (
        <p className="tg-qr__error">{props.error}</p>
      ) : (
        <p className="tg-qr__waiting">{t('connect.qr.waiting')}</p>
      )}
    </section>
  )
}
