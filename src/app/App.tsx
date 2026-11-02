import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { TrackerRepositoryProvider } from './TrackerRepositoryContext';
import { MvSelectionProvider } from './MvSelectionContext';

export const App: React.FC = () => {
  return (
    <TrackerRepositoryProvider>
      <MvSelectionProvider>
        <RouterProvider router={router} />
      </MvSelectionProvider>
    </TrackerRepositoryProvider>
  );
};
