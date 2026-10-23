import { Suspense } from 'react';
import { useLedger } from '../data/store';
import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import {
  Budgets,
  MerchantPage,
  MoneyPage,
  Recurring,
  Reports,
  Settings,
  Transactions,
} from './pages/lazy';
import { filtersFromQuery } from '../domain/filters';
import { useRoute, type RoutePath } from './router';
import { tl } from '../domain/i18n';

function Page({ path, query }: { path: RoutePath; query: URLSearchParams }) {
  switch (path) {
    case '/transactions':
      return (
        <Transactions
          view={query.get('view')}
          initialFilters={filtersFromQuery(query)}
          initialSearch={query.get('q') ?? ''}
        />
      );
    case '/budgets':
      return <Budgets view={query.get('view')} />;
    case '/reports':
      return <Reports />;
    case '/recurring':
      return <Recurring />;
    case '/settings':
      return <Settings view={query.get('view')} merchant={query.get('merchant')} />;
    case '/money':
      return <MoneyPage view={query.get('view')} />;
    case '/merchant':
      return <MerchantPage merchantKey={query.get('key') ?? ''} />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const { path, query } = useRoute();
  const adding = query.get('action') === 'add';
  const addDate = adding ? (query.get('on') ?? undefined) : undefined;
  // Re-mount the page when its address changes (apart from opening the Add sheet).
  const pageQuery = new URLSearchParams(query);
  pageQuery.delete('action');
  pageQuery.delete('on');
  const key = `${path}?${pageQuery.toString()}`;
  // A new language re-draws everything, including text worked out once and kept.
  const language = useLedger((s) => s.settings.language);
  return (
    <Layout key={language} path={path} adding={adding} addDate={addDate}>
      <Suspense
        fallback={
          <p className="muted page-loading" aria-busy="true">
            {tl('Opening…')}
          </p>
        }
      >
        <Page key={key} path={path} query={pageQuery} />
      </Suspense>
    </Layout>
  );
}
