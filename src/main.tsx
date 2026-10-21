import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';
import './styles/components.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to locate root DOM element for mounting React application.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
