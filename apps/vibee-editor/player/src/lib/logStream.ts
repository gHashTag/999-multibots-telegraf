/**
 * Log Stream - WebSocket-based log streaming from Vibee MCP server
 * Provides real-time log viewing with filtering and trace correlation
 */

import { BRAND_COLORS, WEBSOCKET_ENDPOINTS } from '@vibee/atoms';

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  logger: string;
  message: string;
  trace_id?: string;
  request_id?: string;
  session_id?: string;
  span_id?: string;
  user_id?: number;
  tool?: string;
  [key: string]: unknown; // Extra fields
}

export interface SpanEntry {
  trace_id: string;
  span_id: string;
  parent_id?: string;
  name: string;
  kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string>;
}

export interface LogFilter {
  levels?: LogLevel[];
  logger?: string;
  trace_id?: string;
  tool?: string;
  search?: string;
  since?: Date;
}

export interface LogStreamOptions {
  url?: string;
  reconnectInterval?: number;
  maxLogs?: number;
  filter?: LogFilter;
}

// =============================================================================
// Log Stream Class
// =============================================================================

export class LogStream {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectInterval: number;
  private maxLogs: number;
  private logs: LogEntry[] = [];
  private spans: Map<string, SpanEntry> = new Map();
  private listeners: Set<(log: LogEntry) => void> = new Set();
  private spanListeners: Set<(span: SpanEntry) => void> = new Set();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private reconnectTimeout: number | null = null;
  private filter: LogFilter;

  constructor(options: LogStreamOptions = {}) {
    this.url = options.url || WEBSOCKET_ENDPOINTS.logs;
    this.reconnectInterval = options.reconnectInterval || 5000;
    this.maxLogs = options.maxLogs || 1000;
    this.filter = options.filter || {};
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[LogStream] Connected to log server');
        this.notifyConnectionListeners(true);

        // Send initial filter if set
        if (Object.keys(this.filter).length > 0) {
          this.sendFilter(this.filter);
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (e) {
          console.warn('[LogStream] Failed to parse message:', e);
        }
      };

      this.ws.onclose = () => {
        console.log('[LogStream] Disconnected from log server');
        this.notifyConnectionListeners(false);
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[LogStream] WebSocket error:', error);
      };
    } catch (e) {
      console.error('[LogStream] Failed to connect:', e);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.reconnectInterval);
  }

  // ---------------------------------------------------------------------------
  // Message Handling
  // ---------------------------------------------------------------------------

  private handleMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;

    const msg = data as Record<string, unknown>;

    // Check if it's a span message
    if (msg.span_id && msg.name) {
      this.handleSpan(msg as unknown as SpanEntry);
      return;
    }

    // Otherwise treat as log entry
    this.handleLog(msg as unknown as LogEntry);
  }

  private handleLog(log: LogEntry): void {
    // Apply client-side filter
    if (!this.matchesFilter(log)) {
      return;
    }

    // Add to log buffer
    this.logs.unshift(log);

    // Trim if over max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    // Notify listeners
    this.notifyLogListeners(log);
  }

  private handleSpan(span: SpanEntry): void {
    this.spans.set(span.span_id, span);

    // Notify span listeners
    this.notifySpanListeners(span);
  }

  private matchesFilter(log: LogEntry): boolean {
    const f = this.filter;

    // Level filter
    if (f.levels && f.levels.length > 0) {
      if (!f.levels.includes(log.level)) {
        return false;
      }
    }

    // Logger filter
    if (f.logger && log.logger !== f.logger) {
      return false;
    }

    // Trace ID filter
    if (f.trace_id && log.trace_id !== f.trace_id) {
      return false;
    }

    // Tool filter
    if (f.tool && log.tool !== f.tool) {
      return false;
    }

    // Search filter
    if (f.search) {
      const searchLower = f.search.toLowerCase();
      const messageMatch = log.message.toLowerCase().includes(searchLower);
      const toolMatch = log.tool?.toLowerCase().includes(searchLower);
      if (!messageMatch && !toolMatch) {
        return false;
      }
    }

    // Since filter
    if (f.since) {
      const logTime = new Date(log.timestamp);
      if (logTime < f.since) {
        return false;
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  setFilter(filter: LogFilter): void {
    this.filter = filter;
    this.sendFilter(filter);
  }

  private sendFilter(filter: LogFilter): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'filter',
          filter,
        })
      );
    }
  }

  clearFilter(): void {
    this.filter = {};
    this.sendFilter({});
  }

  // ---------------------------------------------------------------------------
  // Event Listeners
  // ---------------------------------------------------------------------------

  onLog(callback: (log: LogEntry) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  onSpan(callback: (span: SpanEntry) => void): () => void {
    this.spanListeners.add(callback);
    return () => this.spanListeners.delete(callback);
  }

  onConnection(callback: (connected: boolean) => void): () => void {
    this.connectionListeners.add(callback);
    return () => this.connectionListeners.delete(callback);
  }

  private notifyLogListeners(log: LogEntry): void {
    this.listeners.forEach((cb) => {
      try {
        cb(log);
      } catch (e) {
        console.error('[LogStream] Listener error:', e);
      }
    });
  }

  private notifySpanListeners(span: SpanEntry): void {
    this.spanListeners.forEach((cb) => {
      try {
        cb(span);
      } catch (e) {
        console.error('[LogStream] Span listener error:', e);
      }
    });
  }

  private notifyConnectionListeners(connected: boolean): void {
    this.connectionListeners.forEach((cb) => {
      try {
        cb(connected);
      } catch (e) {
        console.error('[LogStream] Connection listener error:', e);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  getLogsByTraceId(traceId: string): LogEntry[] {
    return this.logs.filter((log) => log.trace_id === traceId);
  }

  getSpansByTraceId(traceId: string): SpanEntry[] {
    return Array.from(this.spans.values()).filter(
      (span) => span.trace_id === traceId
    );
  }

  getSpan(spanId: string): SpanEntry | undefined {
    return this.spans.get(spanId);
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  clear(): void {
    this.logs = [];
    this.spans.clear();
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: LogStream | null = null;

export function getLogStream(options?: LogStreamOptions): LogStream {
  if (!instance) {
    instance = new LogStream(options);
  }
  return instance;
}

// =============================================================================
// React Hook Helper
// =============================================================================

export function subscribeToLogs(
  onLog: (log: LogEntry) => void,
  options?: LogStreamOptions
): () => void {
  const stream = getLogStream(options);

  if (!stream.isConnected()) {
    stream.connect();
  }

  const unsubscribe = stream.onLog(onLog);

  return () => {
    unsubscribe();
    // Don't disconnect - other components might be using it
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

export function formatLogLevel(level: LogLevel): string {
  return level.padEnd(5);
}

export function getLevelColor(level: LogLevel): string {
  switch (level) {
    case 'TRACE':
      return '#888888';
    case 'DEBUG':
      return '#6B7280';
    case 'INFO':
      return '#3B82F6';
    case 'WARN':
      return BRAND_COLORS.amber;
    case 'ERROR':
      return '#EF4444';
    case 'FATAL':
      return '#DC2626';
    default:
      return '#9CA3AF';
  }
}

export function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch {
    return timestamp;
  }
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}m`;
}
