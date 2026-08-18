// ===============================
// Leads WebSocket Hook
// Real-time lead updates from Telegram
// ===============================

import { useEffect, useRef, useCallback, useState } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import {
  addLeadAtom,
  updateLeadAtom,
  updateSessionStatusAtom,
  leadsWsConnectedAtom,
  activeSessionAtom,
  addEventAtom,
  type Lead,
} from '@/atoms/leads';
import { WS_BASE } from '../config';

// ===============================
// Types
// ===============================

export interface LeadsWSMessage {
  type: 'connected' | 'new_lead' | 'lead_updated' | 'session_status' | 'error' | 'pong' | 'telegram_message' | 'trigger_detected';
  data?: any;
}

export interface LeadsWSCommand {
  type: 'subscribe' | 'allow' | 'block' | 'reply' | 'mute' | 'ping';
  session_id?: string;
  chat_id?: number;
  text?: string;
  message_id?: number;
  duration?: number;
}

// ===============================
// Hook
// ===============================

export function useLeadsWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;

  const [clientId, setClientId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const addLead = useSetAtom(addLeadAtom);
  const updateLead = useSetAtom(updateLeadAtom);
  const updateSessionStatus = useSetAtom(updateSessionStatusAtom);
  const setWsConnected = useSetAtom(leadsWsConnectedAtom);
  const activeSession = useAtomValue(activeSessionAtom);

  // Parse incoming message
  const handleMessage = useCallback((msg: LeadsWSMessage) => {
    switch (msg.type) {
      case 'connected':
        setClientId(msg.data?.clientId || null);
        reconnectAttempts.current = 0;
        console.log('[LeadsWS] Connected, clientId:', msg.data?.clientId);
        break;

      case 'trigger_detected': {
        // trigger_detected events don't have sender/text info, just log them
        console.log('[LeadsWS] Trigger detected in chat:', (msg as any).chat_id);
        break;
      }

      case 'new_lead':
      case 'telegram_message': {
        // DIAGNOSTIC: Log new_lead handling
        console.log('[LeadsWS] HANDLING', msg.type, 'case');

        // Backend sends data directly in msg (not wrapped in msg.data)
        // Support both formats for compatibility
        const data = msg.data || msg;

        // Support both new_lead format and telegram_message format
        const leadId = data.id || data.msg_id || Date.now();
        const fromUserId = data.telegram_user_id || data.from_user_id || data.user_id || 0;
        const fromUsername = data.username || data.from_username || '';
        const fromDisplayName = data.first_name || data.display_name || data.from_display_name || data.sender || 'Unknown';
        const chatId = data.chat_id || 0;
        // Use chat_title from event, fallback to chat_id
        const chatTitle = data.chat_title || data.chat_name || (data.chat_id ? String(data.chat_id) : 'Unknown Chat');
        const messageText = data.message || data.text || data.message_text || '';

        // Only create lead if we have meaningful data (sender and text)
        if (fromDisplayName && fromDisplayName !== 'Unknown' && messageText) {
          console.log('[LeadsWS] Creating lead:', fromDisplayName, messageText.substring(0, 50));
          const lead: Lead = {
            id: String(leadId),
            fromUserId: fromUserId,
            fromUsername: fromUsername,
            fromDisplayName: fromDisplayName,
            fromAvatar: data.avatar,
            chatId: typeof chatId === 'string' ? parseInt(chatId, 10) : chatId,
            chatTitle: chatTitle,
            chatType: data.chat_type || 'group',
            messageText: messageText,
            messageId: data.message_id || data.msg_id,
            triggerWord: data.trigger || data.trigger_word,
            quality: data.quality_score || data.quality || 5,
            intent: mapIntent(data.intent),
            urgency: mapUrgency(data.urgency),
            status: 'new',
            sessionId: data.session_id || activeSession || '',
            createdAt: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isRead: false,
            isMuted: false,
          };
          addLead(lead);

          // Play notification sound
          playNotificationSound();
        } else {
          console.log('[LeadsWS] Skipping incomplete lead:', { fromDisplayName, messageText: messageText?.substring(0, 30) });
        }
        break;
      }

      case 'lead_updated': {
        // Support both msg.data and direct msg formats
        const data = msg.data || msg;
        if (data.id || data.lead_id) {
          updateLead({
            id: String(data.id || data.lead_id),
            updates: {
              status: data.status || data.new_status,
            },
          });
          console.log('[LeadsWS] Lead updated:', data.id || data.lead_id, data.status);
        }
        break;
      }

      case 'session_status': {
        // Support both msg.data and direct msg formats
        const data = msg.data || msg;
        if (data.id || data.session_id) {
          updateSessionStatus({
            id: data.id || data.session_id,
            isOnline: data.isOnline ?? data.is_online ?? true,
          });
          console.log('[LeadsWS] Session status:', data.id || data.session_id, data.isOnline ?? data.is_online);
        }
        break;
      }

      case 'error':
        setLastError(msg.data?.message || 'Unknown error');
        console.error('[LeadsWS] Error:', msg.data?.message);
        break;

      case 'pong':
        // Keepalive response
        break;
    }
  }, [addLead, updateLead, updateSessionStatus, activeSession]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[LeadsWS] Already connected');
      return;
    }

    console.log('[LeadsWS] Connecting...');
    setLastError(null);

    try {
      const url = new URL(`${WS_BASE}/ws/leads`);
      // Only filter by session if a specific account is selected (not 'all')
      if (activeSession && activeSession !== 'all') {
        url.searchParams.set('session_id', activeSession);
      }

      const ws = new WebSocket(url.toString());

      ws.onopen = () => {
        console.log('[LeadsWS] Connected');
        wsRef.current = ws;
        setWsConnected(true);
        reconnectAttempts.current = 0;

        // Subscribe to active session (only if specific account selected)
        if (activeSession && activeSession !== 'all') {
          send({ type: 'subscribe', session_id: activeSession });
        }

        // Start ping interval - send plain text "ping" (server expects text, not JSON)
        pingIntervalRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send('ping');
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        // DIAGNOSTIC: Log raw message
        console.log('[LeadsWS] RAW MESSAGE:', event.data);
        console.log('[LeadsWS] RAW MESSAGE type:', typeof event.data);
        console.log('[LeadsWS] RAW MESSAGE length:', event.data?.length);

        try {
          const msg: LeadsWSMessage = JSON.parse(event.data);
          // DIAGNOSTIC: Log parsed message
          console.log('[LeadsWS] PARSED msg:', msg);
          console.log('[LeadsWS] PARSED msg.type:', msg.type);
          console.log('[LeadsWS] PARSED msg.data:', msg.data);

          handleMessage(msg);
        } catch (error) {
          console.error('[LeadsWS] Parse error:', error, 'Raw data:', event.data);
        }
      };

      ws.onclose = (event) => {
        console.log('[LeadsWS] Disconnected:', event.code, event.reason);
        wsRef.current = null;
        setWsConnected(false);
        setClientId(null);

        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }

        // Reconnect with exponential backoff
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          console.log(`[LeadsWS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else {
          setLastError('Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('[LeadsWS] Error:', error);
        setLastError('WebSocket error');
      };

    } catch (error) {
      console.error('[LeadsWS] Connection failed:', error);
      setLastError('Failed to connect');

      // Retry connection
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [activeSession, handleMessage, setWsConnected]);

  // Send command to server
  const send = useCallback((command: LeadsWSCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(command));
      return true;
    }
    console.warn('[LeadsWS] Cannot send, not connected');
    return false;
  }, []);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setWsConnected(false);
  }, [setWsConnected]);

  // Actions
  const allowChat = useCallback((chatId: number) => {
    return send({ type: 'allow', chat_id: chatId, session_id: activeSession || undefined });
  }, [send, activeSession]);

  const blockChat = useCallback((chatId: number) => {
    return send({ type: 'block', chat_id: chatId, session_id: activeSession || undefined });
  }, [send, activeSession]);

  const muteChat = useCallback((chatId: number, durationMinutes: number = 60) => {
    return send({ type: 'mute', chat_id: chatId, duration: durationMinutes, session_id: activeSession || undefined });
  }, [send, activeSession]);

  const replyToChat = useCallback((chatId: number, text: string, messageId?: number) => {
    return send({ type: 'reply', chat_id: chatId, text, message_id: messageId, session_id: activeSession || undefined });
  }, [send, activeSession]);

  // Subscribe to session
  const subscribe = useCallback((sessionId: string) => {
    return send({ type: 'subscribe', session_id: sessionId });
  }, [send]);

  // Connect on mount and when activeSession changes
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when activeSession changes
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && activeSession && activeSession !== 'all') {
      subscribe(activeSession);
    }
  }, [activeSession, subscribe]);

  return {
    isConnected: wsRef.current?.readyState === WebSocket.OPEN,
    clientId,
    lastError,
    send,
    connect,
    disconnect,
    allowChat,
    blockChat,
    muteChat,
    replyToChat,
    subscribe,
  };
}

// ===============================
// Helpers
// ===============================

function mapIntent(intent?: string): Lead['intent'] {
  if (!intent) return 'unknown';
  const lower = intent.toLowerCase();
  if (lower.includes('purchase') || lower.includes('buy') || lower.includes('покуп')) return 'purchase';
  if (lower.includes('sale') || lower.includes('sell') || lower.includes('продаж')) return 'sale';
  if (lower.includes('exchange') || lower.includes('обмен')) return 'exchange';
  if (lower.includes('question') || lower.includes('вопрос') || lower.includes('?')) return 'question';
  if (lower.includes('support') || lower.includes('помощь') || lower.includes('help')) return 'support';
  return 'unknown';
}

function mapUrgency(urgency?: string): Lead['urgency'] {
  if (!urgency) return 'medium';
  const lower = urgency.toLowerCase();
  if (lower.includes('high') || lower.includes('выс') || lower.includes('срочно')) return 'high';
  if (lower.includes('low') || lower.includes('низ') || lower.includes('обычн')) return 'low';
  return 'medium';
}

// Simple notification sound
function playNotificationSound() {
  try {
    // Create a simple beep using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800; // Hz
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  } catch (e) {
    // Audio not available, ignore
  }
}
