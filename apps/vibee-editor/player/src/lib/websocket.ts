import { useEffect, useRef, useCallback, useState } from 'react';
import { editorStore } from '@/atoms/Provider';
import {
  assetsAtom,
  tracksAtom,
  selectedItemIdsAtom,
} from '@/atoms';
// Import playback atoms directly from @vibee/atoms
// Use action atoms (setCurrentFrameAtom, setIsPlayingAtom) for store.set() to avoid Jotai type issues
import { isPlayingAtom, setCurrentFrameAtom, setIsPlayingAtom } from '@vibee/atoms';
import { produce } from 'immer';
import type { Asset, TrackItem, LipSyncMainProps } from '@vibee/atoms';
import { RENDER_URL } from '../config';

// WebSocket server URL (same as render server)
// Only connect on production — localhost dev doesn't need render server
const WS_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? null  // Skip WebSocket on localhost
  : RENDER_URL.replace('https://', 'wss://'); // Production WebSocket

// Message types for real-time sync
export type WSMessageType =
  | { type: 'connected'; payload: { clientId: string } }
  | { type: 'asset_added'; payload: Asset }
  | { type: 'asset_removed'; payload: { id: string } }
  | { type: 'item_added'; payload: { trackId: string; item: TrackItem } }
  | { type: 'item_updated'; payload: { id: string; updates: Partial<TrackItem> } }
  | { type: 'item_deleted'; payload: { ids: string[] } }
  | { type: 'props_changed'; payload: Partial<LipSyncMainProps> }
  | { type: 'frame_changed'; payload: { frame: number } }
  | { type: 'playback_changed'; payload: { isPlaying: boolean } }
  // Agent messages (forwarded from MCP server)
  | { type: 'agent_response'; payload: AgentResponsePayload }
  | { type: 'agent_streaming'; payload: { content: string; isComplete: boolean } }
  | { type: 'agent_error'; payload: { error: string } };

// Agent response payload type
export interface AgentResponsePayload {
  content?: string;
  codeBlock?: { language: string; code: string };
  actions?: Array<{
    id: string;
    type: string;
    label: string;
    payload: Record<string, unknown>;
    status: 'pending' | 'applied' | 'rejected';
  }>;
}

interface UseWebSocketOptions {
  onConnect?: () => void;
  onDisconnect?: () => void;
  onMessage?: (msg: WSMessageType) => void;
}

interface UseWebSocketReturn {
  send: (message: Omit<WSMessageType, 'connected'>) => void;
  isConnected: boolean;
  clientId: string | null;
}

