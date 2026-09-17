import { Header } from '@/components/Header'
import { PairWithApp } from '@/components/Profile/PairWithApp'
import '@/components/Profile/Profile.css'

/**
 * THE SIGN-IN CODE, ON AN ADDRESS THE PAYWALL DOES NOT GUARD.
 *
 * `/app` in the bot promises "press the button -- a window opens with your
 * code". That button carried start parameter `pair`, which pointed at
 * `/profile?tab=agent` -- the tab where `PairWithApp` lives.
 *
 * ── WHY THAT ADDRESS STOPPED WORKING, 2026-09-09 ───────────────────────────
 *
 * The welcome road landed on the profile that day (#2304) and was hardened on
 * 09-10 to remove its "later" button (#2320). `pages/Profile.tsx` now returns
 * `<WelcomeOnboarding/>` early, ABOVE `<ProfileTabs/>` -- so for anyone the
 * road applies to, the tab holding the code is never mounted at all. The road's
 * third card is the 10 000-Star club price, and `welcomeSteps.ts` puts a person
 * without a club at its FIRST card, four presses away.
 *
 * The result is a door that reports itself as working. The bot sends the code
 * link, the mini app opens, the price appears, and nothing anywhere logs an
 * error -- measured 2026-09-17 on a person who had just paid for a
 * subscription and could not sign in on her phone.
 *
 * ── WHY A ROUTE AND NOT A HOLE IN THE GATE ─────────────────────────────────
 *
 * `profileGate.ts` is deliberately untouched by this page. "Until paid, the
 * profile does not open" is the owner's rule, stated three times and pinned by
 * `pages/profileGate.test.ts`; relaxing it to let a code through would trade a
 * broken door for a broken decision.
 *
 * It is also unnecessary. The server has never gated this: the only guards on
 * `POST /api/auth/pair/start` are the Telegram signature and the sign-out
 * cutoff (`render/session-routes.ts`) -- no club check, no payment check, no
 * `club_period` reference in the file. The paywall in front of the code was
 * never an authorization boundary, only a routing accident. This page removes
 * the accident and leaves the boundary where it is.
 *
 * ── SAFE TO MOUNT ALONE ────────────────────────────────────────────────────
 *
 * `PairWithApp` reads exactly two things -- `canAuthorizeRequestsAtom` and
 * `isTelegram()`. It never touches `userAtom` or `myProfileAtom`, so this page
 * cannot white-screen for want of a loaded profile, which is the usual way a
 * widget lifted out of its screen fails.
 */
export default function PairPage() {
  return (
    <>
      <Header />
      <div className="profile-page">
        <div className="profile-page__container">
          <PairWithApp />
        </div>
      </div>
    </>
  )
}
