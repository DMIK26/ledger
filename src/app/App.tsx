import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Soon } from './pages/Soon';
import { Budgets } from './pages/Budgets';
import { filtersFromQuery, Transactions } from './pages/Transactions';
import { useRoute, type RoutePath } from './router';

function Page({ path, query }: { path: RoutePath; query: URLSearchParams }) {
  switch (path) {
    case '/transactions':
      return <Transactions view={query.get('view')} initialFilters={filtersFromQuery(query)} />;
    case '/budgets':
      return <Budgets />;
    case '/reports':
      return <Soon page="Reports" />;
    case '/recurring':
      return <Soon page="Recurring" />;
    case '/settings':
      return <Settings />;
    default:
      return <Dashboard />;
  }
}

export function App() {
  const { path, query } = useRoute();
  const adding = query.get('action') === 'add';
  // Re-mount the page when its address changes (apart from opening the Add sheet).
  const pageQuery = new URLSearchParams(query);
  pageQuery.delete('action');
  const key = `${path}?${pageQuery.toString()}`;
  return (
    <Layout path={path} adding={adding}>
      <Page key={key} path={path} query={pageQuery} />
    </Layout>
  );
}
