import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { GlassConfirmProvider } from './components/GlassConfirm';
import './index.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Gagal mendaftarkan service worker:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter><GlassConfirmProvider>
      <App />
    </GlassConfirmProvider></BrowserRouter>
  </StrictMode>,
);
