import { useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { IS_EMBED } from '@/lib/embed'
import {
  appScreenHref,
  boardSignInHref,
  embedSignInNeeded,
  framedByAppBoard,
  guestScreenOf,
  hasCredential,
  subscribeEmbedSignInNeeded,
  type TriScreenId,
} from '@/lib/embedGuest'

/**
 * Inside the game's TRI frame, a screen that needs a person shows the sign-in
 * panel when this document has no credential or the server refused it
 * (lib/embedGuest.ts). The page is not mounted, so it sends nothing. Outside
 * embed, and on every other route, it renders its children unchanged.
 */
export function EmbedGuestGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const refused = useSyncExternalStore(
    subscribeEmbedSignInNeeded,
    embedSignInNeeded
  )
  const screen = IS_EMBED ? guestScreenOf(pathname) : null
  if (screen && (refused || !hasCredential())) {
    return <EmbedGuestPanel screen={screen} />
  }
  return <>{children}</>
}

/**
 * One panel for every such screen, in the game's language.
 *
 * Inside the board on app.t27.ai the button signs in at the top of this tab
 * and comes back to this screen: the tab's session is this frame's session,
 * so the screen works on return.
 *
 * Anywhere else (the game on t27.ai, the Hive, a Telegram Mini App) the link
 * opens the same screen in the app in a new tab (target _blank). It never
 * replaces the tab there: this frame stays a guest after a sign-in.
 */
export function EmbedGuestPanel({ screen }: { screen: TriScreenId }) {
  const { t } = useLanguage()
  const inBoard = typeof window !== 'undefined' && framedByAppBoard(window)
  return (
    <section
      className="embed-guest"
      data-embed-guest={screen}
      aria-labelledby="embed-guest-title"
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h2 id="embed-guest-title" className="embed-guest__title">
        {t('embed.guest.title')}
      </h2>
      <p className="embed-guest__body">
        {t(inBoard ? 'embed.guest.bodyBoard' : 'embed.guest.body')}
      </p>
      <a
        href={inBoard ? boardSignInHref(screen) : appScreenHref(screen)}
        target={inBoard ? '_top' : '_blank'}
        rel="noopener"
        className="embed-guest__cta"
      >
        {t(inBoard ? 'embed.guest.signIn' : 'embed.guest.open')}
      </a>
    </section>
  )
}
