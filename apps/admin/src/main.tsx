import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { getColorScheme } from './colorScheme.js';
import './styles.css';
// The dark palette is a separate layer, loaded after the base stylesheet.
import './dark-theme.css';

document.documentElement.dataset['colorScheme'] = getColorScheme();

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Admin root element was not found in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
