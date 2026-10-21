import { Layout } from './Layout';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { Soon } from './pages/Soon';
import { Transactions } from './pages/Transactions';
import { useRoute, type RoutePath } from './router';

function Page({ path, adding }: { path: RoutePath; adding: boolean }) {
  switch (path) {
    case '/transactions':
      return <Transactions adding={adding} />;
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
  return (
    <Layout path={path}>
      <Page key={adding ? `${path}-add` : path} path={path} adding={adding} />
    </Layout>
  );
}
