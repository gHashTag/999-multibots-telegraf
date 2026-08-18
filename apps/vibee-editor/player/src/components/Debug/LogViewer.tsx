import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import type { LogEntry, LogLevel, LogFilter } from '../../lib/logStream';
import { getLogStream, getLevelColor, formatTimestamp } from '../../lib/logStream';
import { STATUS_COLORS, BG_COLORS } from '@vibee/atoms';

// =============================================================================
// Types
// =============================================================================

interface LogViewerProps {
  className?: string;
  maxHeight?: string;
  onTraceClick?: (traceId: string) => void;
}

// =============================================================================
// Styles
// =============================================================================

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: BG_COLORS.elevated,
    color: '#e0e0e0',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '12px',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
    backgroundColor: '#222',
    flexShrink: 0,
  },
  filterButton: {
    padding: '4px 8px',
    backgroundColor: '#333',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '11px',
  },
  filterButtonActive: {
    backgroundColor: STATUS_COLORS.info,
    borderColor: STATUS_COLORS.info,
  },
  searchInput: {
    flex: 1,
    padding: '6px 10px',
    backgroundColor: '#333',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '11px',
    outline: 'none',
  },
  clearButton: {
    padding: '4px 8px',
    backgroundColor: STATUS_COLORS.error,
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '11px',
  },
  logContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
  },
  logLine: {
    display: 'flex',
    padding: '2px 12px',
    lineHeight: '1.4',
    borderBottom: `1px solid ${BG_COLORS.secondary}`,
  },
  logLineHover: {
    backgroundColor: BG_COLORS.secondary,
  },
  timestamp: {
    color: '#6B7280',
    marginRight: '8px',
    whiteSpace: 'nowrap' as const,
    minWidth: '85px',
  },
  level: {
    marginRight: '8px',
    fontWeight: 600,
    minWidth: '45px',
  },
  logger: {
    color: '#9CA3AF',
    marginRight: '8px',
    minWidth: '60px',
  },
  message: {
    flex: 1,
    wordBreak: 'break-word' as const,
  },
  traceId: {
    color: '#8B5CF6',
    marginLeft: '8px',
    cursor: 'pointer',
    opacity: 0.8,
    fontSize: '10px',
  },
  tool: {
    color: STATUS_COLORS.success,
    marginLeft: '8px',
    fontSize: '10px',
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '4px 12px',
    borderTop: '1px solid #333',
    backgroundColor: '#222',
    fontSize: '10px',
    color: '#6B7280',
  },
  connectionDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    marginRight: '6px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#6B7280',
    padding: '20px',
  },
};

// =============================================================================
// Component
// =============================================================================

export function LogViewer({ className, maxHeight, onTraceClick }: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<LogFilter>({});
  const [search, setSearch] = useState('');
  const [activeLevel, setActiveLevel] = useState<LogLevel | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hoveredLine, setHoveredLine] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const logStream = useMemo(() => getLogStream(), []);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Connect to log stream
    logStream.connect();

    // Subscribe to logs
    const unsubscribeLog = logStream.onLog((log) => {
      setLogs((prev) => [log, ...prev].slice(0, 500));
    });

    // Subscribe to connection status
    const unsubscribeConnection = logStream.onConnection((isConnected) => {
      setConnected(isConnected);
    });

    return () => {
      unsubscribeLog();
      unsubscribeConnection();
    };
  }, [logStream]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = 0; // Logs are reversed, so scroll to top
    }
  }, [logs, autoScroll]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleLevelClick = useCallback((level: LogLevel) => {
    setActiveLevel((prev) => (prev === level ? null : level));
    setFilter((prev) => ({
      ...prev,
      levels: prev.levels?.includes(level)
        ? prev.levels.filter((l) => l !== level)
        : [...(prev.levels || []), level],
    }));
  }, []);

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setFilter((prev) => ({ ...prev, search: value || undefined }));
  }, []);

  const handleClear = useCallback(() => {
    setLogs([]);
    logStream.clear();
  }, [logStream]);

  const handleTraceClick = useCallback((traceId: string) => {
    if (onTraceClick) {
      onTraceClick(traceId);
    } else {
      // Default: filter by trace
      setFilter((prev) => ({
        ...prev,
        trace_id: prev.trace_id === traceId ? undefined : traceId,
      }));
    }
  }, [onTraceClick]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Level filter
      if (filter.levels && filter.levels.length > 0) {
        if (!filter.levels.includes(log.level)) return false;
      }

      // Trace filter
      if (filter.trace_id && log.trace_id !== filter.trace_id) {
        return false;
      }

      // Search filter
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const messageMatch = log.message.toLowerCase().includes(searchLower);
        const toolMatch = log.tool?.toLowerCase().includes(searchLower);
        const loggerMatch = log.logger.toLowerCase().includes(searchLower);
        if (!messageMatch && !toolMatch && !loggerMatch) return false;
      }

      return true;
    });
  }, [logs, filter]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

  return (
    <div style={{ ...styles.container, maxHeight }} className={className}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        {levels.map((level) => (
          <button
            key={level}
            style={{
              ...styles.filterButton,
              ...(filter.levels?.includes(level) ? styles.filterButtonActive : {}),
              color: filter.levels?.includes(level) ? 'white' : getLevelColor(level),
            }}
            onClick={() => handleLevelClick(level)}
          >
            {level}
          </button>
        ))}
        <input
          type="text"
          placeholder="Search logs..."
          value={search}
          onChange={handleSearchChange}
          style={styles.searchInput}
        />
        {filter.trace_id && (
          <button
            style={{ ...styles.filterButton, backgroundColor: '#8B5CF6' }}
            onClick={() => setFilter((prev) => ({ ...prev, trace_id: undefined }))}
          >
            Trace: {filter.trace_id.slice(0, 8)}... x
          </button>
        )}
        <button style={styles.clearButton} onClick={handleClear}>
          Clear
        </button>
      </div>

      {/* Log Container */}
      <div ref={containerRef} style={styles.logContainer}>
        {filteredLogs.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>
              {connected ? '📋' : '🔌'}
            </div>
            <div>
              {connected
                ? 'No logs yet. Waiting for activity...'
                : 'Connecting to log server...'}
            </div>
          </div>
        ) : (
          filteredLogs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              style={{
                ...styles.logLine,
                ...(hoveredLine === index ? styles.logLineHover : {}),
              }}
              onMouseEnter={() => setHoveredLine(index)}
              onMouseLeave={() => setHoveredLine(null)}
            >
              <span style={styles.timestamp}>{formatTimestamp(log.timestamp)}</span>
              <span style={{ ...styles.level, color: getLevelColor(log.level) }}>
                {log.level}
              </span>
              <span style={styles.logger}>[{log.logger}]</span>
              <span style={styles.message}>{log.message}</span>
              {log.tool && <span style={styles.tool}>@{log.tool}</span>}
              {log.trace_id && (
                <span
                  style={styles.traceId}
                  onClick={() => handleTraceClick(log.trace_id!)}
                  title={`Trace: ${log.trace_id}`}
                >
                  [{log.trace_id.slice(0, 8)}]
                </span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Status Bar */}
      <div style={styles.statusBar}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              ...styles.connectionDot,
              backgroundColor: connected ? STATUS_COLORS.success : STATUS_COLORS.error,
            }}
          />
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
        <div>
          {filteredLogs.length} / {logs.length} logs
          {filter.trace_id && ' (filtered by trace)'}
        </div>
        <div>
          <label style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              style={{ marginRight: '4px' }}
            />
            Auto-scroll
          </label>
        </div>
      </div>
    </div>
  );
}

export default LogViewer;
