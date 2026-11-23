// Точка входа сборки для ERP (`ladungsplaner.js`, контракт erp-y6tb9 §7; бид lp-erp-build). HTML-оболочку
// отдаёт ERP: `<html data-theme="schaefer">`, `<div id="root">`, без инлайн-скриптов.
//
// Порядок до первого рендера:
// - хранение заперто (`lockDrafts`): пока сессия не получена, пользователь неизвестен, и ни один модуль
//   не пишет — ни черновик, ни настройки вида; после входа `ErpRoot` привязывает хранение к пользователю;
// - палитра хоста (`applyHostPalette`), а НЕ `initTheme`: выбор темы обычной сборки здесь не читается и
//   не пишется.
// Провайдер и сигналы — по одному на страницу, на уровне модуля: двойной монтаж `StrictMode` не создаёт
// второго провайдера со своим запомненным пользователем.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FrappeDataProvider } from './data/FrappeDataProvider';
import { ErpRoot } from './erp/ErpRoot';
import { sessionExpiredSignal, sessionSignal } from './erp/sessionSignal';
import { lockDrafts } from './lib/draftStorage';
import './theme.css';
import { applyHostPalette } from './theme/useTheme';

lockDrafts();
applyHostPalette('schaefer');

const expired = sessionExpiredSignal();
const changed = sessionSignal();
const source = new FrappeDataProvider({ onSessionExpired: expired.notify, onSessionChanged: changed.notify });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErpRoot source={source} subscribeExpired={expired.subscribe} subscribeChanged={changed.subscribe} />
  </StrictMode>,
);