// Max reconnection attempts before giving up
const MAX_RECONNECT_ATTEMPTS = 3;
const BASE_RECONNECT_DELAY = 2000; // 2 seconds
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reconnectAttemptsRef = useRef(0);
  const gaveUpRef = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  const connect = useCallback(() => {
    // Skip WebSocket on localhost
    if (!WS_URL) {
      return null;
    }

    // Stop permanently after max attempts
    if (gaveUpRef.current) {
      return null;
    }

    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      gaveUpRef.current = true;
      console.log('[WS] Render server not available. Real-time sync disabled.');
      return null;
    }

    // Parse WS URL - handle various formats
    let wsUrl = WS_URL;
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      wsUrl = `ws://${wsUrl}`;
    }

    // Only log on first attempt
    if (reconnectAttemptsRef.current === 0) {
      console.log('[WS] Connecting to:', wsUrl);
    }

    try {
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[WS] Connected');
        wsRef.current = ws;
        setIsConnected(true);
        reconnectAttemptsRef.current = 0;
        optionsRef.current.onConnect?.();
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessageType = JSON.parse(event.data);
          handleMessage(msg);
          optionsRef.current.onMessage?.(msg);
        } catch (error) {
          console.error('[WS] Failed to parse message:', error);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnected(false);
        setClientId(null);
        optionsRef.current.onDisconnect?.();

        // Exponential backoff for reconnection
        if (WS_URL && !gaveUpRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
            MAX_RECONNECT_DELAY
          );
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        // Silently handle errors - onclose will handle reconnection
      };

      return ws;
    } catch (error) {
      // Retry with exponential backoff
      if (WS_URL && !gaveUpRef.current && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(
          BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
          MAX_RECONNECT_DELAY
        );
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMessage = useCallback((msg: WSMessageType) => {
    switch (msg.type) {
      case 'connected':
        setClientId(msg.payload.clientId);
        console.log('[WS] Assigned client ID:', msg.payload.clientId);
        break;

      case 'asset_added':
        console.log('[WS] Remote asset added:', msg.payload.name);
        editorStore.set(assetsAtom, produce(editorStore.get(assetsAtom), (draft) => {
          draft.push(msg.payload);
        }) as any);
        break;

      case 'asset_removed':
        console.log('[WS] Remote asset removed:', msg.payload.id);
        editorStore.set(assetsAtom, editorStore.get(assetsAtom).filter((a) => a.id !== msg.payload.id) as any);
        break;

      case 'item_added':
        console.log('[WS] Remote item added to track:', msg.payload.trackId);
        editorStore.set(tracksAtom, produce(editorStore.get(tracksAtom), (draft) => {
          const track = draft.find((t) => t.id === msg.payload.trackId);
          if (track) {
            track.items.push(msg.payload.item);
          }
        }) as any);
        break;

      case 'item_updated':
        console.log('[WS] Remote item updated:', msg.payload.id);
        editorStore.set(tracksAtom, produce(editorStore.get(tracksAtom), (draft) => {
          for (const track of draft) {
            const item = track.items.find((i) => i.id === msg.payload.id);
            if (item) {
              Object.assign(item, msg.payload.updates);
              break;
            }
          }
        }) as any);
        break;

      case 'item_deleted':
        console.log('[WS] Remote items deleted:', msg.payload.ids);
        editorStore.set(tracksAtom, produce(editorStore.get(tracksAtom), (draft) => {
          for (const track of draft) {
            track.items = track.items.filter((item) => !msg.payload.ids.includes(item.id));
          }
        }) as any);
        editorStore.set(selectedItemIdsAtom as any, editorStore.get(selectedItemIdsAtom).filter(
          (id) => !msg.payload.ids.includes(id)
        ));
        break;

      case 'props_changed':
        console.log('[WS] Remote props changed');
        // TODO: Update individual prop atoms if needed
        break;

      case 'frame_changed':
        // Only sync frame if not playing (to avoid jitter)
        if (!editorStore.get(isPlayingAtom)) {
          editorStore.set(setCurrentFrameAtom, msg.payload.frame);
        }
        break;

      case 'playback_changed':
        editorStore.set(setIsPlayingAtom, msg.payload.isPlaying);
        break;
    }
  }, []);

  const send = useCallback((message: Omit<WSMessageType, 'connected'>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[WS] Cannot send - not connected');
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    const ws = connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [connect]);

  return { send, isConnected, clientId };
}

// Singleton for broadcasting from store actions
let globalWsSend: ((msg: Omit<WSMessageType, 'connected'>) => void) | null = null;

export function setGlobalWsSend(send: (msg: Omit<WSMessageType, 'connected'>) => void) {
  globalWsSend = send;
}

export function getGlobalWsSend() {
  return globalWsSend;
}

// Helper to broadcast from anywhere
export function broadcastAssetAdded(asset: Asset) {
  globalWsSend?.({ type: 'asset_added', payload: asset });
}

export function broadcastAssetRemoved(id: string) {
  globalWsSend?.({ type: 'asset_removed', payload: { id } });
}

export function broadcastItemAdded(trackId: string, item: TrackItem) {
  globalWsSend?.({ type: 'item_added', payload: { trackId, item } });
}

export function broadcastItemUpdated(id: string, updates: Partial<TrackItem>) {
  globalWsSend?.({ type: 'item_updated', payload: { id, updates } });
}

export function broadcastItemDeleted(ids: string[]) {
  globalWsSend?.({ type: 'item_deleted', payload: { ids } });
}

export function broadcastPropsChanged(props: Partial<LipSyncMainProps>) {
  globalWsSend?.({ type: 'props_changed', payload: props });
}
