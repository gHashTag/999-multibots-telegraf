// ===============================
// Direct Messages
// Instagram-style DM system
// ===============================

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAtom } from 'jotai';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  X, Send, Image, Smile, MoreHorizontal,
  Check, CheckCheck, ArrowLeft, Search,
  Video, Mic, Heart
} from 'lucide-react';
import { useLanguage } from '@/hooks/useLanguage';
import { formatDistanceToNow } from '@/lib/dateUtils';
import './DirectMessages.css';

// Types
export interface Message {
  id: string;
  senderId: number;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  replyTo?: string;
  isRead: boolean;
  createdAt: string;
  reactions?: string[];
}

export interface Conversation {
  id: string;
  participantId: number;
  participantName: string;
  participantUsername?: string;
  participantAvatar?: string;
  lastMessage?: Message;
  unreadCount: number;
  updatedAt: string;
}

// Atoms
export const conversationsAtom = atomWithStorage<Conversation[]>('vibee-conversations', []);
export const messagesAtom = atomWithStorage<Record<string, Message[]>>('vibee-messages', {});
export const activeConversationAtom = atom<string | null>(null);

export const totalUnreadAtom = atom((get) => {
  const conversations = get(conversationsAtom);
  return conversations.reduce((sum, c) => sum + c.unreadCount, 0);
});

interface DirectMessagesProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId: number;
}

export function DirectMessages({ isOpen, onClose, currentUserId }: DirectMessagesProps) {
  const { t } = useLanguage();
  const [conversations, setConversations] = useAtom(conversationsAtom);
  const [allMessages, setAllMessages] = useAtom(messagesAtom);
  const [activeConversationId, setActiveConversationId] = useAtom(activeConversationAtom);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const messages = activeConversationId ? allMessages[activeConversationId] || [] : [];

  // Filter conversations
  const filteredConversations = searchQuery
    ? conversations.filter(c =>
        c.participantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.participantUsername?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  // Scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when conversation opens
  useEffect(() => {
    if (activeConversationId) {
      inputRef.current?.focus();
    }
  }, [activeConversationId]);

  // Send message
  const handleSend = useCallback(() => {
    if (!messageText.trim() || !activeConversationId) return;

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      senderId: currentUserId,
      text: messageText.trim(),
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    setAllMessages(prev => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), newMessage],
    }));

    setConversations(prev => prev.map(c =>
      c.id === activeConversationId
        ? { ...c, lastMessage: newMessage, updatedAt: newMessage.createdAt }
        : c
    ));

    setMessageText('');
  }, [messageText, activeConversationId, currentUserId, setAllMessages, setConversations]);

  // Mark as read
  const handleOpenConversation = useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setConversations(prev => prev.map(c =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    ));
  }, [setActiveConversationId, setConversations]);

  if (!isOpen) return null;

  return (
    <div className="dm-overlay" onClick={onClose}>
      <div className="dm-container" onClick={e => e.stopPropagation()}>
        {/* Conversations List */}
        {!activeConversationId && (
          <div className="dm-list">
            <div className="dm-header">
              <h2>{t('messages.title')}</h2>
              <button className="dm-close" onClick={onClose}>
                <X size={20} />
              </button>
            </div>

            <div className="dm-search">
              <Search size={18} />
              <input
                type="text"
                placeholder={t('messages.search')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="dm-conversations">
              {filteredConversations.length === 0 ? (
                <div className="dm-empty">
                  <Send size={48} strokeWidth={1} />
                  <p>{t('messages.empty')}</p>
                </div>
              ) : (
                filteredConversations.map(conversation => (
                  <button
                    key={conversation.id}
                    className={`dm-conversation ${conversation.unreadCount > 0 ? 'dm-conversation--unread' : ''}`}
                    onClick={() => handleOpenConversation(conversation.id)}
                  >
                    <div className="dm-conversation__avatar">
                      {conversation.participantAvatar ? (
                        <img src={conversation.participantAvatar} alt="" />
                      ) : (
                        <span>{conversation.participantName[0]}</span>
                      )}
                      {conversation.unreadCount > 0 && (
                        <span className="dm-conversation__badge">{conversation.unreadCount}</span>
                      )}
                    </div>
                    <div className="dm-conversation__content">
                      <div className="dm-conversation__header">
                        <span className="dm-conversation__name">{conversation.participantName}</span>
                        <span className="dm-conversation__time">
                          {formatDistanceToNow(conversation.updatedAt)}
                        </span>
                      </div>
                      {conversation.lastMessage && (
                        <p className="dm-conversation__preview">
                          {conversation.lastMessage.senderId === currentUserId && 'You: '}
                          {conversation.lastMessage.text || '📷 Photo'}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Chat View */}
        {activeConversationId && activeConversation && (
          <div className="dm-chat">
            <div className="dm-chat__header">
              <button className="dm-back" onClick={() => setActiveConversationId(null)}>
                <ArrowLeft size={20} />
              </button>
              <div className="dm-chat__user">
                <div className="dm-chat__avatar">
                  {activeConversation.participantAvatar ? (
                    <img src={activeConversation.participantAvatar} alt="" />
                  ) : (
                    <span>{activeConversation.participantName[0]}</span>
                  )}
                </div>
                <div>
                  <span className="dm-chat__name">{activeConversation.participantName}</span>
                  {activeConversation.participantUsername && (
                    <span className="dm-chat__username">@{activeConversation.participantUsername}</span>
                  )}
                </div>
              </div>
              <button className="dm-more">
                <MoreHorizontal size={20} />
              </button>
            </div>

            <div className="dm-messages">
              {messages.map(message => (
                <div
                  key={message.id}
                  className={`dm-message ${message.senderId === currentUserId ? 'dm-message--own' : ''}`}
                >
                  {message.imageUrl && (
                    <img src={message.imageUrl} alt="" className="dm-message__image" />
                  )}
                  {message.text && (
                    <p className="dm-message__text">{message.text}</p>
                  )}
                  <div className="dm-message__meta">
                    <span className="dm-message__time">
                      {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {message.senderId === currentUserId && (
                      <span className="dm-message__status">
                        {message.isRead ? <CheckCheck size={14} /> : <Check size={14} />}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="dm-input">
              <button className="dm-input__btn">
                <Image size={22} />
              </button>
              <input
                ref={inputRef}
                type="text"
                placeholder={t('messages.placeholder')}
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleSend()}
              />
              {messageText.trim() ? (
                <button className="dm-input__send" onClick={handleSend}>
                  <Send size={20} />
                </button>
              ) : (
                <>
                  <button className="dm-input__btn">
                    <Mic size={22} />
                  </button>
                  <button className="dm-input__btn">
                    <Heart size={22} />
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Message button with unread badge
export function MessageButton({ onClick }: { onClick: () => void }) {
  const [conversations] = useAtom(conversationsAtom);
  const unreadCount = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <button className="message-button" onClick={onClick}>
      <Send size={24} />
      {unreadCount > 0 && (
        <span className="message-button__badge">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
