import { atom } from 'jotai'
import type { ContentState, WidgetId } from '@/lib/clientWidgets'

/**
 * WHAT THE OWNER SEES ON A CLIENT'S CHAT, keyed by the client.
 *
 * The card (ClientAside) writes the open widget, the story-reel panel writes
 * its settings while it is mounted and clears them when it goes; the chat
 * reads both at the moment a line is sent and turns them into the turn's
 * `widgets` (lib/clientWidgets.ts `widgetContext`). Keyed by client, so a
 * switch to another client never carries the last one's topic along.
 * Not stored: it describes the screen, which is gone after a reload.
 */
export interface ClientWidgetsState {
  open?: WidgetId
  content?: ContentState | null
}

export const clientWidgetsAtom = atom<Record<string, ClientWidgetsState>>({})
