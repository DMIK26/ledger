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
import { initInstall, persistOnce } from './pwa/install';
import { initViewport } from './pwa/viewport';

void useLedger
  .getState()
  .init()
  .then(() => persistOnce());
initEntityBus();
initInstall();
initViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void initPwa();
