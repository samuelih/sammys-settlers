import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './theme/tokens.css';
import App from './App';
import { installTestHooks } from './testHooks';

// Expose the small `window.__jsettlers` bridge used by the Playwright E2E suite
// to send debug chat-commands and read an in-game state snapshot. Inert for
// ordinary users (forwards to already-public store actions); see testHooks.ts.
installTestHooks();

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
