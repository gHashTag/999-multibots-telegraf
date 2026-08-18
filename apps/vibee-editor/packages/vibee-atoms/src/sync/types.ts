// ===============================
// @vibee/atoms - Sync Types
// ===============================

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export type SyncMessageType =
  | 'state_update'
  | 'cursor_move'
  | 'selection_change'
  | 'presence'
  | 'lock'
  | 'unlock'
  | 'conflict'
  | 'ack'
  | 'ping'
  | 'pong'

export interface SyncMessage {
  type: SyncMessageType
  payload: unknown
  timestamp: number
  senderId: string
  version?: number
  projectId?: string
}

export interface UserPresence {
  clientId: string
  userId?: string
  name: string
  color: string
  frame: number
  selectedItemIds: string[]
  lastSeen: number
  isActive: boolean
}

export interface ItemLock {
  itemId: string
  lockedBy: string
  lockedByName: string
  lockedAt: number
  expiresAt: number
}

export interface SyncConflict {
  id: string
  itemId: string
  type: 'move' | 'update' | 'delete'
  localValue: unknown
  remoteValue: unknown
  localVersion: number
  remoteVersion: number
  timestamp: number
  resolved: boolean
}

export interface QueuedChange {
  id: string
  message: SyncMessage
  retryCount: number
  createdAt: number
}
