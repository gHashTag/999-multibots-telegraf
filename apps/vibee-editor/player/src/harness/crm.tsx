/**
 * THE CRM LIST, FOR A PHONE-WIDTH LOOK (tri shot crm).
 *
 * /crm as the router mounts it, under the app's own sheets in the order of
 * main.tsx, with the real card on /crm/:id so a round trip list -> card ->
 * Back measures what the phone does (scroll, kept search). Every tool call
 * is answered in the page from crmFixtures.ts and crmClientFixtures.json.
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
import { answerCrmToolsInPage, CRM_FIXTURES } from './crmFixtures'
import cardFixtures from './crmClientFixtures.json'

// The list's tools and the card's, so a row opens the REAL card and Back
// comes to the real list: the round trip is what the list has to survive
// (scroll, search, chip). The story tool passes on to the network.
answerCrmToolsInPage(
  { ...CRM_FIXTURES, ...cardFixtures },
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
        </Routes>
      </MemoryRouter>
    </StrictMode>
  )
