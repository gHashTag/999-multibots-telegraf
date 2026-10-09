import { useState } from 'react'
import { BottomSheet } from '@/components/BottomSheet/BottomSheet'
import { useLanguage } from '@/hooks/useLanguage'
import { uploadToS3 } from '@/lib/s3Upload'
import './ScenePhotoSheet.css'

/**
 * THE PHOTO OF ONE SCENE, PICKED BY A TAP ON ITS TILE (crm-story-reel v31).
 *
 * Owner, 2026-10-09: "replacing a photo should be a tap on the photo, which
 * opens a photo viewer". The scene's photo large on top, her profile photos
 * below to choose from, an upload of any other, and the default back.
 */
export function ScenePhotoSheet({
  scene,
  current,
  picked,
  candidates,
  name,
  busy = false,
  why = '',
  onPick,
  onClose,
}: {
  /** 0-based scene index; null -- closed. */
  scene: number | null
  current: string | null
  /** The seller chose this scene's photo herself. */
  picked: boolean
  /** Her photos to choose from, newest first. */
  candidates: readonly string[]
  /** Part of an uploaded file's name, so two clients' photos never meet. */
  name: string
  busy?: boolean
  why?: string
  /** A photo for this scene; '' -- back to the default. */
  onPick: (url: string) => void
  onClose: () => void
}) {
  const { t } = useLanguage()
  const [uploading, setUploading] = useState(false)
  const [failed, setFailed] = useState(false)
  // A signed link expires: a photo that does not load shows the empty mark,
  // not the browser's broken-picture icon.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const markBroken = (url: string) =>
    setBroken(prev => (prev.has(url) ? prev : new Set(prev).add(url)))
  const open = scene !== null
  const n = (scene ?? 0) + 1

  const upload = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setFailed(false)
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const url = await uploadToS3(
      file,
      `story-scene-${name}-${n}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    )
    setUploading(false)
    if (url) onPick(url)
    else setFailed(true)
  }

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title={t('crm.client.story.scene.title', { n })}
      height="full"
    >
      <div className="scene-photo" data-testid="scene-photo-sheet">
        <div className="scene-photo__big">
          {current && !broken.has(current) ? (
            <img
              src={current}
              alt=""
              draggable={false}
              onError={() => markBroken(current)}
            />
          ) : (
            <span aria-hidden>◎</span>
          )}
          <span className="scene-photo__tag">
            {picked
              ? t('crm.client.story.scene.picked')
              : t('crm.client.story.scene.default')}
          </span>
        </div>
        <p className="scene-photo__hint">{t('crm.client.story.scene.pick')}</p>
        <ul className="scene-photo__grid" role="listbox">
          {candidates.map((url, i) => (
            <li key={url}>
              <button
                type="button"
                role="option"
                aria-selected={url === current}
                aria-label={t('crm.client.story.scene.option', { n: i + 1 })}
                className="scene-photo__opt"
                data-testid={`scene-photo-option-${i}`}
                disabled={busy || uploading}
                onClick={() => onPick(url)}
              >
                {broken.has(url) ? (
                  <span aria-hidden>◎</span>
                ) : (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    onError={() => markBroken(url)}
                  />
                )}
              </button>
            </li>
          ))}
          <li>
            <label
              className="scene-photo__opt scene-photo__upload"
              aria-disabled={busy || uploading}
            >
              <input
                type="file"
                accept="image/*"
                hidden
                disabled={busy || uploading}
                data-testid="scene-photo-upload"
                onChange={e => {
                  void upload(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
              <span aria-hidden>📷</span>
              <small>
                {uploading
                  ? t('crm.client.story.photo.uploading')
                  : t('crm.client.story.scene.upload')}
              </small>
            </label>
          </li>
        </ul>
        {picked ? (
          <button
            type="button"
            className="scene-photo__reset"
            data-testid="scene-photo-default"
            disabled={busy || uploading}
            onClick={() => onPick('')}
          >
            {t('crm.client.story.scene.back')}
          </button>
        ) : null}
        {failed || why ? (
          <p className="story-reel__why">
            {why || t('crm.client.story.photo.failed')}
          </p>
        ) : null}
      </div>
    </BottomSheet>
  )
}
