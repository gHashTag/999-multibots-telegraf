import { useEffect } from 'react'
import { useSetAtom } from 'jotai'
import { showLoginModalAtom } from '@/atoms'
import { hasLiveAppSession, refreshAppSession } from '@/lib/appSession'
import { sessionStore } from '@/lib/framedSession'
import { returnWhenSignedIn } from '@/lib/returnTarget'

/**
 * Arrived from the game's sign-in chip (lib/returnTarget.ts): a tab that is
 * already signed in goes straight back to the game, an expired session is
 * refreshed silently first, and without a session the login modal opens. The
 * widget sign-in then sends the tab back (TelegramLoginButton). Renders
 * nothing, and does nothing when no return is pending.
 */
export function ReturnToGame() {
  const setShowLoginModal = useSetAtom(showLoginModalAtom)

  useEffect(() => {
    let mounted = true
    void returnWhenSignedIn({
      store: sessionStore(),
      live: hasLiveAppSession,
      refresh: refreshAppSession,
      assign: url => window.location.assign(url),
    }).then(outcome => {
      if (mounted && outcome === 'sign-in') setShowLoginModal(true)
    })
    return () => {
      mounted = false
    }
  }, [setShowLoginModal])

  return null
}
