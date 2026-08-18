import { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { templatePropsAtom, selectedItemIdsAtom } from '@/atoms';
import {
  messagesAtom,
  isStreamingAtom,
  isChatConnectedAtom,
  agentContextAtom,
  addMessageAtom,
  addLogAtom,
  clearMessagesAtom,
  refreshWelcomeMessageAtom,
  setStreamingAtom,
  applyActionAtom,
  rejectActionAtom,
  updateContextAtom,
  initLogCapture,
  setLogCaptureFn,
} from '@/atoms/chat';
import { editorStore } from '@/atoms/Provider';
import { useLanguage } from '@/hooks/useLanguage';
import {
  initAgentConnection,
  disconnectAgent,
  sendToAgent,
  applyAgentAction,
  isAgentConnected,
} from '@/lib/agentApi';
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  CheckCircle,
  XCircle,
  Code,
  FileText,
  AlertCircle,
  Wifi,
  WifiOff,
  Sparkles,
  MessageSquare,
  Terminal,
} from 'lucide-react';
import { LogViewer } from '../Debug/LogViewer';
import './ChatPanel.css';

interface ChatPanelProps {
  wsConnected?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wsSend?: (data: any) => void;
}

type Tab = 'chat' | 'logs';

export function ChatPanel({ wsConnected, wsSend }: ChatPanelProps) {
  const { t, lang } = useLanguage();
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Chat atoms
  const messages = useAtomValue(messagesAtom);
  const isStreaming = useAtomValue(isStreamingAtom);
  const agentConnected = useAtomValue(isChatConnectedAtom);
  const context = useAtomValue(agentContextAtom);

  // Chat actions
  const addMessage = useSetAtom(addMessageAtom);
  const clearMessages = useSetAtom(clearMessagesAtom);
  const refreshWelcomeMessage = useSetAtom(refreshWelcomeMessageAtom);
  const setStreaming = useSetAtom(setStreamingAtom);
  const applyAction = useSetAtom(applyActionAtom);
  const rejectAction = useSetAtom(rejectActionAtom);
  const updateContext = useSetAtom(updateContextAtom);

  // Editor store for context
  const templateProps = useAtomValue(templatePropsAtom);
  const selectedItemIds = useAtomValue(selectedItemIdsAtom);

  // Refresh welcome message when language changes
  useEffect(() => {
    refreshWelcomeMessage();
  }, [lang, refreshWelcomeMessage]);

  // Initialize log capture and agent connection
  useEffect(() => {
    // Set up log capture function to use Jotai
    setLogCaptureFn((level, message) => {
      editorStore.set(addLogAtom, { level, message });
    });
    initLogCapture();
    initAgentConnection();

    return () => {
      disconnectAgent();
    };
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update context when props change
  useEffect(() => {
    updateContext({
      props: templateProps as unknown as Record<string, unknown>,
      selectedItems: selectedItemIds,
    });
  }, [templateProps, selectedItemIds, updateContext]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    // Add user message
    addMessage({ role: 'user', content: text });
    setInput('');
    setStreaming(true);

    try {
      // Send to Agent API if connected
      if (agentConnected || isAgentConnected()) {
        await sendToAgent(text);
      } else if (wsConnected && wsSend) {
        // Fallback to WebSocket if agent not connected but WS is
        wsSend({
          type: 'agent_chat',
          payload: {
            message: text,
            context: {
              logs: context.logs.slice(-50),
              props: templateProps,
              errors: context.errors.map((e) => e.message),
              template: context.currentTemplate,
              selectedItems: selectedItemIds,
            },
          },
        });
      } else {
        // No connection - show helpful message
        setTimeout(() => {
          addMessage({ role: 'assistant', content: t('chat.offlineMessage') });
          setStreaming(false);
        }, 500);
      }
    } catch (error) {
      console.error('[ChatPanel] Send error:', error);
      addMessage({ role: 'system', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` });
      setStreaming(false);
    }
  }, [input, isStreaming, agentConnected, wsConnected, wsSend, context, templateProps, selectedItemIds, addMessage, setStreaming, t]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleApplyAction = async (messageId: string, actionId: string) => {
    // Find the action
    const message = messages.find((m) => m.id === messageId);
    const action = message?.actions?.find((a) => a.id === actionId);

    if (action) {
      try {
        // Apply the action via Agent API
        await applyAgentAction(action);
        // Mark as applied in store
        applyAction({ messageId, actionId });
        addMessage({ role: 'system', content: `${t('chat.applied')} ${action.label}` });
      } catch (error) {
        console.error('[ChatPanel] Apply action error:', error);
        addMessage({ role: 'system', content: `${t('chat.failedToApply')} ${error instanceof Error ? error.message : t('chat.unknownError')}` });
      }
    }
  };

  const handleRejectAction = (messageId: string, actionId: string) => {
    rejectAction({ messageId, actionId });
  };

  // Connection status - prefer agent connection over WS
  const isConnected = agentConnected || wsConnected;

  // Context counts
  const logCount = context.logs.length;
  const errorCount = context.errors.length;
  const propsCount = Object.keys(templateProps).length;

  return (
    <div className="chat-panel">
      {/* Header with tabs */}
      <div className="agent-header">
        <div className="agent-header-left">
          <div className="agent-avatar">
            <Sparkles size={18} />
          </div>
          <div className="agent-header-info">
            <span className="agent-title">{t('chat.agent')}</span>
            <span className={`agent-status ${isConnected ? 'connected' : 'disconnected'}`}>
              {isConnected ? (
                <>
                  <Wifi size={10} /> {t('chat.connected')}
                </>
              ) : (
                <>
                  <WifiOff size={10} /> {t('chat.offline')}
                </>
              )}
            </span>
          </div>
        </div>
        <button className="agent-clear-btn" onClick={clearMessages} title={t('chat.clearChat')}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div className="chat-tabs">
        <button
          className={`chat-tab ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare size={14} />
          <span>{t('chat.chat')}</span>
        </button>
        <button
          className={`chat-tab ${activeTab === 'logs' ? 'active' : ''}`}
          onClick={() => setActiveTab('logs')}
        >
          <Terminal size={14} />
          <span>{t('chat.logs')}</span>
        </button>
      </div>

      {/* Context badges - only show in chat tab */}
      {activeTab === 'chat' && (
        <div className="chat-context">
          <div className="context-badge" title={`${logCount} ${t('chat.capturedLogs')}`}>
            <FileText size={12} />
            <span>{logCount} logs</span>
          </div>
          <div className="context-badge" title={`${propsCount} ${t('chat.templateProps')}`}>
            <Code size={12} />
            <span>{propsCount} props</span>
          </div>
          {errorCount > 0 && (
            <div className="context-badge error" title={`${errorCount} ${t('chat.errors')}`}>
              <AlertCircle size={12} />
              <span>{errorCount} {t('chat.errors')}</span>
            </div>
          )}
        </div>
      )}

      {/* Chat Tab Content */}
      {activeTab === 'chat' && (
        <>
          {/* Messages */}
          <div className="chat-messages">
            {messages.map((message) => (
              <div key={message.id} className={`chat-message ${message.role}`}>
                {message.role === 'assistant' && (
                  <div className="message-avatar">
                    <Bot size={14} />
                  </div>
                )}
                <div className="message-content">
                  <p className="message-text">{message.content}</p>

                  {/* Code block */}
                  {message.codeBlock && (
                    <div className="message-code">
                      <div className="code-header">
                        <span>{message.codeBlock.language}</span>
                      </div>
                      <pre>
                        <code>{message.codeBlock.code}</code>
                      </pre>
                    </div>
                  )}

                  {/* Actions */}
                  {message.actions && message.actions.length > 0 && (
                    <div className="message-actions">
                      {message.actions.map((action) => (
                        <div key={action.id} className={`action-item ${action.status}`}>
                          <span className="action-label">{action.label}</span>
                          {action.status === 'pending' && (
                            <div className="action-buttons">
                              <button
                                className="action-btn apply"
                                onClick={() => handleApplyAction(message.id, action.id)}
                              >
                                <CheckCircle size={14} />
                              </button>
                              <button
                                className="action-btn reject"
                                onClick={() => handleRejectAction(message.id, action.id)}
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
                          )}
                          {action.status === 'applied' && (
                            <CheckCircle size={14} className="action-status applied" />
                          )}
                          {action.status === 'rejected' && (
                            <XCircle size={14} className="action-status rejected" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Streaming indicator */}
            {isStreaming && (
              <div className="chat-message assistant streaming">
                <div className="message-avatar">
                  <Bot size={14} />
                </div>
                <div className="message-content">
                  <Loader2 size={16} className="spin" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              className="chat-input"
              placeholder={t('chat.placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={isStreaming}
            />
            <button
              className="chat-send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
            >
              {isStreaming ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            </button>
          </div>
        </>
      )}

      {/* Logs Tab Content */}
      {activeTab === 'logs' && (
        <div className="chat-logs-container">
          <LogViewer />
        </div>
      )}
    </div>
  );
}
