/**
 * THE TAB STRIP OF THE PERSON'S OWN BROWSER, FOR A PHONE-WIDTH LOOK
 * (tri shot tab-strip, tab-strip-12, tab-strip-1).
 *
 * Mounted as /browser mounts it on a phone (pages/Browser.tsx): inside the
 * live column of `.remote-browser--live`, above the picture, under the
 * app's sheets in the order of main.tsx and the page's own stylesheet. The
 * picture is a stand-in box; the strip itself is the real component, and
 * `tri shot` answers its door (/api/browser/strip) with what render's own
 * `stripOf` makes of a stand-in pod, so the titles are clipped by the host.
 *
 * Nothing here is built into the app: vite serves harness/*.html in dev only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../index.css'
import '../styles/design-system.css'
import '../styles/telegram.css'
import '../styles/board-shell.css'
import '../pages/Browser.css'
import { TabStrip } from '@/components/Browser/TabStrip'

const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <div className="remote-browser remote-browser--live remote-browser--tabs">
        <section className="remote-browser__live">
          <TabStrip live />
          <div className="remote-browser__stage" aria-hidden="true" />
        </section>
      </div>
    </StrictMode>
  )
