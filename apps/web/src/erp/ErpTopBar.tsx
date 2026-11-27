// Верхняя полоса страницы /ladungsplaner внутри ERP (макет, блок 2): логотип, имя программы, шаги
// (их заполняет задача 17), «Zurück zum ERP» и пользователь ERP. На печати её нет — печатается план.
// Без `fullName` (экраны «сессия истекла» и «вошёл другой пользователь», макет, блок 5) полоса без имени
// и аватара: сессии уже нет, и личность в памяти не держим.
import type { JSX, ReactNode } from 'react';
import { useT } from '../i18n/LocaleContext';
import { logoUrl } from '../lib/logoUrl';
import { deskUrl } from './erpUrls';

export interface ErpTopBarProps {
  fullName?: string;
  steps?: ReactNode;
}

/** Первые буквы первых двух слов имени: «Anna Muster» → «AM», «Boris» → «B». */
function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

/** Ссылка в облике вторичной кнопки (`Button variant="secondary"`). */
const SECONDARY_LINK =
  'inline-flex items-center rounded-ctl border border-line-strong bg-card px-3.5 py-2 text-caption font-semibold text-ink transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint';

export function ErpTopBar({ fullName, steps }: ErpTopBarProps): JSX.Element {
  const tt = useT();
  const short = fullName === undefined ? '' : initials(fullName);
  return (
    <nav
      aria-label={tt('erp.topbar.label')}
      className="flex min-h-14 flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-card px-5 py-2 print:hidden"
    >
      <img src={logoUrl()} alt={tt('ladeplan.brandName')} className="h-7 w-auto shrink-0" />
      <span className="border-l border-line pl-4 text-h2 font-semibold">{tt('app.title')}</span>
      {steps}
      <div className="ml-auto flex items-center gap-3">
        <a className={SECONDARY_LINK} href={deskUrl(location.origin)}>
          {tt('erp.backToErp')}
        </a>
        {fullName !== undefined && (
          <span className="flex items-center gap-2 text-caption text-ink">
            {short !== '' && (
              <span aria-hidden className="grid h-8 w-8 place-items-center rounded-pill bg-brand text-caption font-semibold text-brand-ink">
                {short}
              </span>
            )}
            {fullName}
          </span>
        )}
      </div>
    </nav>
  );
}
