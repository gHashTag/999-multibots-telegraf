import { Link } from 'react-router-dom'
import { useLanguage } from '@/hooks/useLanguage'

/**
 * THE STORY PAGE HAD NO DOOR EITHER.
 *
 * Measured 2026-09-29: `/story` is registered in App.tsx and the page answers
 * for anyone whose seller set the template -- and the only link to it in the
 * whole player is the deep link the BOT writes (`?start=app_story`). A person
 * already inside the cabinet had no way in, which is the /crm defect again
 * (CrmCard.tsx, 2026-09-20) one screen over.
 *
 * Same answer, same place: a card with the other own-profile cards, not a
 * seventh tab (the tab row's limit is label width at 375 px,
 * primaryNavigation.ts), and only on the viewer's OWN profile -- on a
 * stranger's page this link would promise a screen that answers about the
 * viewer.
 */
export interface StoryCardProps {
  isOwn: boolean
}

export function StoryCard({ isOwn }: StoryCardProps) {
  const { t } = useLanguage()
  if (!isOwn) return null
  return (
    <section className="profile-topup" data-testid="profile-story">
      <h3 className="profile-topup__title">{t('story.card.title')}</h3>
      <p className="profile-topup__note">{t('story.card.note')}</p>
      <Link className="profile-topup__pack" to="/story">
        {t('story.card.open')}
      </Link>
    </section>
  )
}
