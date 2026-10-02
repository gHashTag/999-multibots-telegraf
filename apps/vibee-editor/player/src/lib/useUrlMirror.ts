import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'

/**
 * KEEP A SCREEN'S OWN STATE IN ITS ADDRESS, SO BACK RETURNS TO IT.
 *
 * /crm and /crm/:id are sibling routes: opening a contact unmounts the list,
 * and Back mounted it fresh -- the search and the filter chip were gone, and
 * the owner typed them again for every person (CRM mobile loop, tick 4).
 * Pipedrive and HubSpot both return to the list exactly as it was left.
 *
 * The values stay ordinary state (a controlled input fed through a router
 * transition drops letters on a phone); this writes them to the query string
 * with `replace` after each change, so history holds one entry for the screen,
 * not one per keystroke. An empty value removes its key. Nothing is written
 * when the address already says the same thing, so this never loops.
 */
export function useUrlMirror(values: Record<string, string>): void {
  const [params, setParams] = useSearchParams()
  const wanted = JSON.stringify(values)
  useEffect(() => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(
      JSON.parse(wanted) as Record<string, string>
    )) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true })
    }
  }, [wanted, params, setParams])
}
