/**
 * THE STORY PANEL ALONE, FOR A PHONE-WIDTH LOOK (tri shot, loop turn 12).
 *
 * The CRM page needs a signed-in seller, a client and a dozen answers before
 * the panel shows; the panel itself needs one. So this mounts the very
 * component the page mounts, inside the page's own wrapper and under the
 * app's own sheets (the same order as main.tsx), and `tri shot` answers its
 * `crm_story_reel` calls with what the host's functions say for the card.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import '../pages/Crm.css'
import '../pages/CrmClient.css'
import { StoryReelPanel } from '@/components/Crm/StoryReelPanel'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <div className="crm crm-client">
        <StoryReelPanel clientId="harness-client" />
      </div>
    </StrictMode>
  )
