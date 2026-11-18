import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('DOSAI renderer root is missing');
}

async function bootstrap(container: HTMLElement): Promise<void> {
  const [runtime, initialSession] = await Promise.all([
    window.dosai.runtime.getSnapshot(),
    window.dosai.review.getSession(),
  ]);
  createRoot(container).render(
    <StrictMode>
      <App runtime={runtime} initialSession={initialSession} />
    </StrictMode>,
  );
}

void bootstrap(root).catch((error: unknown) => {
  root.textContent = 'DOSAI could not establish its local runtime boundary.';
  throw error;
});
