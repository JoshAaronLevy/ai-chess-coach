import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from '../pages/HomePage';
import { GamePage } from '../pages/GamePage';

export const routes = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      {
        index: true,
        element: <HomePage />
      },
      {
        path: 'play',
        element: <GamePage />
      }
    ]
  }
];

export const router = createBrowserRouter(routes);