import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { GamePage } from '../pages/GamePage';

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <GamePage />
      }
    ]
  }
];

export const router = createBrowserRouter(routes);