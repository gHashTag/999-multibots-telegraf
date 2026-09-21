import './BrandLoader.css'

/**
 * ONE LOADER, AND IT IS OURS.
 *
 * The owner, 2026-09-21: "why is the loader not our logo?" There were four:
 * the boot screen in index.html (a beige ring), the lazy-page fallback (a
 * bare ring), the Browser tab ("looking for your browser..." in grey text),
 * and the remote window's own loader -- the only one that showed the mark.
 * Every wait in the product now looks like that one: the mark, and the
 * accent ring under it.
 *
 * The same geometry lives in two places that cannot import this: the static
 * boot screen in index.html, which paints before any script, and the remote
 * window's skin (render/src/browser/skin.ts). A test holds all three to the
 * same mark and the same accent.
 */
export const BRAND_MARK_URL = '/t27-mark.svg'

export function BrandLoader({
  label,
  fill = false,
}: {
  /** Said under the ring; omitted when the wait is too short to read. */
  label?: string
  /** Take the whole screen, for a page that has nothing else to show yet. */
  fill?: boolean
}) {
  return (
    <div
      className={fill ? 'brand-loader brand-loader--fill' : 'brand-loader'}
      role="status"
      aria-live="polite"
    >
      <img className="brand-loader__mark" src={BRAND_MARK_URL} alt="" />
      <div className="brand-loader__ring" />
      {label ? <p className="brand-loader__label">{label}</p> : null}
    </div>
  )
}
