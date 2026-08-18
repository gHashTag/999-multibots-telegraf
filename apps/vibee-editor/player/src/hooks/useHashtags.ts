// ===============================
// Hashtags & Mentions System
// ===============================

import { useState, useCallback, useMemo } from 'react';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// Types
export interface Hashtag {
  tag: string;
  count: number;
  trending?: boolean;
}

export interface Mention {
  userId: number;
  username: string;
  displayName?: string;
  avatar?: string;
}

// Atoms
export const trendingHashtagsAtom = atom<Hashtag[]>([
  { tag: 'vibee', count: 12500, trending: true },
  { tag: 'aivideo', count: 8900, trending: true },
  { tag: 'reels', count: 7200, trending: true },
  { tag: 'contentcreator', count: 5600 },
  { tag: 'videoediting', count: 4300 },
  { tag: 'fyp', count: 3800, trending: true },
  { tag: 'trending', count: 3200 },
  { tag: 'viral', count: 2900 },
]);

export const recentSearchesAtom = atomWithStorage<string[]>('vibee-recent-searches', []);
export const followedHashtagsAtom = atomWithStorage<string[]>('vibee-followed-hashtags', []);

// Parse hashtags and mentions from text
export function parseContent(text: string): {
  hashtags: string[];
  mentions: string[];
  plainText: string;
} {
  const hashtagRegex = /#(\w+)/g;
  const mentionRegex = /@(\w+)/g;

  const hashtags: string[] = [];
  const mentions: string[] = [];

  let match;
  while ((match = hashtagRegex.exec(text)) !== null) {
    hashtags.push(match[1].toLowerCase());
  }
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1].toLowerCase());
  }

  const plainText = text
    .replace(hashtagRegex, '')
    .replace(mentionRegex, '')
    .trim();

  return { hashtags, mentions, plainText };
}

// Highlight hashtags and mentions in text
export function highlightContent(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(#\w+|@\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add highlighted match
    const isHashtag = match[0].startsWith('#');
    parts.push(
      `<span class="${isHashtag ? 'hashtag' : 'mention'}">${match[0]}</span>`
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

// Hook for hashtag input with autocomplete
export function useHashtagInput(initialValue = '') {
  const [value, setValue] = useState(initialValue);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionType, setSuggestionType] = useState<'hashtag' | 'mention' | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');

  const trendingHashtags = useAtomValue(trendingHashtagsAtom);

  // Check for active hashtag or mention at cursor
  const checkForTrigger = useCallback((text: string, position: number) => {
    const beforeCursor = text.slice(0, position);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    const mentionMatch = beforeCursor.match(/@(\w*)$/);

    if (hashMatch) {
      setSuggestionType('hashtag');
      setSuggestionQuery(hashMatch[1]);
      setShowSuggestions(true);
    } else if (mentionMatch) {
      setSuggestionType('mention');
      setSuggestionQuery(mentionMatch[1]);
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
      setSuggestionType(null);
      setSuggestionQuery('');
    }
  }, []);

  const handleChange = useCallback((newValue: string, position: number) => {
    setValue(newValue);
    setCursorPosition(position);
    checkForTrigger(newValue, position);
  }, [checkForTrigger]);

  const insertSuggestion = useCallback((suggestion: string) => {
    const beforeCursor = value.slice(0, cursorPosition);
    const afterCursor = value.slice(cursorPosition);

    // Find the trigger position
    const triggerChar = suggestionType === 'hashtag' ? '#' : '@';
    const triggerIndex = beforeCursor.lastIndexOf(triggerChar);

    if (triggerIndex !== -1) {
      const newValue = beforeCursor.slice(0, triggerIndex) +
        triggerChar + suggestion + ' ' +
        afterCursor;
      setValue(newValue);
      setShowSuggestions(false);
    }
  }, [value, cursorPosition, suggestionType]);

  // Filter suggestions
  const suggestions = useMemo(() => {
    if (!showSuggestions || !suggestionType) return [];

    if (suggestionType === 'hashtag') {
      return trendingHashtags
        .filter(h => h.tag.toLowerCase().includes(suggestionQuery.toLowerCase()))
        .slice(0, 5);
    }

    // For mentions, would need to fetch users
    return [];
  }, [showSuggestions, suggestionType, suggestionQuery, trendingHashtags]);

  return {
    value,
    setValue,
    handleChange,
    showSuggestions,
    suggestionType,
    suggestions,
    insertSuggestion,
    closeSuggestions: () => setShowSuggestions(false),
  };
}

// Hook for following hashtags
export function useFollowHashtag() {
  const [followedHashtags, setFollowedHashtags] = useAtom(followedHashtagsAtom);

  const isFollowing = useCallback((tag: string) => {
    return followedHashtags.includes(tag.toLowerCase());
  }, [followedHashtags]);

  const toggleFollow = useCallback((tag: string) => {
    const normalizedTag = tag.toLowerCase();
    if (followedHashtags.includes(normalizedTag)) {
      setFollowedHashtags(followedHashtags.filter(t => t !== normalizedTag));
    } else {
      setFollowedHashtags([...followedHashtags, normalizedTag]);
    }
  }, [followedHashtags, setFollowedHashtags]);

  return { followedHashtags, isFollowing, toggleFollow };
}

// Format hashtag count
export function formatHashtagCount(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
}
