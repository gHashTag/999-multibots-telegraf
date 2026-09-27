/**
 * HER OWN "MY REELS" PAGE ALONE, FOR A PHONE-WIDTH LOOK (tri shot my-story).
 *
 * The page the client opens from her bot (?start=app_story) and presses
 * with her own thumb. Mounted as the route mounts it, under the app's own
 * sheets in the order of main.tsx; `tri shot` answers its `my_story_reel`
 * calls with what the host's functions say.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import StoryPage from '@/pages/Story'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <StoryPage />
    </StrictMode>
  )
