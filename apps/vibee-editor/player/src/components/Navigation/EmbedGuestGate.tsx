import { useSyncExternalStore, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'
import { IS_EMBED } from '@/lib/embed'
import {
  appScreenHref,
  embedSignInNeeded,
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
 * One panel for every such screen, in the game's language. The link opens the
 * same screen in the app in a new tab (target _blank), where the person can
 * sign in. It never replaces the tab (no _top): this frame stays a guest after
 * a sign-in, and the tab may be the Hive or a Telegram Mini App.
 */
export function EmbedGuestPanel({ screen }: { screen: TriScreenId }) {
  const { t } = useLanguage()
  return (
    <section
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
      <h2 id="embed-guest-title" style={{ margin: 0, fontSize: 18 }}>
        {t('embed.guest.title')}
      </h2>
      <p
        style={{
          margin: 0,
          maxWidth: 420,
          opacity: 0.75,
          fontSize: 14,
          lineHeight: 1.5,
        }}
      >
        {t('embed.guest.body')}
      </p>
      <a
        href={appScreenHref(screen)}
        target="_blank"
        rel="noopener"
        style={{
          marginTop: 8,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          padding: '0 20px',
          borderRadius: 10,
          background: '#2f6b3f',
          color: '#fff',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        {t('embed.guest.open')}
      </a>
    </section>
  )
}
