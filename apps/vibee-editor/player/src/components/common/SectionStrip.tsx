import { useEffect, useRef, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { revealInStrip } from '@/components/Profile/revealInStrip'
import './SectionStrip.css'

/**
 * ONE ROW OF SECTIONS, FOR EVERY SCREEN THAT HAS SECTIONS.
 *
 * Owner, 2026-09-23, looking at the Leads screen with its own tab row sitting
 * directly on top of the app's tab bar: "what are these tabs inside a tab?
 * put this in order, the structure has to be logical, the logic must not be
 * written twice, and the aesthetics have to follow the design."
 *
 * A census of the app that day found twenty navigation surfaces, six of them
 * dead code, and:
 *  - two of them at the bottom of the same phone screen (/search),
 *  - "which one is active" computed four different ways,
 *  - "scroll the active one into view" written three times, one of those
 *    looking for a class the markup does not write,
 *  - the same list of items rendered twice in one file, once per breakpoint,
 *  - eight border radii, five label sizes and five different ways of saying
 *    "this one is selected", in an app with one accent colour.
 *
 * THE RULE THIS COMPONENT EXISTS TO HOLD:
 *   the bottom of the screen belongs to the app's destinations, and nothing
 *   else. A screen's own sections live in one row at the TOP, and every such
 *   row is this component.
 *
 * The look is the board's, which the owner picked as the single language:
 * mono capitals, square corners, a green border and green text when chosen.
 */

export interface Section {
  id: string
  label: string
  icon?: ReactNode
  /** Shown after the label. `null` means "no number to show", not zero. */
  count?: number | null
}

export interface SectionStripProps {
  sections: Section[]
  active: string
  onPick: (id: string) => void
  /** What this row is a row of, for people who cannot see it. */
  label: string
}

export function SectionStrip({
  sections,
  active,
  onPick,
  label,
}: SectionStripProps) {
  const strip = useRef<HTMLDivElement>(null)

  /*
   * The chosen section is brought into sight, and ONLY the strip moves.
   * `scrollIntoView` moves every scrolling ancestor with it, which on a
   * profile opened at ?tab= jumped the whole page down (measured at 390px);
   * revealInStrip scrolls this one box instead. The other two copies of this
   * effect in the app still use scrollIntoView -- they come here next.
   */
  useEffect(() => {
    const box = strip.current
    const chosen = box?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (box && chosen) revealInStrip(box, chosen)
  }, [active, sections.length])

  return (
    <div ref={strip} className="section-strip" role="group" aria-label={label}>
      {sections.map(section => {
        const on = section.id === active
        return (
          <button
            key={section.id}
            type="button"
            className={`section-strip__item${on ? ' section-strip__item--on' : ''}`}
            aria-pressed={on}
            onClick={() => onPick(section.id)}
          >
            {section.icon ? (
              <span className="section-strip__icon" aria-hidden="true">
                {section.icon}
              </span>
            ) : null}
            <span className="section-strip__label">{section.label}</span>
            {section.count == null ? null : (
              <span className="section-strip__count">{section.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * THE CHOSEN SECTION LIVES IN THE ADDRESS.
 *
 * Two conventions were in use: the profile read `?tab=` once into local state
 * and never wrote it back (so a chosen section could not be linked to, and
 * Back did not undo it), and /generate used a `:tab` path segment with its own
 * allow-list. This is the one reader: it validates against the ids it is
 * given, falls back to the first, and writes the choice back with `replace`,
 * so a section is a link and Back leaves the screen rather than walking every
 * section visited on it.
 */
export function useSectionTab(
  ids: string[],
  fallback = ids[0]
): [string, (id: string) => void] {
  const [params, setParams] = useSearchParams()
  const asked = params.get('tab')
  const active = asked && ids.includes(asked) ? asked : fallback

  const pick = (id: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', id)
    setParams(next, { replace: true })
  }

  return [active, pick]
}
