// ===============================
// Leads Atoms - Telegram Lead Management
// ===============================

import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { STORAGE_KEYS } from '@vibee/atoms';
import { API_BASE } from '../config';

// ===============================
// Types
// ===============================

export type LeadIntent = 'purchase' | 'sale' | 'exchange' | 'question' | 'support' | 'spam' | 'unknown';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'won' | 'lost' | 'blocked';
export type LeadAction = 'allow' | 'block' | 'reply' | 'mute';
export type LeadUrgency = 'high' | 'medium' | 'low';

export interface Lead {
  id: string;
  fromUserId: number;
  fromUsername?: string;
  fromDisplayName: string;
  fromAvatar?: string;
  chatId: number;
  chatTitle: string;
  chatType: 'private' | 'group' | 'supergroup' | 'channel';
  messageText: string;
  messageId?: number;
  triggerWord?: string;
  quality: number;           // 1-10
  intent: LeadIntent;
  urgency: LeadUrgency;
  status: LeadStatus;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  isRead: boolean;
  isMuted: boolean;
  muteUntil?: string;
}

export interface TelegramSession {
  id: string;
  phone: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  isActive: boolean;
  isOnline: boolean;
  lastActivityAt: string;
  dialogsCount?: number;
}

export interface Trigger {
  id: string;
  word: string;
  category: string;
  isActive: boolean;
  matchCount: number;
  createdAt: string;
}

export interface LeadStats {
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  won: number;
  lost: number;
  blocked: number;
  byIntent: Record<LeadIntent, number>;
  byHour: { hour: number; count: number }[];
  topTriggers: { word: string; count: number }[];
}

// ===============================
// State Atoms
// ===============================

// Current leads list (sorted by createdAt desc)
export const leadsAtom = atom<Lead[]>([]);

// Loading state
export const leadsLoadingAtom = atom(false);

// Error state
export const leadsErrorAtom = atom<string | null>(null);

// Selected lead for content creation
export const selectedLeadAtom = atom<Lead | null>(null);

// Current tab (using STORAGE_KEYS - single source of truth)
export type LeadsTab = 'events' | 'leads' | 'stats' | 'triggers' | 'content';
export const leadsTabAtom = atomWithStorage<LeadsTab>(STORAGE_KEYS.leadsTab, 'events');

// Filter: status
export const leadsStatusFilterAtom = atomWithStorage<LeadStatus | 'all'>(STORAGE_KEYS.leadsStatusFilter, 'all');

// Filter: intent
export const leadsIntentFilterAtom = atomWithStorage<LeadIntent | 'all'>(STORAGE_KEYS.leadsIntentFilter, 'all');

// Filter: session
export const leadsSessionFilterAtom = atomWithStorage<string | 'all'>(STORAGE_KEYS.leadsSessionFilter, 'all');

// Search query
export const leadsSearchAtom = atom('');

// Available sessions
export const sessionsAtom = atom<TelegramSession[]>([]);

// Active session (for actions) - 'all' shows events from all accounts
export const activeSessionAtom = atomWithStorage<string | null>(STORAGE_KEYS.activeSession, 'all');

// Session loading
export const sessionsLoadingAtom = atom(false);

// Triggers
export const triggersAtom = atom<Trigger[]>([]);
export const triggersLoadingAtom = atom(false);

// Lead stats
export const leadStatsAtom = atom<LeadStats | null>(null);

// WebSocket connection status
export const leadsWsConnectedAtom = atom(false);

// Reply modal state
export const replyModalAtom = atom<{ leadId: string; chatId: number; messageId?: number } | null>(null);

// ===============================
// Derived Atoms
// ===============================

// Unread leads count
export const unreadLeadsCountAtom = atom((get) => {
  const leads = get(leadsAtom);
  return leads.filter(l => !l.isRead && l.status === 'new').length;
});

// Filtered leads
export const filteredLeadsAtom = atom((get) => {
  const leads = get(leadsAtom);
  const statusFilter = get(leadsStatusFilterAtom);
  const intentFilter = get(leadsIntentFilterAtom);
  const sessionFilter = get(leadsSessionFilterAtom);
  const searchQuery = get(leadsSearchAtom).toLowerCase();

  return leads.filter(lead => {
    // Status filter
    if (statusFilter !== 'all' && lead.status !== statusFilter) return false;

    // Intent filter
    if (intentFilter !== 'all' && lead.intent !== intentFilter) return false;

    // Session filter
    if (sessionFilter !== 'all' && lead.sessionId !== sessionFilter) return false;

    // Search filter
    if (searchQuery) {
      const searchableText = [
        lead.fromDisplayName,
        lead.fromUsername,
        lead.messageText,
        lead.chatTitle,
        lead.triggerWord,
      ].filter(Boolean).join(' ').toLowerCase();

      if (!searchableText.includes(searchQuery)) return false;
    }

    return true;
  });
});

