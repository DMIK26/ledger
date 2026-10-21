import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Soon } from './pages/Soon';
import { Transactions } from './pages/Transactions';
import { useRoute, type RoutePath } from './router';

function Page({ path, view }: { path: RoutePath; view: string | null }) {
  switch (path) {
    case '/transactions':
      return <Transactions view={view} />;
    case '/budgets':
      return <Soon page="Budgets" />;
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
  const view = query.get('view');
  return (
    <Layout path={path} adding={adding}>
      <Page key={view ? `${path}-${view}` : path} path={path} view={view} />
    </Layout>
  );
}
