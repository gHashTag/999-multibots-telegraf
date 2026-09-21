/**
 * A TOUCH INSIDE THE PICTURE NEVER REACHES THE PAGE AROUND IT.
 *
 * The stage listened for `pointerdown` to hand the wheel to the person. But
 * the picture is an iframe, and events inside a frame do not bubble out of
 * it into the parent document -- so a tap on the picture, which is the only
 * place anybody taps, never arrived. The glow kept saying the agent was
 * working while the person was already driving. Found from the owner's
 * photo: "touch the screen to take control" over a screen that ignored it.
 *
 * Two ways in, because either can be missing:
 *
 *   1. The frame is the SAME ORIGIN as the app (the app proxies /live/ under
 *      its own address; that is what `canEmbed` checks), so its window can
 *      be listened to directly, in the capture phase, before the page inside
 *      sees the event.
 *   2. Focus. The first press inside a frame moves focus into it, and the
 *      parent window gets `blur` with the frame as its active element. That
 *      works even where the frame's window cannot be reached.
 *
 * The frame's window is replaced on every navigation inside it -- the window
 * reconnects by reloading itself -- so this is attached again on each load.
 */

export interface FrameWindowLike {
  addEventListener(type: string, fn: () => void, capture?: boolean): void
  removeEventListener(type: string, fn: () => void, capture?: boolean): void
}

export interface FrameLike {
  readonly contentWindow: FrameWindowLike | null
}

export interface HostLike extends FrameWindowLike {
  readonly document: { readonly activeElement: unknown }
}

const INSIDE = ['pointerdown', 'keydown'] as const

export function listenForTouchInside(
  frame: FrameLike,
  host: HostLike,
  onTouch: () => void
): () => void {
  const undo: Array<() => void> = []

  let inner: FrameWindowLike | null = null
  try {
    inner = frame.contentWindow
    if (inner) {
      for (const type of INSIDE) inner.addEventListener(type, onTouch, true)
      const reached = inner
      undo.push(() => {
        for (const type of INSIDE)
          reached.removeEventListener(type, onTouch, true)
      })
    }
  } catch {
    /* A frame of another origin: its window cannot be listened to. */
  }

  const onBlur = () => {
    if (host.document.activeElement === frame) onTouch()
  }
  host.addEventListener('blur', onBlur)
  undo.push(() => host.removeEventListener('blur', onBlur))

  return () => {
    for (const fn of undo) {
      try {
        fn()
      } catch {
        /* The frame navigated away; its old window is gone with it. */
      }
    }
  }
}