// Active triggers only
export const activeTriggersAtom = atom((get) => {
  const triggers = get(triggersAtom);
  return triggers.filter(t => t.isActive);
});

// ===============================
// Action Atoms (write-only)
// ===============================

// Add new lead (from WebSocket)
export const addLeadAtom = atom(null, (get, set, lead: Lead) => {
  const leads = get(leadsAtom);
  // Check if lead already exists (by id)
  const existingIndex = leads.findIndex(l => l.id === lead.id);

  if (existingIndex >= 0) {
    // Update existing lead
    const newLeads = [...leads];
    newLeads[existingIndex] = lead;
    set(leadsAtom, newLeads);
  } else {
    // Add at beginning (newest first)
    const newLeads = [lead, ...leads];
    // Keep max 500 leads in memory
    if (newLeads.length > 500) {
      newLeads.pop();
    }
    set(leadsAtom, newLeads);
  }
});

// Update lead
export const updateLeadAtom = atom(null, (get, set, { id, updates }: { id: string; updates: Partial<Lead> }) => {
  const leads = get(leadsAtom);
  const newLeads = leads.map(lead =>
    lead.id === id
      ? { ...lead, ...updates, updatedAt: new Date().toISOString() }
      : lead
  );
  set(leadsAtom, newLeads);
});

// Mark lead as read
export const markLeadReadAtom = atom(null, (get, set, id: string) => {
  set(updateLeadAtom, { id, updates: { isRead: true } });
});

// Mark all leads as read
export const markAllLeadsReadAtom = atom(null, (get, set) => {
  const leads = get(leadsAtom);
  const newLeads = leads.map(lead => ({ ...lead, isRead: true }));
  set(leadsAtom, newLeads);
});

// Add session
export const addSessionAtom = atom(null, (get, set, session: TelegramSession) => {
  const sessions = get(sessionsAtom);
  const existingIndex = sessions.findIndex(s => s.id === session.id);

  if (existingIndex >= 0) {
    const newSessions = [...sessions];
    newSessions[existingIndex] = session;
    set(sessionsAtom, newSessions);
  } else {
    set(sessionsAtom, [...sessions, session]);
  }
});

// Update session status
export const updateSessionStatusAtom = atom(null, (get, set, { id, isOnline }: { id: string; isOnline: boolean }) => {
  const sessions = get(sessionsAtom);
  const newSessions = sessions.map(session =>
    session.id === id
      ? { ...session, isOnline, lastActivityAt: new Date().toISOString() }
      : session
  );
  set(sessionsAtom, newSessions);
});

// Set triggers
export const setTriggersAtom = atom(null, (_get, set, triggers: Trigger[]) => {
  set(triggersAtom, triggers);
});

// Add trigger
export const addTriggerAtom = atom(null, (get, set, trigger: Omit<Trigger, 'id' | 'matchCount' | 'createdAt'>) => {
  const newTrigger: Trigger = {
    id: `trigger-${Date.now()}`,
    ...trigger,
    matchCount: 0,
    createdAt: new Date().toISOString(),
  };
  set(triggersAtom, [...get(triggersAtom), newTrigger]);
  return newTrigger;
});

// Remove trigger
export const removeTriggerAtom = atom(null, (get, set, id: string) => {
  set(triggersAtom, get(triggersAtom).filter(t => t.id !== id));
});

// Toggle trigger active
export const toggleTriggerAtom = atom(null, (get, set, id: string) => {
  const triggers = get(triggersAtom);
  const newTriggers = triggers.map(trigger =>
    trigger.id === id
      ? { ...trigger, isActive: !trigger.isActive }
      : trigger
  );
  set(triggersAtom, newTriggers);
});

// Clear all leads
export const clearLeadsAtom = atom(null, (_get, set) => {
  set(leadsAtom, []);
});

// ===============================
// API Functions
// ===============================

