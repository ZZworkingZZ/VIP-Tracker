import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { TrackerRepositoryProvider } from './TrackerRepositoryContext';

export const App: React.FC = () => {
  return (
    <TrackerRepositoryProvider>
      <RouterProvider router={router} />
    </TrackerRepositoryProvider>
  );
};
