// PLACEHOLDER: Drop 1 replaces this with the real app shell (see docs/HANDOFF.md).
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/albert-sans';
import './design/tokens.css';
import { createRoot } from 'react-dom/client';

function Placeholder() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-sans)',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 40, margin: 0 }}>
          Ledger
        </h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.55 }}>
          The foundation is in place and this page is a placeholder while the app shell is built.
        </p>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Placeholder />);
