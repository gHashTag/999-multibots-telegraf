// ===============================
// @vibee/atoms - useProjectSync Hook
// React hook for project synchronization
// ===============================

import { useEffect, useCallback, useRef } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { WebSocketManager } from './connection'
import {
  syncConnectionStateAtom,
  syncProjectIdAtom,
  syncErrorAtom,
  lastSyncTimeAtom,
  updateRemoteCursorAtom,
  removeRemoteCursorAtom,
  cleanupStaleCursorsAtom,
  setItemLockAtom,
  removeItemLockAtom,
  addConflictAtom,
  isOnlineAtom,
  addToOfflineQueueAtom,
  offlineQueueAtom,
  removeFromOfflineQueueAtom,
} from './atoms'
import type { SyncMessage, UserPresence, ItemLock, ConnectionState } from './types'
import { getUserColor } from './index'

export interface UseProjectSyncOptions {
  /** User's display name for presence */
  userName?: string
  /** Enable cursor broadcasting */
  broadcastCursor?: boolean
  /** Cursor broadcast throttle in ms */
  cursorThrottleMs?: number
  /** Auto cleanup stale cursors interval in ms */
  cleanupIntervalMs?: number
}

export interface UseProjectSyncReturn {
  /** Current connection state */
  connectionState: ConnectionState
  /** Whether connected to WebSocket */
  isConnected: boolean
  /** Whether browser is online */
  isOnline: boolean
  /** Connection error message */
  error: string | null
  /** Send a sync message */
  sendMessage: (type: SyncMessage['type'], payload: unknown) => void
  /** Broadcast cursor position */
  broadcastCursor: (frame: number, selectedItemIds: string[]) => void
  /** Request lock on an item */
  requestLock: (itemId: string) => void
  /** Release lock on an item */
  releaseLock: (itemId: string) => void
  /** Disconnect from WebSocket */
  disconnect: () => void
}

/**
 * React hook for project synchronization via WebSocket
 *
 * @example
 * ```tsx
 * function Editor({ projectId }: { projectId: string }) {
 *   const {
 *     connectionState,
 *     isConnected,
 *     broadcastCursor,
 *     requestLock,
 *   } = useProjectSync(projectId, { userName: 'Alice' })
 *
 *   // Broadcast cursor when frame changes
 *   useEffect(() => {
 *     if (isConnected) {
 *       broadcastCursor(currentFrame, selectedItemIds)
 *     }
 *   }, [currentFrame, selectedItemIds, isConnected])
 *
 *   // Request lock before editing
 *   const handleStartEdit = (itemId: string) => {
 *     requestLock(itemId)
 *   }
 * }
 * ```
 */
