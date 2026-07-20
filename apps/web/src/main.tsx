import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DataProviderProvider } from './data/DataProviderContext';
import { HttpDataProvider } from './data/HttpDataProvider';
import './theme.css';

const dataProvider = new HttpDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProviderProvider value={dataProvider}>
      <App />
    </DataProviderProvider>
  </StrictMode>,
);
