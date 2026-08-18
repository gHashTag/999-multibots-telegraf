import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TokenPage from './pages/Token';
import './App.css';

// Minimal entry point for /token route only
// No Tamagui, Jotai, or @vibee/atoms dependencies

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/token" element={<TokenPage />} />
        <Route path="*" element={<Navigate to="/token" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
