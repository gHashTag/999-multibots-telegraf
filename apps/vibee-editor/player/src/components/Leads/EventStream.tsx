// ===============================
// EventStream Component
// Live feed of ALL Telegram events
// ===============================

import { useEffect, useRef } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Wifi, WifiOff, MessageSquare, Zap, User, AlertCircle, Check, X, Trash2 } from 'lucide-react';
import {
  eventsAtom,
  clearEventsAtom,
  addEventAtom,
  leadsWsConnectedAtom,
} from '@/atoms/leads';
import type { TelegramEvent, TelegramEventType } from '@/atoms/leads';
import { useLanguage } from '@/hooks/useLanguage';
import { BRAND_COLORS, STATUS_COLORS } from '@vibee/atoms';
import './EventStream.css';

// Event type icons and colors
const eventConfig: Record<TelegramEventType, { icon: React.ReactNode; color: string; label: string; labelRu: string }> = {
  new_lead: { icon: <Zap size={14} />, color: BRAND_COLORS.amber, label: 'New Lead', labelRu: 'Новый лид' },
  message: { icon: <MessageSquare size={14} />, color: BRAND_COLORS.amber, label: 'Message', labelRu: 'Сообщение' },
  trigger_match: { icon: <Zap size={14} />, color: STATUS_COLORS.success, label: 'Trigger Match', labelRu: 'Триггер' },
  session_status: { icon: <User size={14} />, color: '#8b5cf6', label: 'Session', labelRu: 'Сессия' },
  ws_connected: { icon: <Wifi size={14} />, color: STATUS_COLORS.success, label: 'Connected', labelRu: 'Подключено' },
  ws_disconnected: { icon: <WifiOff size={14} />, color: STATUS_COLORS.error, label: 'Disconnected', labelRu: 'Отключено' },
  action_sent: { icon: <Check size={14} />, color: STATUS_COLORS.info, label: 'Action', labelRu: 'Действие' },
  error: { icon: <AlertCircle size={14} />, color: STATUS_COLORS.error, label: 'Error', labelRu: 'Ошибка' },
};

interface EventStreamProps {
  maxHeight?: number;
  showHeader?: boolean;
}

export function EventStream({ maxHeight = 400, showHeader = true }: EventStreamProps) {
  const { lang } = useLanguage();
  const events = useAtomValue(eventsAtom);
  const clearEvents = useSetAtom(clearEventsAtom);
  const addEvent = useSetAtom(addEventAtom);
  const isConnected = useAtomValue(leadsWsConnectedAtom);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new events arrive
  useEffect(() => {
    if (listRef.current && events.length > 0) {
      listRef.current.scrollTop = 0;
    }
  }, [events.length]);

  // Add demo event button (for testing)
  const addDemoEvent = () => {
    const demoTypes: TelegramEventType[] = ['new_lead', 'message', 'trigger_match', 'session_status'];
    const randomType = demoTypes[Math.floor(Math.random() * demoTypes.length)];

    const demoData: Record<string, any> = {
      new_lead: {
        fromUser: 'Demo User',
        chatTitle: 'Crypto Chat',
        message: 'Хочу купить USDT срочно!',
        trigger: 'usdt',
      },
      message: {
        fromUser: 'Test User',
        chatTitle: 'Test Group',
        message: 'Hello from Telegram!',
      },
      trigger_match: {
        trigger: 'bitcoin',
        message: 'Продам биткоин выгодно',
        chatTitle: 'BTC Exchange',
      },
      session_status: {
        sessionId: 'sess_demo',
        isOnline: true,
      },
    };

    addEvent({
      type: randomType,
      data: demoData[randomType],
    });
  };

  const formatTime = (timestamp: string) => {
    try {
      return formatDistanceToNow(new Date(timestamp), {
        addSuffix: true,
        locale: lang === 'ru' ? ru : undefined,
      });
    } catch {
      return timestamp;
    }
  };

  const getEventDescription = (event: TelegramEvent): string => {
    const { type, data } = event;
    const d = data as Record<string, string | number | boolean | undefined>;

    switch (type) {
      case 'new_lead': {
        const msg = String(d.message || '');
        return `${d.fromUser}: "${msg.slice(0, 50)}${msg.length > 50 ? '...' : ''}"`;
      }
      case 'message':
        return `${d.fromUser} in ${d.chatTitle}`;
      case 'trigger_match':
        return `"${d.trigger}" in ${d.chatTitle}`;
      case 'session_status':
        return `${d.sessionId}: ${d.isOnline ? 'online' : 'offline'}`;
      case 'ws_connected':
        return String(d.clientId || 'Connected to server');
      case 'ws_disconnected':
        return 'Connection lost';
      case 'action_sent':
        return `${d.action} for lead ${d.leadId}`;
      case 'error':
        return String(d.error || 'Unknown error');
      default:
        return JSON.stringify(data).slice(0, 50);
    }
  };

  return (
    <div className="event-stream">
      {showHeader && (
        <div className="event-stream-header">
          <div className="event-stream-title">
            <span className={`event-stream-status ${isConnected ? 'connected' : 'disconnected'}`} />
            <span>{lang === 'ru' ? 'События Telegram' : 'Telegram Events'}</span>
            <span className="event-stream-count">{events.length}</span>
          </div>
          <div className="event-stream-actions">
            <button
              className="event-stream-demo-btn"
              onClick={addDemoEvent}
              title={lang === 'ru' ? 'Добавить тестовое событие' : 'Add demo event'}
            >
              + Demo
            </button>
            {events.length > 0 && (
              <button
                className="event-stream-clear-btn"
                onClick={() => clearEvents()}
                title={lang === 'ru' ? 'Очистить' : 'Clear'}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={listRef}
        className="event-stream-list"
        style={{ maxHeight: `${maxHeight}px` }}
      >
        {events.length === 0 ? (
          <div className="event-stream-empty">
            <Zap size={32} />
            <span>{lang === 'ru' ? 'Ожидание событий...' : 'Waiting for events...'}</span>
            <span className="event-stream-empty-hint">
              {lang === 'ru'
                ? 'События появятся здесь когда кто-то напишет триггер-слово в Telegram'
                : 'Events will appear here when someone writes a trigger word in Telegram'
              }
            </span>
            <button className="event-stream-demo-btn-large" onClick={addDemoEvent}>
              {lang === 'ru' ? 'Добавить тестовое событие' : 'Add Demo Event'}
            </button>
          </div>
        ) : (
          events.map((event) => {
            const config = eventConfig[event.type];
            const eventData = event.data as Record<string, unknown>;
            return (
              <div
                key={event.id}
                className={`event-stream-item event-stream-item--${event.type}`}
                style={{ '--event-color': config.color } as React.CSSProperties}
              >
                <div className="event-stream-item-icon" style={{ color: config.color }}>
                  {config.icon}
                </div>
                <div className="event-stream-item-content">
                  <div className="event-stream-item-header">
                    <span className="event-stream-item-type">
                      {lang === 'ru' ? config.labelRu : config.label}
                    </span>
                    {typeof eventData.chatTitle === 'string' && (
                      <span className="event-stream-item-chat">
                        {eventData.chatTitle}
                      </span>
                    )}
                    {typeof eventData.trigger === 'string' && (
                      <span className="event-stream-item-trigger">
                        {eventData.trigger}
                      </span>
                    )}
                  </div>
                  <div className="event-stream-item-desc">
                    {getEventDescription(event)}
                  </div>
                </div>
                <div className="event-stream-item-time">
                  {formatTime(event.timestamp)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
