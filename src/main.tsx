import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/albert-sans';
import '@fontsource-variable/caveat';
import './design/tokens.css';
import './design/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { useLedger } from './data/store';
import { initPwa } from './pwa/register';
import { initEntityBus } from './kit/entityBus';

void useLedger.getState().init();
initEntityBus();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initPwa();
