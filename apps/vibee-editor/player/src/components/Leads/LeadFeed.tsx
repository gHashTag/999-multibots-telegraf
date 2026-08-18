// ===============================
// LeadFeed Component
// List of leads with filters
// ===============================

import { useCallback, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { Search, Filter, RefreshCw, CheckCheck } from 'lucide-react';
import { LeadCard } from './LeadCard';
import {
  filteredLeadsAtom,
  leadsStatusFilterAtom,
  leadsIntentFilterAtom,
  leadsSearchAtom,
  leadsLoadingAtom,
  unreadLeadsCountAtom,
  markAllLeadsReadAtom,
  selectedLeadAtom,
  updateLeadAtom,
  replyModalAtom,
  type Lead,
  type LeadStatus,
  type LeadIntent,
  type LeadAction,
  sendLeadAction,
} from '@/atoms/leads';
import { useLeadsWebSocket } from '@/hooks/useLeadsWebSocket';
import { useLanguage } from '@/hooks/useLanguage';
import './LeadFeed.css';

interface LeadFeedProps {
  onLeadSelect?: (lead: Lead) => void;
}

export function LeadFeed({ onLeadSelect }: LeadFeedProps) {
  const { lang } = useLanguage();
  const leads = useAtomValue(filteredLeadsAtom);
  const loading = useAtomValue(leadsLoadingAtom);
  const unreadCount = useAtomValue(unreadLeadsCountAtom);

  const [statusFilter, setStatusFilter] = useAtom(leadsStatusFilterAtom);
  const [intentFilter, setIntentFilter] = useAtom(leadsIntentFilterAtom);
  const [searchQuery, setSearchQuery] = useAtom(leadsSearchAtom);

  const markAllRead = useSetAtom(markAllLeadsReadAtom);
  const setSelectedLead = useSetAtom(selectedLeadAtom);
  const updateLead = useSetAtom(updateLeadAtom);
  const setReplyModal = useSetAtom(replyModalAtom);

  const { allowChat, blockChat, muteChat, isConnected } = useLeadsWebSocket();

  // Handle lead action
  const handleAction = useCallback(async (leadId: string, action: LeadAction) => {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Optimistic update
    switch (action) {
      case 'allow':
        updateLead({ id: leadId, updates: { status: 'contacted' } });
        allowChat(lead.chatId);
        break;
      case 'block':
        updateLead({ id: leadId, updates: { status: 'blocked' } });
        blockChat(lead.chatId);
        break;
      case 'mute':
        updateLead({ id: leadId, updates: { isMuted: true, muteUntil: new Date(Date.now() + 3600000).toISOString() } });
        muteChat(lead.chatId, 60);
        break;
    }
  }, [leads, updateLead, allowChat, blockChat, muteChat]);

  // Handle reply
  const handleReply = useCallback((lead: Lead) => {
    setReplyModal({
      leadId: lead.id,
      chatId: lead.chatId,
      messageId: lead.messageId,
    });
  }, [setReplyModal]);

  // Handle lead click
  const handleLeadClick = useCallback((lead: Lead) => {
    setSelectedLead(lead);
    updateLead({ id: lead.id, updates: { isRead: true } });
    onLeadSelect?.(lead);
  }, [setSelectedLead, updateLead, onLeadSelect]);

  // Status filter options
  const statusOptions: { value: LeadStatus | 'all'; label: string }[] = useMemo(() => [
    { value: 'all', label: lang === 'ru' ? 'Все' : 'All' },
    { value: 'new', label: lang === 'ru' ? 'Новые' : 'New' },
    { value: 'contacted', label: lang === 'ru' ? 'Связались' : 'Contacted' },
    { value: 'qualified', label: lang === 'ru' ? 'Квалифицир.' : 'Qualified' },
    { value: 'won', label: lang === 'ru' ? 'Успех' : 'Won' },
    { value: 'blocked', label: lang === 'ru' ? 'Заблокир.' : 'Blocked' },
  ], [lang]);

  // Intent filter options
  const intentOptions: { value: LeadIntent | 'all'; label: string }[] = useMemo(() => [
    { value: 'all', label: lang === 'ru' ? 'Все' : 'All' },
    { value: 'purchase', label: lang === 'ru' ? 'Покупка' : 'Purchase' },
    { value: 'sale', label: lang === 'ru' ? 'Продажа' : 'Sale' },
    { value: 'exchange', label: lang === 'ru' ? 'Обмен' : 'Exchange' },
    { value: 'question', label: lang === 'ru' ? 'Вопрос' : 'Question' },
  ], [lang]);

  return (
    <div className="lead-feed">
      {/* Header with filters */}
      <div className="lead-feed-header">
        {/* Search */}
        <div className="lead-feed-search">
          <Search size={16} />
          <input
            type="text"
            placeholder={lang === 'ru' ? 'Поиск по лидам...' : 'Search leads...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="lead-feed-filters">
          <div className="lead-feed-filter">
            <Filter size={14} />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'all')}
              data-testid="status-filter"
            >
              {statusOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="lead-feed-filter">
            <select
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value as LeadIntent | 'all')}
              data-testid="intent-filter"
            >
              {intentOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="lead-feed-actions">
          {unreadCount > 0 && (
            <button
              className="lead-feed-mark-read"
              onClick={() => markAllRead()}
              title={lang === 'ru' ? 'Отметить все прочитанными' : 'Mark all as read'}
            >
              <CheckCheck size={16} />
              <span className="lead-feed-unread-count">{unreadCount}</span>
            </button>
          )}

          <span className={`lead-feed-ws-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢' : '🔴'}
          </span>
        </div>
      </div>

      {/* Lead list */}
      <div className="lead-feed-list">
        {loading ? (
          <div className="lead-feed-loading">
            <RefreshCw size={24} className="spin" />
            <span>{lang === 'ru' ? 'Загрузка...' : 'Loading...'}</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="lead-feed-empty">
            <span className="lead-feed-empty-icon">📥</span>
            <span className="lead-feed-empty-text">
              {searchQuery || statusFilter !== 'all' || intentFilter !== 'all'
                ? (lang === 'ru' ? 'Лиды не найдены' : 'No leads found')
                : (lang === 'ru' ? 'Нет новых лидов' : 'No new leads')
              }
            </span>
            <span className="lead-feed-empty-hint">
              {lang === 'ru'
                ? 'Лиды появятся здесь когда кто-то напишет триггер-слово'
                : 'Leads will appear here when someone writes a trigger word'
              }
            </span>
          </div>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onAction={handleAction}
              onClick={handleLeadClick}
              onReply={handleReply}
            />
          ))
        )}
      </div>

      {/* Stats bar */}
      {leads.length > 0 && (
        <div className="lead-feed-stats">
          <span>
            {lang === 'ru' ? 'Показано' : 'Showing'} {leads.length} {lang === 'ru' ? 'лидов' : 'leads'}
          </span>
        </div>
      )}
    </div>
  );
}
