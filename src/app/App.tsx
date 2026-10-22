import { Suspense } from 'react';
import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Budgets, MoneyPage, Recurring, Reports, Settings } from './pages/lazy';
import { filtersFromQuery, Transactions } from './pages/Transactions';
import { useRoute, type RoutePath } from './router';

function Page({ path, query }: { path: RoutePath; query: URLSearchParams }) {
  switch (path) {
    case '/transactions':
      return <Transactions view={query.get('view')} initialFilters={filtersFromQuery(query)} />;
    case '/budgets':
      return <Budgets view={query.get('view')} />;
    case '/reports':
      return <Reports />;
    case '/recurring':
      return <Recurring />;
    case '/settings':
      return <Settings view={query.get('view')} />;
    case '/money':
      return <MoneyPage view={query.get('view')} />;
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
  return (
    <Layout path={path} adding={adding} addDate={addDate}>
      <Suspense
        fallback={
          <p className="muted page-loading" aria-busy="true">
            Opening…
          </p>
        }
      >
        <Page key={key} path={path} query={pageQuery} />
      </Suspense>
    </Layout>
  );
}
