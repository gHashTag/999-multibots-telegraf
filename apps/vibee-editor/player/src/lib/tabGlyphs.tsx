import type { ReactNode } from 'react'
import {
  Film,
  Globe,
  Hexagon,
  ListTodo,
  Sparkles,
  User,
  Users,
} from 'lucide-react'

/**
 * The glyphs the shared list may name. The list (render/src/navigation.json)
 * says WHICH glyph each tab draws, beside the SF Symbol the iOS app draws for
 * it; this only turns a name into a component. It used to be a second,
 * hand-kept map keyed by tab id, and the list's names had drifted from it
 * (Globe and Bot in the list, Home and Users on the screen).
 */
export const TAB_GLYPHS: Record<string, ReactNode> = {
  Film: <Film size={20} />,
  Users: <Users size={20} />,
  Globe: <Globe size={20} />,
  Sparkles: <Sparkles size={20} />,
  Hexagon: <Hexagon size={20} />,
  ListTodo: <ListTodo size={20} />,
  User: <User size={20} />,
}
