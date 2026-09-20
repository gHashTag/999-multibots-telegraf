import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * THE CRM CONSOLE HAD NO DOOR.
 *
 * Measured 2026-09-20: `/crm` is registered in App.tsx and the eleven CRM read
 * tools answer with real data on production -- and `grep -rn 'to="/crm'` over
 * the whole player returns exactly ONE hit: a breadcrumb inside
 * `CrmClient.tsx`, on a page only reachable from `/crm` itself. The only link
 * into the console was inside the console.
 *
 * It surfaced the way these things do: the owner asked for the launch tasks to
 * be put "into the CRM", they were, and he had no way to open the screen that
 * holds them.
 *
 * ── WHY A CARD AND NOT A SEVENTH TAB ───────────────────────────────────────
 *
 * `primaryNavigation.ts` says the tab row's limit is the TOTAL WIDTH OF THE
 * LABELS at 375 px, not the number of tabs. A seventh label would be a
 * measurement, not an edit, and the console is not something a client opens
 * daily -- it is the seller's back office. It sits with the other own-profile
 * cards, between the header and the tabs, where SOUL and the top-up already
 * live.
 *
 * ── OWN PROFILE ONLY ───────────────────────────────────────────────────────
 *
 * Somebody else's clients are not ours to look at, and the console reads by
 * the viewer's own identity anyway -- so on a stranger's profile this link
 * would promise a screen that answers about the viewer. The caller passes
 * `isOwn`; this renders nothing otherwise.
 */
export interface CrmCardProps {
  isOwn: boolean
}

export function CrmCard({ isOwn }: CrmCardProps) {
  /*
   * Text through the dictionary, never inline: CLAUDE.md makes
   * atoms/language.ts the one home for interface words, and the no-cyrillic
   * gate enforces it by refusing a Russian string that is not a literal in a
   * dictionary. Both halves of that rule caught this file.
   */
  const { t } = useLanguage()
  if (!isOwn) return null
  return (
    <section className="profile-topup" data-testid="profile-crm">
      <h3 className="profile-topup__title">{t('crm.card.title')}</h3>
      <p className="profile-topup__note">{t('crm.card.note')}</p>
      <Link className="profile-topup__pack" to="/crm">
        {t('crm.card.open')}
      </Link>
    </section>
  )
}
