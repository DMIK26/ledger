import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/albert-sans';
import './design/tokens.css';
import './design/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useLedger } from './data/store';
import { initPwa } from './pwa/register';

void useLedger.getState().init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initPwa();
