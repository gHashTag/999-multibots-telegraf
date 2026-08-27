// ===============================
// LeadsDashboard Page (was Search)
// Command Center for Telegram Leads
// ===============================

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Inbox, BarChart3, Zap, Film, X, Send, Radio, PlugZap } from 'lucide-react';
import { Header } from '@/components/Header';
import { leadsBackendAtom } from '@/atoms/leads';
import { LeadFeed } from '@/components/Leads/LeadFeed';
import { AccountSelector } from '@/components/Leads/AccountSelector';
import { EventStream } from '@/components/Leads/EventStream';
import {
  leadsTabAtom,
  replyModalAtom,
  activeSessionAtom,
  selectedLeadAtom,
  type LeadsTab,
  sendReplyMessage,
} from '@/atoms/leads';
import { useLeadsWebSocket } from '@/hooks/useLeadsWebSocket';
import { useLanguage } from '@/hooks/useLanguage';
import { useIsMobile } from '@/hooks/useMediaQuery';
import './Search.css';

// Lazy load advanced components
// const LeadsAnalytics = lazy(() => import('@/components/Leads/LeadsAnalytics'));
// const TriggerManager = lazy(() => import('@/components/Leads/TriggerManager'));
// const ContentCreator = lazy(() => import('@/components/Leads/ContentCreator'));

