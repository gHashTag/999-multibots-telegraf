/**
 * WHICH LEVEL THE SCREENS ARE DRAWN FOR.
 *
 * In order: the level an admin switched to for testing (owner, 2026-10-02:
 * "a button to switch the user level, to test the UI"), then the admin
 * themself, then the highest package the person has paid for, then none --
 * and none draws every screen as it was before levels existed.
 *
 * A level is layout, never permission (packages/vibee-atoms/src/user-level.ts).
 * The switch is offered to admins and dev builds only, and a switched level
 * left in the storage of someone who is neither is ignored.
 */
import { useEffect, useState } from 'react'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import {
  STORAGE_KEYS,
  USER_LEVELS,
  levelOfPackages,
  type UserLevel,
} from '@vibee/atoms'
import { API_BASE } from '@/config'
import { isAdmin } from '@/config/admin'
import { authHeaders } from '@/lib/apiFetch'

/** One package as /api/agents/packages/status reports it. */
export interface PackageStatus {
  id: string
  active: boolean
  until: string | null
  subscribed?: boolean
}

let asked: Promise<PackageStatus[] | null> | null = null

function askStatus(): Promise<PackageStatus[] | null> {
  asked ??= fetch(`${API_BASE}/api/agents/packages/status`, {
    headers: authHeaders(),
  })
    .then(r => r.json())
    .then((d: { ok?: boolean; packages?: unknown }) =>
      d?.ok && Array.isArray(d.packages)
        ? (d.packages as PackageStatus[])
        : null
    )
    .catch(() => null)
  return asked
}

/** After a purchase the next screen asks again instead of reusing the answer. */
export function forgetPackageStatus(): void {
  asked = null
}

/** The person's packages, or null until (or unless) the render answers. */
export function usePackageStatus(): PackageStatus[] | null {
  const [packages, setPackages] = useState<PackageStatus[] | null>(null)
  useEffect(() => {
    let alive = true
    void askStatus().then(p => {
      if (alive) setPackages(p)
    })
    return () => {
      alive = false
    }
  }, [])
  return packages
}

/** Who may switch: an admin, or anyone on a dev build. */
export function canSwitchLevel(): boolean {
  return isAdmin() || import.meta.env.DEV === true
}

export const viewLevelAtom = atomWithStorage<UserLevel | null>(
  STORAGE_KEYS.viewLevel,
  null,
  undefined,
  { getOnInit: true }
)

export interface UserLevelState {
  /** What the screens are drawn for; null = everything, as before. */
  level: UserLevel | null
  /** What the person's own packages give, switch or not. */
  paid: UserLevel | null
  packages: PackageStatus[] | null
  /** True while an admin is looking through a switched level. */
  switched: boolean
  /** Switch (admins and dev builds only); null goes back to the real one. */
  setLevel: (level: UserLevel | null) => void
}

export function useUserLevel(): UserLevelState {
  const [stored, setStored] = useAtom(viewLevelAtom)
  const packages = usePackageStatus()
  const paid = packages ? levelOfPackages(packages) : null
  const may = canSwitchLevel()
  const override = may && stored && USER_LEVELS.includes(stored) ? stored : null
  const level = override ?? (isAdmin() ? 'admin' : paid)
  return {
    level,
    paid,
    packages,
    switched: override !== null,
    setLevel: next => {
      if (may) setStored(next)
    },
  }
}
