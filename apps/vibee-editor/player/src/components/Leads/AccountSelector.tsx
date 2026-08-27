// ===============================
// AccountSelector Component
// Dropdown to select Telegram session
// ===============================

import { useState, useCallback, useEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ChevronDown, Plus, User, Phone, RefreshCw, Users } from 'lucide-react';
import {
  sessionsAtom,
  activeSessionAtom,
  sessionsLoadingAtom,
  fetchSessions,
  leadsBackendOk,
  leadsBackendAtom,
  type TelegramSession,
} from '@/atoms/leads';
import { useLanguage } from '@/hooks/useLanguage';
import './AccountSelector.css';

interface AccountSelectorProps {
  onAddSession?: () => void;
}

export function AccountSelector({ onAddSession }: AccountSelectorProps) {
  const { lang } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [sessions, setSessions] = useAtom(sessionsAtom);
  const [activeSession, setActiveSession] = useAtom(activeSessionAtom);
  const [loading, setLoading] = useAtom(sessionsLoadingAtom);
  const setBackendOk = useSetAtom(leadsBackendAtom);

  // Find active session
  const currentSession = sessions.find(s => s.id === activeSession);

  // Load sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      setLoading(true);
      try {
        const data = await fetchSessions();
        setSessions(data);
        // Отвечает ли раздел на сервере — узнаём из того же запроса и кладём
        // в атом, чтобы страница сказала правду вместо пустых списков.
        setBackendOk(leadsBackendOk);
        // Auto-select first session if none selected
        if (!activeSession && data.length > 0) {
          setActiveSession(data[0].id);
        }
      } finally {
        setLoading(false);
      }
    };
    loadSessions();
  }, []);

  // Refresh sessions
  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
    } finally {
      setLoading(false);
    }
  }, [setSessions, setLoading]);

  // Select session
  const handleSelect = useCallback((session: TelegramSession) => {
    setActiveSession(session.id);
    setIsOpen(false);
  }, [setActiveSession]);

  // Select all sessions
  const handleSelectAll = useCallback(() => {
    setActiveSession('all');
    setIsOpen(false);
  }, [setActiveSession]);

  // Check if "all" is selected
  const isAllSelected = activeSession === 'all' || activeSession === null;

  // Toggle dropdown
  const handleToggle = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.account-selector')) {
        setIsOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  return (
    <div className={`account-selector ${isOpen ? 'account-selector--open' : ''}`}>
      {/* Current selection button */}
      <button className="account-selector-button" onClick={handleToggle}>
        {isAllSelected ? (
          <div className="account-selector-all-selected">
            <Users size={18} />
            <span className="account-selector-name">
              {lang === 'ru' ? 'Все аккаунты' : 'All accounts'}
            </span>
            <span className="account-selector-count">{sessions.length}</span>
          </div>
        ) : currentSession ? (
          <>
            <div className="account-selector-avatar">
              {currentSession.avatar ? (
                <img src={currentSession.avatar} alt="" />
              ) : (
                <User size={16} />
              )}
              <span className={`account-selector-status ${currentSession.isOnline ? 'online' : 'offline'}`} />
            </div>
            <div className="account-selector-info">
              <span className="account-selector-name">
                {currentSession.displayName || currentSession.username || currentSession.phone}
              </span>
              {currentSession.username && (
                <span className="account-selector-username">@{currentSession.username}</span>
              )}
            </div>
          </>
        ) : (
          <div className="account-selector-placeholder">
            <User size={16} />
            <span>{lang === 'ru' ? 'Выберите аккаунт' : 'Select account'}</span>
          </div>
        )}
        <ChevronDown size={16} className="account-selector-chevron" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="account-selector-dropdown">
          {/* Sessions list */}
          <div className="account-selector-list">
            {/* All accounts option */}
            <button
              className={`account-selector-item account-selector-item-all ${isAllSelected ? 'active' : ''}`}
              onClick={handleSelectAll}
            >
              <div className="account-selector-all-icon">
                <Users size={16} />
              </div>
              <div className="account-selector-item-info">
                <span className="account-selector-item-name">
                  {lang === 'ru' ? 'Все аккаунты' : 'All accounts'}
                </span>
                <span className="account-selector-item-phone">
                  {lang === 'ru' ? 'События от всех' : 'Events from all'}
                </span>
              </div>
              <span className="account-selector-all-badge">{sessions.length}</span>
            </button>

            {loading ? (
              <div className="account-selector-loading">
                <RefreshCw size={16} className="spin" />
                <span>{lang === 'ru' ? 'Загрузка...' : 'Loading...'}</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="account-selector-empty">
                <span>{lang === 'ru' ? 'Нет подключенных аккаунтов' : 'No connected accounts'}</span>
              </div>
            ) : (
              sessions.map(session => (
                <button
                  key={session.id}
                  className={`account-selector-item ${session.id === activeSession ? 'active' : ''}`}
                  onClick={() => handleSelect(session)}
                >
                  <div className="account-selector-avatar">
                    {session.avatar ? (
                      <img src={session.avatar} alt="" />
                    ) : (
                      <User size={16} />
                    )}
                    <span className={`account-selector-status ${session.isOnline ? 'online' : 'offline'}`} />
                  </div>
                  <div className="account-selector-item-info">
                    <span className="account-selector-item-name">
                      {session.displayName || session.username || session.phone}
                    </span>
                    <span className="account-selector-item-phone">
                      <Phone size={10} />
                      {session.phone}
                    </span>
                  </div>
                  {session.isActive && (
                    <span className="account-selector-active-badge">
                      {lang === 'ru' ? 'Активен' : 'Active'}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="account-selector-actions">
            <button className="account-selector-refresh" onClick={handleRefresh} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
              <span>{lang === 'ru' ? 'Обновить' : 'Refresh'}</span>
            </button>

            {onAddSession && (
              <button className="account-selector-add" onClick={onAddSession}>
                <Plus size={14} />
                <span>{lang === 'ru' ? 'Добавить' : 'Add'}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
