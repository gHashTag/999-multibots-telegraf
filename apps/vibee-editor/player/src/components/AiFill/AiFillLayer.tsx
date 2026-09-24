import { useCallback, useEffect, useRef, useState } from 'react'
import { useLanguage } from '@/hooks/useLanguage'
import {
  describeField,
  isFillable,
  requestFill,
  setFieldValue,
} from '@/lib/aiFill'
import './AiFillLayer.css'

type Field = HTMLInputElement | HTMLTextAreaElement

/**
 * THE "✨ AI" BUTTON BESIDE WHICHEVER FIELD IS BEING TYPED INTO.
 *
 * One layer for the whole app, mounted once in App.tsx: it follows focus,
 * and when the focused field qualifies (lib/aiFill.ts isFillable) it puts a
 * small button inside the field's top-right corner. A press writes the
 * field's text -- from scratch when it is empty, improving what is there
 * when it is not -- and for a few seconds offers "undo", because a press
 * that replaced what the person wrote must be one press away from undone.
 *
 * The button takes `mousedown` with preventDefault so the field keeps its
 * focus (and the phone keeps its keyboard) while the text is written.
 */
export function AiFillLayer() {
  const { t, lang } = useLanguage()
  const [field, setField] = useState<Field | null>(null)
  const [box, setBox] = useState<DOMRect | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ el: Field; value: string } | null>(null)
  const hideTimer = useRef<number | null>(null)
  const undoTimer = useRef<number | null>(null)

  const place = useCallback((el: Field | null) => {
    setBox(el && el.isConnected ? el.getBoundingClientRect() : null)
  }, [])

  useEffect(() => {
    const onFocus = (e: FocusEvent) => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current)
      const el = e.target
      if (isFillable(el)) {
        setField(el as Field)
        setError(null)
        place(el as Field)
      } else {
        setField(null)
      }
    }
    const onBlur = () => {
      // Late, so a press on the button itself is not lost to the blur.
      hideTimer.current = window.setTimeout(() => setField(null), 200)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
    }
  }, [place])

  useEffect(() => {
    if (!field) return
    const follow = () => place(field)
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    const ro =
      typeof ResizeObserver === 'function' ? new ResizeObserver(follow) : null
    ro?.observe(field)
    return () => {
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      ro?.disconnect()
    }
  }, [field, place])

  const fill = async () => {
    if (!field || busy) return
    const el = field
    setBusy(true)
    setError(null)
    const before = el.value
    const r = await requestFill(describeField(el, lang === 'en' ? 'en' : 'ru'))
    setBusy(false)
    if ('error' in r) {
      setError(t('aiFill.failed'))
      return
    }
    setFieldValue(el, r.text)
    el.focus()
    setUndo({ el, value: before })
    if (undoTimer.current) window.clearTimeout(undoTimer.current)
    undoTimer.current = window.setTimeout(() => setUndo(null), 8000)
  }

  const revert = () => {
    if (!undo) return
    setFieldValue(undo.el, undo.value)
    undo.el.focus()
    setUndo(null)
  }

  if (!field || !box) return null
  const showUndo = undo && undo.el === field

  return (
    <div
      className="ai-fill"
      data-ai="off"
      style={{
        top: Math.max(0, box.top + 4),
        left: Math.max(0, box.right - 6),
      }}
    >
      {showUndo ? (
        <button
          type="button"
          className="ai-fill__btn ai-fill__btn--undo"
          onMouseDown={e => e.preventDefault()}
          onClick={revert}
        >
          ↶ {t('aiFill.undo')}
        </button>
      ) : null}
      <button
        type="button"
        className="ai-fill__btn"
        aria-label={t('aiFill.button')}
        title={error ?? t('aiFill.hint')}
        disabled={busy}
        onMouseDown={e => e.preventDefault()}
        onClick={() => void fill()}
      >
        {busy ? '…' : '✨'} {busy ? t('aiFill.busy') : t('aiFill.short')}
      </button>
      {error ? <span className="ai-fill__error">{error}</span> : null}
    </div>
  )
}
