import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// A aplicação continua dependente do servidor local. O service worker existe
// para instalação PWA, mas usa sempre a rede para evitar versões antigas após update.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.info('Instalação PWA indisponível neste endereço:', error);
    });
  });
}
