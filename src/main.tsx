import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { GalileoAuthProvider, convexTokenStorage } from './auth';

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const convexClient = convexUrl ? new ConvexReactClient(convexUrl) : null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {convexClient ? (
      <ConvexAuthProvider client={convexClient} storage={convexTokenStorage} storageNamespace={convexUrl}>
        <GalileoAuthProvider convexUrl={convexUrl}>
          <App />
        </GalileoAuthProvider>
      </ConvexAuthProvider>
    ) : (
      <GalileoAuthProvider>
        <App />
      </GalileoAuthProvider>
    )}
  </React.StrictMode>,
);
