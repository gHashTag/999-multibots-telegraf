/**
 * HER REELS AS THE CHAT SHOWS THEM, FOR A PHONE-WIDTH LOOK.
 *
 * The widget the chat with the agent draws above the talk: open before the
 * first message, folded after. Dev only, like every harness here.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import { MyStoryWidget } from '@/components/Story/MyStoryWidget'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <div className="chat-story-stand">
        <MyStoryWidget onlyReady foldedIn={false} />
        <MyStoryWidget onlyReady foldedIn />
      </div>
    </StrictMode>
  )
