import { useLanguage } from '@/hooks/useLanguage'
import { MyStoryWidget } from '@/components/Story/MyStoryWidget'

/**
 * MY REELS -- her own page (t.me/<bot>?start=app_story). The content is the
 * shared widget; the chat with the agent shows the same one.
 */
export default function StoryPage() {
  const { t } = useLanguage()
  return (
    <div className="crm crm-client story">
      <header className="crm__top">
        <h2>{t('story.title')}</h2>
      </header>
      <p className="crm__counts">{t('story.lead')}</p>
      <MyStoryWidget />
    </div>
  )
}
