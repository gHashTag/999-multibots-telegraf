/**
 * MAKING THE REMOTE DESKTOP THE SHAPE OF THE DEVICE IN SOMEBODY'S HAND.
 *
 * The photograph that started this: a phone held upright, and on it a
 * landscape desktop drawn as a stamp in a field of black, every letter a
 * third of its proper size. The frame had `aspect-ratio: 16 / 10` hard-coded
 * to match a pod that always ran 1280x800.
 *
 * Shrinking a picture cannot make the text in it readable, so nothing here
 * scales anything. THE LAYOUT DECIDES THE BOX and the pod is asked to be that
 * shape. Which way round that goes matters: if the box followed the pod, the
 * box would change, and the new box would want a new pod shape, and the two
 * would chase each other. The stylesheet gives the frame a definite size on
 * every device; this only measures it and asks.
 */

export interface Box {
  width: number
  height: number
}

/**
 * The pixels to ask the pod for.
 *
 * NOT multiplied by the device pixel ratio. A phone at ratio 3 would ask for
 * a 1170x2340 desktop -- a desktop-sized layout rendered at phone width, text
 * laid out for a big screen and then shown on a small one, which is the
 * original complaint in a more expensive form. Page layout is measured in CSS
 * pixels, so CSS pixels are what we ask for.
 */
export function askFor(box: Box): Box {
  return {
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
  }
}

/**
 * Worth a round trip and a flicker?
 *
 * A phone reports a new height on every scroll, because the address bar
 * slides away. Resizing the desktop for that would restart the stream over
 * and over, which is worse than a few pixels of letterbox. Turning the phone
 * is always worth it; a tenth in either direction is the threshold for the
 * rest.
 */
export function worthRefitting(current: Box | null, next: Box): boolean {
  if (!current) return true
  const turned = current.width >= current.height !== next.width >= next.height
  if (turned) return true
  const off = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 1)
  return (
    off(current.width, next.width) > 0.1 ||
    off(current.height, next.height) > 0.1
  )
}

/** Long enough to outlast a rotation animation, short enough to feel prompt. */
export const REFIT_DEBOUNCE_MS = 500

/** Under this, the stream IS the page and takes the whole window. */
export const PHONE_MAX = 700

export function isPhoneWidth(width: number): boolean {
  return width <= PHONE_MAX
}
