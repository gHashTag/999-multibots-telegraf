import { PREVIEW_CARD_PX, previewHeight, previewSrc } from '@/lib/planReel'
import './ReelPreview.css'

/**
 * ONE REEL, AS A PICTURE (plan-reel.t27): the reel's own frame, 9:16, muted,
 * never playing by itself; a press opens the reel. No poster is stored for a
 * story reel, so the browser draws the frame from the video's metadata.
 */
export function ReelPreview({
  url,
  label,
  width = PREVIEW_CARD_PX,
}: {
  url: string
  /** What a screen reader says, and the press's title: "watch: <topic>". */
  label: string
  width?: number
}) {
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
      <video
        className="reel-preview__frame"
        src={previewSrc(url)}
        muted
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
      />
      <span className="reel-preview__play" aria-hidden="true">
        ▶
      </span>
    </a>
  )
}
