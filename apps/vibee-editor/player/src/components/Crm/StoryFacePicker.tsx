import { useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import type { Reached, StoryReady } from '@/lib/crm'
import { uploadToS3 } from '@/lib/s3Upload'

/**
 * The face of the reel: her avatar by default, any photo over it, and the
 * avatar back with one press. The seller's card and her own page both use
 * it; `save` is the tool that keeps the photo, its answer the new state.
 */
export function StoryFacePicker({
  ready,
  name,
  self = false,
  disabled = false,
  save,
  onSaved,
}: {
  ready: StoryReady
  /** Part of the uploaded file's name, so two people's photos never meet. */
  name: string
  /** The client on her own page: the avatar is "yours", not "theirs". */
  self?: boolean
  disabled?: boolean
  save: (url: string) => Promise<Reached<StoryReady>>
  onSaved: (r: Reached<StoryReady>) => void
}) {
  const { t } = useLanguage()
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState('')

  const keep = async (url: string) => {
    const r = await save(url)
    if (r.data && !r.data.why) onSaved(r)
    else setWhy(r.data?.why ?? r.error ?? '')
  }
  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setWhy('')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const url = await uploadToS3(
      file,
      `story-face-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    )
    if (url) await keep(url)
    else setWhy(t('crm.client.story.photo.failed'))
    setBusy(false)
  }
  const onAvatar = async () => {
    setBusy(true)
    setWhy('')
    await keep('')
    setBusy(false)
  }

  return (
    <div className="story-reel__photo" data-testid="story-face-picker">
      <span className="story-reel__label">
        {ready.faceCustom
          ? t('crm.client.story.photo.own')
          : t(
              self
                ? 'crm.client.story.photo.avatarSelf'
                : 'crm.client.story.photo.avatar'
            )}
      </span>
      <label className="story-reel__photo-btn" aria-disabled={busy || disabled}>
        <input
          type="file"
          accept="image/*"
          hidden
          disabled={busy || disabled}
          onChange={e => {
            void onPhoto(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        {busy
          ? t('crm.client.story.photo.uploading')
          : t('crm.client.story.photo.replace')}
      </label>
      {ready.faceCustom ? (
        <button
          type="button"
          className="story-reel__photo-btn"
          disabled={busy || disabled}
          onClick={() => void onAvatar()}
        >
          {t('crm.client.story.photo.reset')}
        </button>
      ) : null}
      {why ? <p className="story-reel__why">{why}</p> : null}
    </div>
  )
}