function LeadsDashboardContent() {
  const { lang } = useLanguage();
  const isMobile = useIsMobile();

  const [activeTab, setActiveTab] = useAtom(leadsTabAtom);
  const [replyModal, setReplyModal] = useAtom(replyModalAtom);
  const activeSession = useAtomValue(activeSessionAtom);
  const backendOk = useAtomValue(leadsBackendAtom);
  const selectedLead = useAtomValue(selectedLeadAtom);

  const { isConnected, replyToChat } = useLeadsWebSocket();

  // Reply modal state
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);

  // Handle reply submit
  const handleReplySubmit = useCallback(async () => {
    if (!replyModal || !replyText.trim() || !activeSession) return;

    setReplySending(true);
    try {
      const success = await sendReplyMessage(
        activeSession,
        replyModal.chatId,
        replyText,
        replyModal.messageId
      );

      if (success) {
        setReplyText('');
        setReplyModal(null);
      }
    } finally {
      setReplySending(false);
    }
  }, [replyModal, replyText, activeSession, setReplyModal]);

  // Close reply modal on escape
  useEffect(() => {
    if (!replyModal) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReplyModal(null);
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleReplySubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [replyModal, setReplyModal, handleReplySubmit]);

  // Tab labels - Events first
  const tabs: { id: LeadsTab; icon: React.ReactNode; label: string }[] = [
    { id: 'events', icon: <Radio size={18} />, label: lang === 'ru' ? 'События' : 'Events' },
    { id: 'leads', icon: <Inbox size={18} />, label: lang === 'ru' ? 'Лиды' : 'Leads' },
    { id: 'stats', icon: <BarChart3 size={18} />, label: lang === 'ru' ? 'Статистика' : 'Stats' },
    { id: 'triggers', icon: <Zap size={18} />, label: lang === 'ru' ? 'Триггеры' : 'Triggers' },
    { id: 'content', icon: <Film size={18} />, label: lang === 'ru' ? 'Контент' : 'Content' },
  ];

  return (
    <div className="leads-dashboard">
      <Header />

      {/* Account Bar */}
      <div className="leads-account-bar">
        <AccountSelector />
        <div className="leads-ws-indicator">
          <span className={`leads-ws-dot ${isConnected ? 'connected' : 'disconnected'}`} />
          <span className="leads-ws-text">
            {isConnected
              ? (lang === 'ru' ? 'Подключено' : 'Connected')
              : (lang === 'ru' ? 'Отключено' : 'Disconnected')
            }
          </span>
        </div>
      </div>

      {/* Main Content */}
      <main className="leads-main">
        {/* Sidebar Tabs (Desktop) or Bottom Tabs (Mobile) */}
        {!isMobile && (
          <aside className="leads-sidebar">
            <div className="sidebar-content-tabs">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`content-tab ${activeTab === tab.id ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </aside>
        )}

        {/* Tab Content */}
        <section className="leads-content">
          {backendOk === false && (
            /**
             * ЧЕСТНОЕ СОСТОЯНИЕ РАЗДЕЛА.
             *
             * Все девять запросов лидов заканчиваются `catch → return []`, и
             * без этой панели экран показывал ПУСТЫЕ списки. Для человека
             * пустой список значит «лидов пока нет» — то есть интерфейс не
             * просто молчал о поломке, он подсказывал НЕВЕРНОЕ объяснение и
             * оставлял ждать того, чему неоткуда взяться.
             *
             * На сервере ни одного из этих адресов нет (проверено сверкой
             * check-routes.mjs). Пустота была не про данные, а про
             * отсутствие ручек — так и говорим.
             */
            <div className="leads-unavailable">
              <PlugZap size={40} />
              <h2>
                {lang === 'ru'
                  ? 'Раздел лидов не подключён к серверу'
                  : 'Leads are not connected to the server'}
              </h2>
              <p>
                {lang === 'ru'
                  ? 'Это не значит, что лидов нет — их просто негде взять: ' +
                    'нужных ручек на сервере пока не существует. Пустые ' +
                    'списки ниже показывать не будем, чтобы не вводить в ' +
                    'заблуждение.'
                  : 'It does not mean you have no leads — there is simply ' +
                    'nowhere to get them from: the server endpoints do not ' +
                    'exist yet.'}
              </p>
            </div>
          )}
          <Suspense fallback={<div className="leads-loading">Loading...</div>}>
            {backendOk !== false && activeTab === 'events' && (
              <EventStream maxHeight={600} />
            )}
            {backendOk !== false && activeTab === 'leads' && <LeadFeed />}
            {activeTab === 'stats' && (
              <div className="leads-placeholder">
                <BarChart3 size={48} />
                <span>{lang === 'ru' ? 'Аналитика скоро' : 'Analytics coming soon'}</span>
              </div>
            )}
            {activeTab === 'triggers' && (
              <div className="leads-placeholder">
                <Zap size={48} />
                <span>{lang === 'ru' ? 'Триггеры скоро' : 'Triggers coming soon'}</span>
              </div>
            )}
            {activeTab === 'content' && (
              <div className="leads-placeholder">
                <Film size={48} />
                <span>{lang === 'ru' ? 'Контент-креатор скоро' : 'Content Creator coming soon'}</span>
              </div>
            )}
          </Suspense>
        </section>
      </main>

      {/* Mobile Bottom Tabs */}
      {isMobile && (
        <nav className="leads-bottom-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`leads-bottom-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* Reply Modal */}
      {replyModal && (
        <div className="leads-reply-overlay" onClick={() => setReplyModal(null)}>
          <div className="leads-reply-modal" onClick={e => e.stopPropagation()}>
            <div className="leads-reply-header">
              <span>{lang === 'ru' ? 'Ответить' : 'Reply'}</span>
              <button className="leads-reply-close" onClick={() => setReplyModal(null)}>
                <X size={18} />
              </button>
            </div>
            <textarea
              className="leads-reply-input"
              placeholder={lang === 'ru' ? 'Введите сообщение...' : 'Type your message...'}
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              autoFocus
              rows={4}
            />
            <div className="leads-reply-actions">
              <button
                className="leads-reply-cancel"
                onClick={() => setReplyModal(null)}
              >
                {lang === 'ru' ? 'Отмена' : 'Cancel'}
              </button>
              <button
                className="leads-reply-send"
                onClick={handleReplySubmit}
                disabled={!replyText.trim() || replySending}
              >
                <Send size={16} />
                <span>{replySending ? '...' : (lang === 'ru' ? 'Отправить' : 'Send')}</span>
              </button>
            </div>
            <div className="leads-reply-hint">
              <span>⌘+Enter {lang === 'ru' ? 'для отправки' : 'to send'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchPage() {
  return <LeadsDashboardContent />;
}

export default SearchPage;
