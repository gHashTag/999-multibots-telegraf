/**
 * THE WHOLE CLIENT CARD, FOR A PHONE-WIDTH LOOK (tri shot crm-client).
 *
 * /crm/:id as the router mounts it: the page and its six panels plus the
 * story panel, under the app's own sheets in the order of main.tsx. `tri
 * shot` answers its tool calls -- the story tool with the host's functions,
 * the others from crmClientFixtures.json -- answered in the page, so the
 * card also draws in a plain browser (the preview pane) without `tri shot`.
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
import CrmClientPage from '@/pages/CrmClient'
import { answerCrmToolsInPage } from './crmFixtures'
import fixtures from './crmClientFixtures.json'

// The six panels answer here (the same JSON `tri shot` serves); the story
// tool goes on to the network, where `tri shot` answers it with the host.
answerCrmToolsInPage(fixtures, { passThrough: true })

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <MemoryRouter initialEntries={['/crm/900000011']}>
        <Routes>
          <Route path="/crm/:clientId" element={<CrmClientPage />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  )
