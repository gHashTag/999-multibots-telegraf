/**
 * THE KANBAN CARD'S AGENT SHEET, FOR A PHONE-WIDTH LOOK (tri shot card-chat).
 *
 * Mounted as /game/kanban mounts it (Hive.tsx): the card comes from the
 * address (`?card=<n>&repo=<owner/name>`, cardFromSearch), the server's
 * history names it (`onResolved`), and the sheet rises at HALF over a
 * stand-in for the board, so the board's slice above the sheet is measured
 * too. `tri shot` answers /api/agent/history and /api/agent/chat in the
 * host's shapes; nothing reaches a server.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import { JotaiProvider } from '@/atoms/Provider'
import { CardChat } from '@/components/Queen/CardChat'
import { cardFromSearch, type OpenCard } from '@/lib/cardChat'

// Exported only so fast refresh can keep its state across an edit.
export function Stand() {
  const [card, setCard] = useState<OpenCard | null>(() =>
    cardFromSearch(window.location.search)
  )
  return (
    <div className="hive-board-standin" style={{ minHeight: '100dvh' }}>
      {card && (
        <CardChat
          key={card.number}
          card={card}
          onClose={() => setCard(null)}
          onResolved={setCard}
        />
      )}
    </div>
  )
}

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      {/* The app's own store: sending writes there (agentStream.ts). */}
      <JotaiProvider>
        <Stand />
      </JotaiProvider>
    </StrictMode>
  )
