import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  // jsdom has no matchMedia: there, no query matches (a wide screen).
  const [matches, setMatches] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia?.(query).matches ?? false
    }
    return false
  })

  useEffect(() => {
    const mediaQuery = window.matchMedia?.(query)
    if (!mediaQuery) return
    setMatches(mediaQuery.matches)

    const handler = (event: MediaQueryListEvent) => {
      setMatches(event.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

// Convenience hooks for common breakpoints
export function useIsMobile(): boolean {
  return !useMediaQuery('(min-width: 1024px)')
}

export function useIsTablet(): boolean {
  // Must call both hooks unconditionally - can't short-circuit
  const isAtLeast768 = useMediaQuery('(min-width: 768px)')
  const isAtLeast1024 = useMediaQuery('(min-width: 1024px)')
  return isAtLeast768 && !isAtLeast1024
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)')
}