// Fetch sessions list
export async function fetchSessions(): Promise<TelegramSession[]> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/sessions`);
    if (!response.ok) throw new Error('Failed to fetch sessions');
    const data = await response.json();
    // Map snake_case API response to camelCase
    return (data.sessions || []).map((s: any) => ({
      id: s.id,
      phone: s.phone,
      displayName: s.display_name || s.username,
      username: s.username,
      avatar: s.avatar,
      isActive: s.is_active ?? false,
      isOnline: s.is_online ?? true, // Default to online if authorized
      lastActivityAt: s.last_activity_at || new Date().toISOString(),
      dialogsCount: s.dialogs_count,
    }));
  } catch (error) {
    console.error('[Leads] Failed to fetch sessions:', error);
    return [];
  }
}

// Fetch triggers list
export async function fetchTriggers(): Promise<Trigger[]> {
  try {
    const response = await fetch(`${API_BASE}/api/triggers/list`);
    if (!response.ok) throw new Error('Failed to fetch triggers');
    const data = await response.json();
    return (data.triggers || []).map((t: any) => ({
      id: String(t.id),
      word: t.word,
      category: t.category || 'custom',
      isActive: t.is_active !== false,
      matchCount: t.match_count || 0,
      createdAt: t.created_at || new Date().toISOString(),
    }));
  } catch (error) {
    console.error('[Leads] Failed to fetch triggers:', error);
    return [];
  }
}

// Add trigger via API
export async function addTriggerApi(word: string, category: string): Promise<{ success: boolean; id?: string }> {
  try {
    const response = await fetch(`${API_BASE}/api/triggers/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, category }),
    });
    const data = await response.json();
    if (data.status === 'ok') {
      return { success: true, id: String(data.id) };
    }
    return { success: false };
  } catch (error) {
    console.error('[Leads] Failed to add trigger:', error);
    return { success: false };
  }
}

// Remove trigger via API
export async function removeTriggerApi(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/triggers/remove`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(id, 10) }),
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('[Leads] Failed to remove trigger:', error);
    return false;
  }
}

// Test trigger
export async function testTrigger(text: string): Promise<{ hasTrigger: boolean; matches: string[] }> {
  try {
    const response = await fetch(`${API_BASE}/api/triggers/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await response.json();
    return {
      hasTrigger: data.has_trigger || false,
      matches: data.matched_triggers || [],
    };
  } catch (error) {
    console.error('[Leads] Failed to test trigger:', error);
    return { hasTrigger: false, matches: [] };
  }
}

// Fetch lead stats
export async function fetchLeadStats(): Promise<LeadStats | null> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/leads/stats`);
    if (!response.ok) throw new Error('Failed to fetch stats');
    const data = await response.json();
    return data.stats || null;
  } catch (error) {
    console.error('[Leads] Failed to fetch stats:', error);
    return null;
  }
}

// Lead action (allow/block/mute)
export async function sendLeadAction(
  sessionId: string,
  chatId: number,
  action: LeadAction,
  payload?: { replyText?: string; muteDuration?: number }
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/leads/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        chat_id: chatId,
        action,
        ...payload,
      }),
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('[Leads] Failed to send action:', error);
    return false;
  }
}

// Send reply message
export async function sendReplyMessage(
  sessionId: string,
  chatId: number,
  text: string,
  replyToMessageId?: number
): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/leads/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        chat_id: chatId,
        text,
        reply_to_message_id: replyToMessageId,
      }),
    });
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.error('[Leads] Failed to send reply:', error);
    return false;
  }
}

// Generate script from lead message
export async function generateScript(messageText: string, context?: string): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE}/api/v1/content/script`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: messageText,
        context,
      }),
    });
    const data = await response.json();
    return data.script || null;
  } catch (error) {
    console.error('[Leads] Failed to generate script:', error);
    return null;
  }
}

// ===============================
// Event Stream - ALL Telegram events
// ===============================

export type TelegramEventType =
  | 'new_lead'
  | 'message'
  | 'trigger_match'
  | 'session_status'
  | 'ws_connected'
  | 'ws_disconnected'
  | 'action_sent'
  | 'error';

export interface TelegramEvent {
  id: string;
  type: TelegramEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// All events stream (max 100)
export const eventsAtom = atom<TelegramEvent[]>([]);

// Add event action
export const addEventAtom = atom(
  null,
  (get, set, event: Omit<TelegramEvent, 'id' | 'timestamp'>) => {
    const newEvent: TelegramEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    const events = get(eventsAtom);
    const updated = [newEvent, ...events].slice(0, 100);
    set(eventsAtom, updated);
  }
);

// Clear events
export const clearEventsAtom = atom(null, (_get, set) => {
  set(eventsAtom, []);
});
