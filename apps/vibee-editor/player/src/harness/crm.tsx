/**
 * THE CRM LIST, FOR A PHONE-WIDTH LOOK (tri shot crm).
 *
 * /crm as the router mounts it, under the app's own sheets in the order of
 * main.tsx, with the real card on /crm/:id and its chat on /crm/:id/chat, so
 * a round trip list -> card -> chat -> Back measures what the phone does
 * (scroll, kept search, no Back loop). Every tool call is answered in the
 * page from crmFixtures.ts and crmClientFixtures.json; the chat's own
 * /api/agent/* calls go to the network and fail, leaving the greeting.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import CrmPage from '@/pages/Crm'
import CrmClientPage from '@/pages/CrmClient'
import ChatPage from '@/pages/Chat'
import { TelegramTabBar } from '@/components/Navigation/TelegramTabBar'
import { answerCrmToolsInPage, CRM_AUTO_ON, CRM_FIXTURES } from './crmFixtures'
import cardFixtures from './crmClientFixtures.json'

// The list's tools and the card's, so a row opens the REAL card and Back
// comes to the real list: the round trip is what the list has to survive
// (scroll, search, chip). The story tool passes on to the network.
// ?auto=on is AUTO switched on (tri shot crm-auto-on): the phone's one line
// then carries its own Turn off. The hour is fixed, so a shot is a shot.
const autoOn = new URLSearchParams(window.location.search).get('auto') === 'on'
answerCrmToolsInPage(
  {
    ...CRM_FIXTURES,
    ...cardFixtures,
    ...(autoOn ? { autopilot_status: CRM_AUTO_ON } : {}),
  },
  { passThrough: true }
)

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      {/* The page's own ?tab=&who=&q= reach the list, so a state is a link. */}
      <MemoryRouter initialEntries={[`/crm${window.location.search}`]}>
        <Routes>
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/:clientId" element={<CrmClientPage />} />
          <Route path="/crm/:clientId/chat" element={<ChatPage />} />
        </Routes>
        {/* The app's own bottom bar (App.tsx). Without it the header's
            fallback bar sat over the chat's composer -- a harness-only
            overlap, since pages reserve the height only while this bar
            publishes body[data-tabbar] (tick 6). */}
        <TelegramTabBar />
      </MemoryRouter>
    </StrictMode>
  )