export function useProjectSync(
  projectId: string | null,
  options: UseProjectSyncOptions = {}
): UseProjectSyncReturn {
  const {
    userName = 'Anonymous',
    broadcastCursor: enableCursorBroadcast = true,
    cursorThrottleMs = 100,
    cleanupIntervalMs = 10000,
  } = options

  // Atoms
  const [connectionState, setConnectionState] = useAtom(syncConnectionStateAtom)
  const setProjectId = useSetAtom(syncProjectIdAtom)
  const [error, setError] = useAtom(syncErrorAtom)
  const setLastSyncTime = useSetAtom(lastSyncTimeAtom)
  const isOnline = useAtomValue(isOnlineAtom)
  const offlineQueue = useAtomValue(offlineQueueAtom)

  // Presence & Locks
  const updateRemoteCursor = useSetAtom(updateRemoteCursorAtom)
  const removeRemoteCursor = useSetAtom(removeRemoteCursorAtom)
  const cleanupStaleCursors = useSetAtom(cleanupStaleCursorsAtom)
  const setItemLock = useSetAtom(setItemLockAtom)
  const removeItemLock = useSetAtom(removeItemLockAtom)
  const addConflict = useSetAtom(addConflictAtom)
  const addToOfflineQueue = useSetAtom(addToOfflineQueueAtom)
  const removeFromOfflineQueue = useSetAtom(removeFromOfflineQueueAtom)

  // Refs
  const wsManagerRef = useRef<WebSocketManager | null>(null)
  const lastCursorBroadcastRef = useRef<number>(0)
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Handle incoming messages
  const handleMessage = useCallback(
    (msg: SyncMessage) => {
      setLastSyncTime(Date.now())

      switch (msg.type) {
        case 'presence':
        case 'cursor_move': {
          const presence = msg.payload as UserPresence
          updateRemoteCursor({
            ...presence,
            color: presence.color || getUserColor(msg.senderId),
          })
          break
        }

        case 'selection_change': {
          const { clientId, selectedItemIds } = msg.payload as {
            clientId: string
            selectedItemIds: string[]
          }
          // Update remote cursor with new selection
          updateRemoteCursor({
            clientId,
            name: '',
            color: getUserColor(clientId),
            frame: 0,
            selectedItemIds,
            lastSeen: Date.now(),
            isActive: true,
          })
          break
        }

        case 'lock': {
          const lock = msg.payload as ItemLock
          setItemLock(lock)
          break
        }

        case 'unlock': {
          const { itemId } = msg.payload as { itemId: string }
          removeItemLock(itemId)
          break
        }

        case 'conflict': {
          const conflict = msg.payload as {
            itemId: string
            type: 'move' | 'update' | 'delete'
            localValue: unknown
            remoteValue: unknown
            localVersion: number
            remoteVersion: number
          }
          addConflict(conflict)
          break
        }

        case 'ack': {
          // Remove acknowledged item from offline queue
          const { queueId } = msg.payload as { queueId: string }
          if (queueId) {
            removeFromOfflineQueue(queueId)
          }
          break
        }

        case 'state_update': {
          // Handle state updates from server
          // TODO: Implement state merge logic
          break
        }

        default:
          break
      }
    },
    [
      setLastSyncTime,
      updateRemoteCursor,
      setItemLock,
      removeItemLock,
      addConflict,
      removeFromOfflineQueue,
    ]
  )

  // Handle connection state changes
  const handleStateChange = useCallback(
    (state: ConnectionState) => {
      setConnectionState(state)
      if (state === 'error') {
        setError('Connection failed')
      } else if (state === 'connected') {
        setError(null)
      }
    },
    [setConnectionState, setError]
  )

  // Handle errors
  const handleError = useCallback(
    (errorMsg: string) => {
      setError(errorMsg)
    },
    [setError]
  )

  // Connect/disconnect effect
  useEffect(() => {
    if (!projectId) {
      wsManagerRef.current?.disconnect()
      wsManagerRef.current = null
      setProjectId(null)
      return
    }

    // Create WebSocket manager
    wsManagerRef.current = new WebSocketManager(
      handleStateChange,
      handleMessage,
      handleError
    )

    // Connect
    wsManagerRef.current.connect(projectId)
    setProjectId(projectId)

    // Cleanup on unmount or projectId change
    return () => {
      wsManagerRef.current?.disconnect()
      wsManagerRef.current = null
    }
  }, [projectId, handleStateChange, handleMessage, handleError, setProjectId])

  // Cleanup stale cursors periodically
  useEffect(() => {
    cleanupIntervalRef.current = setInterval(() => {
      cleanupStaleCursors()
    }, cleanupIntervalMs)

    return () => {
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current)
      }
    }
  }, [cleanupIntervalMs, cleanupStaleCursors])

  // Flush offline queue when reconnected
  useEffect(() => {
    if (connectionState === 'connected' && offlineQueue.length > 0) {
      for (const item of offlineQueue) {
        wsManagerRef.current?.send(item.message)
      }
    }
  }, [connectionState, offlineQueue])

  // Online/offline detection
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => {
      // Reconnect if we have a project ID
      if (projectId && wsManagerRef.current) {
        wsManagerRef.current.connect(projectId)
      }
    }

    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
    }
  }, [projectId])

  // Send message (with offline queue fallback)
  const sendMessage = useCallback(
    (type: SyncMessage['type'], payload: unknown) => {
      const message: Omit<SyncMessage, 'timestamp' | 'senderId' | 'projectId'> = {
        type,
        payload,
      }

      if (wsManagerRef.current?.isConnected()) {
        wsManagerRef.current.send(message)
      } else if (isOnline === false) {
        // Queue for later
        addToOfflineQueue({ message: message as SyncMessage })
      }
    },
    [isOnline, addToOfflineQueue]
  )

  // Broadcast cursor position (throttled)
  const broadcastCursorFn = useCallback(
    (frame: number, selectedItemIds: string[]) => {
      if (!enableCursorBroadcast) return

      const now = Date.now()
      if (now - lastCursorBroadcastRef.current < cursorThrottleMs) return
      lastCursorBroadcastRef.current = now

      const clientId = wsManagerRef.current?.getClientId() || 'unknown'
      const presence: UserPresence = {
        clientId,
        name: userName,
        color: getUserColor(clientId),
        frame,
        selectedItemIds,
        lastSeen: now,
        isActive: true,
      }

      sendMessage('cursor_move', presence)
    },
    [enableCursorBroadcast, cursorThrottleMs, userName, sendMessage]
  )

  // Request item lock
  const requestLock = useCallback(
    (itemId: string) => {
      const clientId = wsManagerRef.current?.getClientId() || 'unknown'
      const lock: ItemLock = {
        itemId,
        lockedBy: clientId,
        lockedByName: userName,
        lockedAt: Date.now(),
        expiresAt: Date.now() + 60000, // 1 minute
      }

      sendMessage('lock', lock)
      // Optimistically set local lock
      setItemLock(lock)
    },
    [userName, sendMessage, setItemLock]
  )

  // Release item lock
  const releaseLock = useCallback(
    (itemId: string) => {
      sendMessage('unlock', { itemId })
      removeItemLock(itemId)
    },
    [sendMessage, removeItemLock]
  )

  // Disconnect
  const disconnect = useCallback(() => {
    wsManagerRef.current?.disconnect()
  }, [])

  return {
    connectionState,
    isConnected: connectionState === 'connected',
    isOnline,
    error,
    sendMessage,
    broadcastCursor: broadcastCursorFn,
    requestLock,
    releaseLock,
    disconnect,
  }
}
