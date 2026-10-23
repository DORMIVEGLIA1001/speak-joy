import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary';
import { ActiveChildProvider } from './context/ActiveChildContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ActiveChildProvider>
        <App />
      </ActiveChildProvider>
    </ErrorBoundary>
  </StrictMode>,
);
