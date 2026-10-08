import { useState } from 'react'
import * as SPEC from '@/spec/plan-reel.gen'
import {
  PREVIEW_CARD_PX,
  pictureOf,
  previewHeight,
  previewSrc,
} from '@/lib/planReel'
import './ReelPreview.css'

/**
 * ONE REEL, AS A PICTURE (plan-reel.t27): the reel's own frame, 9:16, muted,
 * never playing by itself; a press opens the reel. Where the server kept its
 * poster (v3: that frame, drawn once), the card shows the poster and never
 * fetches the video; where none is kept, or the poster fails to load, the
 * browser draws the frame from the video's metadata.
 */
export function ReelPreview({
  url,
  poster,
  label,
  width = PREVIEW_CARD_PX,
}: {
  url: string
  /** The server's poster of this reel, when one is kept. */
  poster?: string | null
  /** What a screen reader says, and the press's title: "watch: <topic>". */
  label: string
  width?: number
}) {
  // A poster that will not load gives way to the frame, never a broken icon.
  const [broken, setBroken] = useState(false)
  return (
    <a
      className="reel-preview"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={label}
      title={label}
      style={{ width, height: previewHeight(width) }}
    >
      {pictureOf(poster) === SPEC.PICTURE_POSTER && !broken ? (
        <img
          className="reel-preview__frame"
          src={poster as string}
          alt=""
          loading="lazy"
          decoding="async"
          aria-hidden="true"
          onError={() => setBroken(true)}
        />
      ) : (
        <video
          className="reel-preview__frame"
          src={previewSrc(url)}
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          tabIndex={-1}
        />
      )}
      <span className="reel-preview__play" aria-hidden="true">
        ▶
      </span>
    </a>
  )
}
