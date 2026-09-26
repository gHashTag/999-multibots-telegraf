import { useLanguage } from '@/hooks/useLanguage'

/**
 * FIVE PANELS SAYING THE SAME THING IS ONE FACT AND FOUR COPIES.
 *
 * A panel that could not load says so, and that rule is right: rendering
 * zeros for an unreachable server tells the owner their business is dead.
 * But when EVERY panel fails for the SAME reason -- which is what an expired
 * session looks like -- the screen repeats one sentence five times. Measured
 * at 375px: 5 x 91px = 455 pixels of identical text on an 812px phone, more
 * than half the screen, and not one of them says what to do about it.
 *
 * The step was already known and wired to ONE surface: inside the game's
 * frame a 401 swaps the CRM for a sign-in panel (lib/embedGuest.ts). In the
 * ordinary app the same 401 just printed five times.
 *
 * So: one notice, with the reason and the step. The panels stay quiet only
 * when they ALL failed the same way -- one broken panel among working ones
 * still says so in its own place, which is the rule this does not touch.
 */
import { isSignInReason } from './refusalRules'

export function AllRefused({ reason }: { reason: string }) {
  const { t } = useLanguage()
  return (
    <p className="crm__all-refused" role="status">
      {isSignInReason(reason)
        ? t('crm.allRefused.signIn')
        : t('crm.allRefused.server', { reason })}
    </p>
  )
}
