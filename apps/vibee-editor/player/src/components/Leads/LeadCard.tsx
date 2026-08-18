// ===============================
// LeadCard Component
// Display a single lead with actions
// ===============================

import { useState, useCallback } from 'react';
import { Check, X, MessageSquare, BellOff, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Lead, LeadAction } from '@/atoms/leads';
import { useLanguage } from '@/hooks/useLanguage';
import './LeadCard.css';

// Format chat title - show readable name instead of raw chat_id
function formatChatTitle(title: string): string {
  if (!title) return 'Unknown Chat';
  // If it looks like a raw chat_id (starts with - and has only digits)
  if (/^-?\d+$/.test(title)) {
    return `Chat ${title.slice(-6)}`; // Show last 6 digits
  }
  return title;
}

// Format message text - handle escaped newlines
function formatMessageText(text: string): string {
  if (!text) return '';
  // Replace literal \n with actual newlines, then trim
  return text.replace(/\\n/g, '\n').trim();
}

interface LeadCardProps {
  lead: Lead;
  onAction: (leadId: string, action: LeadAction, payload?: any) => void;
  onClick?: (lead: Lead) => void;
  onReply?: (lead: Lead) => void;
}

export function LeadCard({ lead, onAction, onClick, onReply }: LeadCardProps) {
  const { lang } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const [actionLoading, setActionLoading] = useState<LeadAction | null>(null);

  const handleAction = useCallback(async (e: React.MouseEvent, action: LeadAction) => {
    e.stopPropagation();
    setActionLoading(action);
    try {
      await onAction(lead.id, action);
    } finally {
      setActionLoading(null);
    }
  }, [lead.id, onAction]);

  const handleReply = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onReply?.(lead);
  }, [lead, onReply]);

  const handleClick = useCallback(() => {
    onClick?.(lead);
  }, [lead, onClick]);

  const handleOpenChat = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // Open Telegram deep link
    // For supergroups (start with -100), convert to t.me/c/ format
    // -1001165767969 → abs(1001165767969) - 1000000000000 → 1165767969
    let chatIdForLink: number;
    const absId = Math.abs(lead.chatId);

    if (absId > 1000000000000) {
      // Supergroup: remove the 100 prefix
      chatIdForLink = absId - 1000000000000;
    } else {
      chatIdForLink = absId;
    }

    const url = lead.messageId
      ? `https://telegram.me/c/${chatIdForLink}/${lead.messageId}`
      : `https://telegram.me/c/${chatIdForLink}`;

    console.log('[LeadCard] Opening:', url, 'from chatId:', lead.chatId, 'messageId:', lead.messageId);
    window.open(url, '_blank');
  }, [lead]);

  // Get quality level for badge color
  const qualityLevel = lead.quality >= 7 ? 'high' : lead.quality >= 4 ? 'medium' : 'low';

  // Format time ago
  const timeAgo = formatDistanceToNow(new Date(lead.createdAt), {
    addSuffix: true,
    locale: lang === 'ru' ? ru : undefined,
  });

  // Get initials for avatar fallback
  const initials = lead.fromDisplayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Intent label
  const intentLabels: Record<Lead['intent'], string> = {
    purchase: lang === 'ru' ? 'Покупка' : 'Purchase',
    sale: lang === 'ru' ? 'Продажа' : 'Sale',
    exchange: lang === 'ru' ? 'Обмен' : 'Exchange',
    question: lang === 'ru' ? 'Вопрос' : 'Question',
    support: lang === 'ru' ? 'Помощь' : 'Support',
    spam: 'Spam',
    unknown: lang === 'ru' ? 'Общее' : 'General',
  };

  // Status label
  const statusLabels: Record<Lead['status'], string> = {
    new: lang === 'ru' ? 'Новый' : 'New',
    contacted: lang === 'ru' ? 'Связались' : 'Contacted',
    qualified: lang === 'ru' ? 'Квалифицирован' : 'Qualified',
    won: lang === 'ru' ? 'Успех' : 'Won',
    lost: lang === 'ru' ? 'Потерян' : 'Lost',
    blocked: lang === 'ru' ? 'Заблокирован' : 'Blocked',
  };

  return (
    <div
      className={`lead-card ${!lead.isRead ? 'lead-card--unread' : ''} ${lead.status === 'blocked' ? 'lead-card--blocked' : ''}`}
      onClick={handleClick}
      data-testid="lead-card"
    >
      {/* Avatar */}
      <div className="lead-card-avatar">
        {lead.fromAvatar ? (
          <img src={lead.fromAvatar} alt={lead.fromDisplayName} />
        ) : (
          <span className="lead-card-initials">{initials}</span>
        )}
        {lead.urgency === 'high' && <span className="lead-card-urgency-dot" />}
      </div>

      {/* Content */}
      <div className="lead-card-content">
        {/* Header: Name, Username, Chat */}
        <div className="lead-card-header">
          <span className="lead-card-name">{lead.fromDisplayName}</span>
          {lead.fromUsername && (
            <span className="lead-card-username">@{lead.fromUsername}</span>
          )}
          <span className="lead-card-chat" title={lead.chatTitle}>
            {formatChatTitle(lead.chatTitle)}
          </span>
        </div>

        {/* Message Preview */}
        <div
          className={`lead-card-message ${isExpanded ? 'lead-card-message--expanded' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          {formatMessageText(lead.messageText)}
        </div>

        {/* Badges Row */}
        <div className="lead-card-badges">
          {/* Quality Badge */}
          <span className={`lead-card-badge lead-card-badge--quality-${qualityLevel}`} data-testid="quality-badge">
            {lead.quality}/10
          </span>

          {/* Intent Badge */}
          <span className="lead-card-badge lead-card-badge--intent">
            {intentLabels[lead.intent]}
          </span>

          {/* Trigger Badge */}
          {lead.triggerWord && (
            <span className="lead-card-badge lead-card-badge--trigger">
              {lead.triggerWord}
            </span>
          )}

          {/* Status Badge (if not new) */}
          {lead.status !== 'new' && (
            <span className={`lead-card-badge lead-card-badge--status-${lead.status}`} data-testid="status-badge">
              {statusLabels[lead.status]}
            </span>
          )}
        </div>
      </div>

      {/* Right Side: Time + Actions */}
      <div className="lead-card-right">
        {/* Time */}
        <span className="lead-card-time">{timeAgo}</span>

        {/* Actions */}
        <div className="lead-card-actions">
          <button
            className="lead-card-action lead-card-action--allow"
            onClick={(e) => handleAction(e, 'allow')}
            disabled={actionLoading !== null}
            title={lang === 'ru' ? 'Разрешить' : 'Allow'}
          >
            {actionLoading === 'allow' ? (
              <span className="lead-card-action-spinner" />
            ) : (
              <Check size={14} />
            )}
          </button>

          <button
            className="lead-card-action lead-card-action--block"
            onClick={(e) => handleAction(e, 'block')}
            disabled={actionLoading !== null}
            title={lang === 'ru' ? 'Заблокировать' : 'Block'}
          >
            {actionLoading === 'block' ? (
              <span className="lead-card-action-spinner" />
            ) : (
              <X size={14} />
            )}
          </button>

          <button
            className="lead-card-action lead-card-action--reply"
            onClick={handleReply}
            disabled={actionLoading !== null}
            title={lang === 'ru' ? 'Ответить' : 'Reply'}
          >
            <MessageSquare size={14} />
          </button>

          <button
            className="lead-card-action lead-card-action--mute"
            onClick={(e) => handleAction(e, 'mute')}
            disabled={actionLoading !== null}
            title={lang === 'ru' ? 'Заглушить 1ч' : 'Mute 1h'}
          >
            {actionLoading === 'mute' ? (
              <span className="lead-card-action-spinner" />
            ) : (
              <BellOff size={14} />
            )}
          </button>

          <button
            className="lead-card-action lead-card-action--open"
            onClick={handleOpenChat}
            title={lang === 'ru' ? 'Открыть в Telegram' : 'Open in Telegram'}
          >
            <ExternalLink size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
