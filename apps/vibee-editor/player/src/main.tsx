import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/design-system.css'
// Declares the open-web defaults for every --app-* property, so the Telegram
// runtime hook only ever overrides them. Must load after the base sheets.
import './styles/telegram.css'
import App from './App.tsx'
import { initSentry } from './lib/sentry'

// Initialize Sentry error tracking
initSentry()

// ===============================
// Storage Version — force reset when defaults change
// Bump this value whenever production defaults are updated
// ===============================
const STORAGE_VERSION = '4';
const VERSION_KEY = 'vibee-storage-version';

const storedVersion = localStorage.getItem(VERSION_KEY);
if (storedVersion !== STORAGE_VERSION) {
  // Clear all VIBEE storage keys so new defaults take effect
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('vibee-') || key.startsWith('@vibee/') || key.startsWith('editor:'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(VERSION_KEY, STORAGE_VERSION);
  if (keysToRemove.length > 0) {
    console.log(`[VIBEE] Storage reset (v${storedVersion} → v${STORAGE_VERSION}), cleared ${keysToRemove.length} keys`);
  }
}

// Register Service Workers
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Video Cache Service Worker (Phase 12 optimization)
    // Provides persistent video caching across sessions
    navigator.serviceWorker.register('/sw-video-cache.js').catch((error) => {
      console.log('Video Cache SW registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
