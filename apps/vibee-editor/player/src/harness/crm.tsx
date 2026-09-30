/**
 * THE CRM LIST, FOR A PHONE-WIDTH LOOK (tri shot crm).
 *
 * /crm as the router mounts it, under the app's own sheets in the order of
 * main.tsx. Every tool call is answered in the page from crmFixtures.ts.
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
import { answerCrmToolsInPage } from './crmFixtures'
import { CrmCardStub } from './crmCardStub'

answerCrmToolsInPage()

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      {/* The page's own ?tab=&who=&q= reach the list, so a state is a link. */}
      <MemoryRouter initialEntries={[`/crm${window.location.search}`]}>
        <Routes>
          <Route path="/crm" element={<CrmPage />} />
          <Route path="/crm/:clientId" element={<CrmCardStub />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  )
