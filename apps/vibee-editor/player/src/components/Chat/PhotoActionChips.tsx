import { useLanguage } from '@/hooks/useLanguage'
import {
  PHOTO_ACTION_IDS,
  photoActionAsk,
  type PhotoActionId,
} from '@/lib/photoActions'
import './PhotoActionChips.css'

/**
 * ONE-TAP PHOTO ACTIONS ABOVE THE INPUT (spec photo-actions.t27). Shown by
 * the chat for the Blogger when there is a photo to act on; a press sends the
 * ask with that photo at once.
 */
export function PhotoActionChips({
  imageAttached,
  last,
  onSend,
  disabled = false,
}: {
  imageAttached: boolean
  last: string | null
  onSend: (ask: string) => void
  disabled?: boolean
}) {
  const { t } = useLanguage()
  return (
    <div
      className="photo-actions"
      role="toolbar"
      aria-label={t('chat.photo.title')}
      data-testid="photo-actions"
    >
      {PHOTO_ACTION_IDS.map((id: PhotoActionId) => (
        <button
          key={id}
          type="button"
          className="photo-actions__btn"
          data-testid={`photo-action-${id}`}
          disabled={disabled}
          onClick={() => {
            const ask = photoActionAsk(id, imageAttached, last)
            if (ask) onSend(ask)
          }}
        >
          {t(`chat.photo.${id}`)}
        </button>
      ))}
    </div>
  )
}
