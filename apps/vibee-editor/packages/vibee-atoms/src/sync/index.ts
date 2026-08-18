// ===============================
// @vibee/atoms - Sync Module Exports
// ===============================

// Types
export type {
  ConnectionState,
  SyncMessageType,
  SyncMessage,
  UserPresence,
  ItemLock,
  SyncConflict,
  QueuedChange,
} from './types'

// Connection Manager
export { WebSocketManager } from './connection'

// Atoms
export {
  // Connection
  syncConnectionStateAtom,
  syncProjectIdAtom,
  syncErrorAtom,
  lastSyncTimeAtom,
  // Presence
  remoteCursorsAtom,
  updateRemoteCursorAtom,
  removeRemoteCursorAtom,
  cleanupStaleCursorsAtom,
  activeCollaboratorsAtom,
  // Locks
  itemLocksAtom,
  isItemLockedAtom,
  getItemLockAtom,
  setItemLockAtom,
  removeItemLockAtom,
  // Conflicts
  syncConflictsAtom,
  hasConflictsAtom,
  addConflictAtom,
  resolveConflictAtom,
  clearResolvedConflictsAtom,
  // Offline
  offlineQueueAtom,
  isOnlineAtom,
  offlineQueueLengthAtom,
  addToOfflineQueueAtom,
  removeFromOfflineQueueAtom,
  clearOfflineQueueAtom,
} from './atoms'

// React Hook
export { useProjectSync } from './useProjectSync'
export type { UseProjectSyncOptions, UseProjectSyncReturn } from './useProjectSync'

// Utility: Generate user color from client ID
export function getUserColor(clientId: string): string {
  const colors = [
    '#ef4444', '#f97316', '#f59e0b', '#84cc16',
    '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6',
    '#ec4899', '#14b8a6', '#6366f1', '#a855f7',
  ]
  const hash = clientId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)
  return colors[hash % colors.length]
}
