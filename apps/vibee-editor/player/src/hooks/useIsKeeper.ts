import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { clubStatusAtom, loadClubStatusAtom } from '@/atoms/club'

/**
 * IS THIS PERSON A KEEPER? (#2957)
 *
 * The server decides (/api/club/status answers `granted: 'keeper'` for
 * HIVE_KEEPERS, or the platform owner); this only reads the answer. A keeper
 * may open an agent that is still training -- the one real run that the
 * catalogue asks for before `live` has to be made by somebody.
 *
 * `enabled` keeps the question off screens that do not need it: the status
 * is asked once, and only when a trainee is on the table.
 *
 * null = not known yet; false = known not to be a keeper.
 */
export function useIsKeeper(enabled = true): boolean | null {
  const status = useAtomValue(clubStatusAtom)
  const load = useSetAtom(loadClubStatusAtom)
  useEffect(() => {
    if (enabled && status === null) void load()
  }, [enabled, status, load])
  if (!enabled) return false
  return status === null ? null : status.granted === 'keeper'
}
