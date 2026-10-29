import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/layout/AppShell';
import { DashboardPage } from '../pages/DashboardPage';
import { LayoutAssignmentsPage } from '../pages/LayoutAssignmentsPage';
import { DestinationSourcesPage } from '../pages/DestinationSourcesPage';
import { ProductionsPage } from '../pages/ProductionsPage';
import { SourceDirectoryPage } from '../pages/SourceDirectoryPage';
import { HistoryPage } from '../pages/HistoryPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <AppShell />,
      children: [
        {
          index: true,
          element: <DashboardPage />,
        },
        {
          path: 'layouts',
          element: <LayoutAssignmentsPage />,
        },
        {
          path: 'sources',
          element: <DestinationSourcesPage />,
        },
        {
          path: 'signal-flows',
          element: <DestinationSourcesPage />,
        },
        {
          path: 'productions',
          element: <ProductionsPage />,
        },
        {
          path: 'directory',
          element: <SourceDirectoryPage />,
        },
        {
          path: 'history',
          element: <HistoryPage />,
        },
        {
          path: '*',
          element: <NotFoundPage />,
        },
      ],
    },
  ],
  {
    basename: import.meta.env.BASE_URL,
  }
);
