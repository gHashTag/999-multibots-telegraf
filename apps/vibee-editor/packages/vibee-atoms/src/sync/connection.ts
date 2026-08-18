// ===============================
// @vibee/atoms - WebSocket Connection Manager
// ===============================

import { WEBSOCKET_ENDPOINTS } from '../defaults'
import type { ConnectionState, SyncMessage } from './types'

export class WebSocketManager {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private messageQueue: SyncMessage[] = []
  private projectId: string | null = null
  private clientId: string
  private pingInterval: ReturnType<typeof setInterval> | null = null

  private onStateChange: (state: ConnectionState) => void
  private onMessage: (msg: SyncMessage) => void
  private onError: (error: string) => void

  constructor(
    onStateChange: (state: ConnectionState) => void,
    onMessage: (msg: SyncMessage) => void,
    onError: (error: string) => void = () => {}
  ) {
    this.onStateChange = onStateChange
    this.onMessage = onMessage
    this.onError = onError
    this.clientId = this.getOrCreateClientId()
  }

  private getOrCreateClientId(): string {
    if (typeof window === 'undefined') return `server-${Date.now()}`

    let id = localStorage.getItem('vibee-client-id')
    if (!id) {
      id = `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      localStorage.setItem('vibee-client-id', id)
    }
    return id
  }

  getClientId(): string {
    return this.clientId
  }

  connect(projectId: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.disconnect()
    }

    this.projectId = projectId
    this.onStateChange('connecting')

    try {
      const url = WEBSOCKET_ENDPOINTS.project(projectId)
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        this.reconnectAttempts = 0
        this.reconnectDelay = 1000
        this.onStateChange('connected')
        this.flushQueue()
        this.startPingInterval()
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SyncMessage

          // Handle ping/pong internally
          if (msg.type === 'ping') {
            this.send({ type: 'pong', payload: null })
            return
          }

          this.onMessage(msg)
        } catch (e) {
          console.error('[WebSocket] Parse error:', e)
        }
      }

      this.ws.onclose = (event) => {
        this.stopPingInterval()
        this.onStateChange('disconnected')

        if (!event.wasClean) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error)
        this.onError('Connection error')
        this.onStateChange('error')
      }
    } catch (e) {
      console.error('[WebSocket] Failed to connect:', e)
      this.onError('Failed to connect')
      this.onStateChange('error')
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WebSocket] Max reconnect attempts reached')
      this.onError('Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    this.onStateChange('reconnecting')

    setTimeout(() => {
      if (this.projectId) {
        console.log(`[WebSocket] Reconnecting... attempt ${this.reconnectAttempts}`)
        this.connect(this.projectId)
      }
    }, this.reconnectDelay)

    // Exponential backoff (max 30 seconds)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', payload: null })
      }
    }, 30000) // Ping every 30 seconds
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  send(message: Omit<SyncMessage, 'timestamp' | 'senderId' | 'projectId'>): void {
    const fullMessage: SyncMessage = {
      ...message,
      timestamp: Date.now(),
      senderId: this.clientId,
      projectId: this.projectId || undefined,
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(fullMessage))
    } else {
      // Queue for later
      this.messageQueue.push(fullMessage)
    }
  }

  private flushQueue(): void {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()
      if (msg && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg))
      }
    }
  }

  disconnect(): void {
    this.stopPingInterval()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.projectId = null
    this.onStateChange('disconnected')
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
