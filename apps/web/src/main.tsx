import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DataProviderProvider } from './data/DataProviderContext';
import { HttpDataProvider } from './data/HttpDataProvider';
import './theme.css';
import { initTheme } from './theme/useTheme';

initTheme(); // до первого рендера: атрибут data-theme по сохранённому выбору

const dataProvider = new HttpDataProvider();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProviderProvider value={dataProvider}>
      <App />
    </DataProviderProvider>
  </StrictMode>,
);
