// ===============================
// @vibee/atoms - Sync State Atoms
// ===============================

import { atom } from 'jotai'
import type { ConnectionState, UserPresence, ItemLock, SyncConflict, QueuedChange } from './types'

// ===============================
// Connection State
// ===============================

export const syncConnectionStateAtom = atom<ConnectionState>('disconnected')
export const syncProjectIdAtom = atom<string | null>(null)
export const syncErrorAtom = atom<string | null>(null)
export const lastSyncTimeAtom = atom<number>(0)

// ===============================
// Presence (Remote Users)
// ===============================

export const remoteCursorsAtom = atom<Map<string, UserPresence>>(new Map())

export const updateRemoteCursorAtom = atom(
  null,
  (get, set, cursor: UserPresence) => {
    const cursors = new Map(get(remoteCursorsAtom))
    cursors.set(cursor.clientId, { ...cursor, lastSeen: Date.now() })
    set(remoteCursorsAtom, cursors)
  }
)

export const removeRemoteCursorAtom = atom(
  null,
  (get, set, clientId: string) => {
    const cursors = new Map(get(remoteCursorsAtom))
    cursors.delete(clientId)
    set(remoteCursorsAtom, cursors)
  }
)

// Clean up stale cursors (not seen in 30 seconds)
export const cleanupStaleCursorsAtom = atom(null, (get, set) => {
  const cursors = new Map(get(remoteCursorsAtom))
  const now = Date.now()
  const staleThreshold = 30000

  for (const [id, cursor] of cursors) {
    if (now - cursor.lastSeen > staleThreshold) {
      cursors.delete(id)
    }
  }
  set(remoteCursorsAtom, cursors)
})

export const activeCollaboratorsAtom = atom((get) => {
  const cursors = get(remoteCursorsAtom)
  return Array.from(cursors.values()).filter((c) => c.isActive)
})

// ===============================
// Item Locks
// ===============================

export const itemLocksAtom = atom<Map<string, ItemLock>>(new Map())

export const isItemLockedAtom = atom((get) => {
  const locks = get(itemLocksAtom)
  const clientId = typeof window !== 'undefined'
    ? localStorage.getItem('vibee-client-id')
    : null

  return (itemId: string): boolean => {
    const lock = locks.get(itemId)
    if (!lock) return false
    if (lock.lockedBy === clientId) return false
    if (Date.now() > lock.expiresAt) return false
    return true
  }
})

export const getItemLockAtom = atom((get) => {
  const locks = get(itemLocksAtom)
  return (itemId: string) => locks.get(itemId)
})

export const setItemLockAtom = atom(
  null,
  (get, set, lock: ItemLock) => {
    const locks = new Map(get(itemLocksAtom))
    locks.set(lock.itemId, lock)
    set(itemLocksAtom, locks)
  }
)

export const removeItemLockAtom = atom(
  null,
  (get, set, itemId: string) => {
    const locks = new Map(get(itemLocksAtom))
    locks.delete(itemId)
    set(itemLocksAtom, locks)
  }
)

// ===============================
// Conflicts
// ===============================

export const syncConflictsAtom = atom<SyncConflict[]>([])
export const hasConflictsAtom = atom((get) =>
  get(syncConflictsAtom).some((c) => !c.resolved)
)

export const addConflictAtom = atom(
  null,
  (get, set, conflict: Omit<SyncConflict, 'id' | 'timestamp' | 'resolved'>) => {
    const newConflict: SyncConflict = {
      ...conflict,
      id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      resolved: false,
    }
    set(syncConflictsAtom, [...get(syncConflictsAtom), newConflict])
  }
)

export const resolveConflictAtom = atom(
  null,
  (get, set, { conflictId, resolution }: {
    conflictId: string
    resolution: 'local' | 'remote' | 'merge'
  }) => {
    set(
      syncConflictsAtom,
      get(syncConflictsAtom).map((c) =>
        c.id === conflictId ? { ...c, resolved: true } : c
      )
    )
    // TODO: Apply resolution
  }
)

export const clearResolvedConflictsAtom = atom(null, (get, set) => {
  set(syncConflictsAtom, get(syncConflictsAtom).filter((c) => !c.resolved))
})

// ===============================
// Offline Queue
// ===============================

export const offlineQueueAtom = atom<QueuedChange[]>([])
export const isOnlineAtom = atom(
  typeof navigator !== 'undefined' ? navigator.onLine : true
)

export const offlineQueueLengthAtom = atom((get) => get(offlineQueueAtom).length)

export const addToOfflineQueueAtom = atom(
  null,
  (get, set, change: Omit<QueuedChange, 'id' | 'createdAt' | 'retryCount'>) => {
    const queuedChange: QueuedChange = {
      ...change,
      id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      retryCount: 0,
    }
    set(offlineQueueAtom, [...get(offlineQueueAtom), queuedChange])
  }
)

export const removeFromOfflineQueueAtom = atom(
  null,
  (get, set, id: string) => {
    set(offlineQueueAtom, get(offlineQueueAtom).filter((c) => c.id !== id))
  }
)

export const clearOfflineQueueAtom = atom(null, (_get, set) => {
  set(offlineQueueAtom, [])
})
