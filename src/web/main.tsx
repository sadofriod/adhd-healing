import { createRoot } from 'react-dom/client';
import { App } from './App.js';

function getRootElement(): HTMLElement {
  const rootElement = document.getElementById('app');
  if (!rootElement) {
    throw new Error('Missing root element for web client');
  }

  return rootElement;
}

createRoot(getRootElement()).render(<App />);