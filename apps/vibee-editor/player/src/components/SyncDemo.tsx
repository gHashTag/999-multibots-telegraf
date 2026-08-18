// SyncDemo - Test component for WebSocket synchronization
// Day 13: Web + Mobile sync test

import { useState, useCallback } from 'react'
import { useSync, type SyncMessage } from '@vibee/ui'
import { BRAND_COLORS, EDITOR_COLORS, STATUS_COLORS } from '@vibee/atoms'

interface SyncDemoProps {
  projectId: string
  userId?: string
}

interface SyncLog {
  id: number
  timestamp: Date
  direction: 'in' | 'out'
  type: string
  payload: unknown
}

export function SyncDemo({ projectId, userId }: SyncDemoProps) {
  const [logs, setLogs] = useState<SyncLog[]>([])
  const [playhead, setPlayhead] = useState(0)
  const [cursors, setCursors] = useState<Map<string, { x: number, y: number }>>(new Map())

  const addLog = useCallback((direction: 'in' | 'out', type: string, payload: unknown) => {
    setLogs(prev => [...prev.slice(-50), {
      id: Date.now(),
      timestamp: new Date(),
      direction,
      type,
      payload
    }])
  }, [])

  const handleMessage = useCallback((message: SyncMessage) => {
    addLog('in', message.type, message.payload)

    switch (message.type) {
      case 'playhead:synced':
        setPlayhead((message.payload as { frame: number }).frame)
        break
      case 'cursor:moved':
        const cursorData = message.payload as { userId: string, x: number, y: number }
        setCursors(prev => new Map(prev).set(cursorData.userId, { x: cursorData.x, y: cursorData.y }))
        break
    }
  }, [addLog])

  const { state, emit, isConnected } = useSync({
    channel: 'project',
    projectId,
    userId,
    onMessage: handleMessage,
    onStatusChange: (status) => addLog('in', 'status', { status })
  })

  const sendPlayhead = useCallback((frame: number) => {
    addLog('out', 'playhead:sync', { frame })
    emit.playheadSync(frame)
    setPlayhead(frame)
  }, [emit, addLog])

  const sendCursor = useCallback((x: number, y: number) => {
    addLog('out', 'cursor:move', { x, y })
    emit.cursorMove(x, y)
  }, [emit, addLog])

  const sendTrackAdd = useCallback(() => {
    const track = {
      id: `track_${Date.now()}`,
      type: 'video',
      name: 'New Track'
    }
    addLog('out', 'track:add', track)
    emit.trackAdd(track)
  }, [emit, addLog])

  return (
    <div style={{
      padding: '20px',
      backgroundColor: EDITOR_COLORS.surface,
      color: 'white',
      borderRadius: '8px',
      fontFamily: 'monospace'
    }}>
      <h2 style={{ margin: '0 0 16px 0' }}>🔄 Sync Demo</h2>

      {/* Connection Status */}
      <div style={{ marginBottom: '16px' }}>
        <span style={{
          display: 'inline-block',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: isConnected ? STATUS_COLORS.success : state.status === 'connecting' ? BRAND_COLORS.amber : STATUS_COLORS.error,
          marginRight: '8px'
        }} />
        <span>{state.status} | Project: {projectId}</span>
        {state.lastSync && (
          <span style={{ marginLeft: '16px', color: '#888' }}>
            Last sync: {new Date(state.lastSync).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Playhead Control */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px' }}>Playhead: {playhead}</label>
        <input
          type="range"
          min={0}
          max={1000}
          value={playhead}
          onChange={(e) => sendPlayhead(parseInt(e.target.value))}
          style={{ width: '100%' }}
          disabled={!isConnected}
        />
      </div>

      {/* Cursor Control */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', marginBottom: '4px' }}>Cursor Position</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => sendCursor(Math.random() * 100, Math.random() * 100)}
            disabled={!isConnected}
            style={{
              padding: '8px 16px',
              backgroundColor: isConnected ? BRAND_COLORS.amber : '#444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnected ? 'pointer' : 'not-allowed'
            }}
          >
            Send Random Cursor
          </button>
          <button
            onClick={sendTrackAdd}
            disabled={!isConnected}
            style={{
              padding: '8px 16px',
              backgroundColor: isConnected ? STATUS_COLORS.success : '#444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnected ? 'pointer' : 'not-allowed'
            }}
          >
            Add Track
          </button>
        </div>
      </div>

      {/* Other Users' Cursors */}
      {cursors.size > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '4px' }}>Other Cursors:</label>
          {Array.from(cursors.entries()).map(([uid, pos]) => (
            <div key={uid} style={{ color: '#888' }}>
              {uid}: ({pos.x.toFixed(1)}, {pos.y.toFixed(1)})
            </div>
          ))}
        </div>
      )}

      {/* Log */}
      <div style={{
        maxHeight: '200px',
        overflow: 'auto',
        backgroundColor: EDITOR_COLORS.dark,
        padding: '8px',
        borderRadius: '4px',
        fontSize: '12px'
      }}>
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>No messages yet...</div>
        ) : (
          logs.slice().reverse().map(log => (
            <div key={log.id} style={{
              padding: '2px 0',
              color: log.direction === 'in' ? STATUS_COLORS.success : STATUS_COLORS.info
            }}>
              <span style={{ color: '#666' }}>
                {log.timestamp.toLocaleTimeString()}
              </span>
              {' '}
              <span>{log.direction === 'in' ? '⬇️' : '⬆️'}</span>
              {' '}
              <span style={{ fontWeight: 'bold' }}>{log.type}</span>
              {' '}
              <span style={{ color: '#888' }}>
                {JSON.stringify(log.payload).slice(0, 50)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default SyncDemo
