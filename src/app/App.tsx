import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Recurring } from './pages/Recurring';
import { Reports } from './pages/Reports';
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
      return <Reports />;
    case '/recurring':
      return <Recurring />;
    case '/settings':
      return <Settings view={query.get('view')} />;
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
      <Page key={key} path={path} query={pageQuery} />
    </Layout>
  );
}
