// Экраны оболочки ERP вне программы (макет, блок 5): проверка сессии, истёкшая и сменившаяся сессия,
// сбой при входе. Пока они на экране, программа (настройка и план) размонтирована. Полоса здесь — только
// логотип и имя программы: «Zurück zum ERP» и имя пользователя принадлежат работающей программе.
import type { JSX, ReactNode } from 'react';
import { useT } from '../i18n/LocaleContext';
import { logoUrl } from '../lib/logoUrl';
import { Button } from '../ui/primitives';
import { erpErrorKey } from './erpErrors';
import { loginUrl } from './erpUrls';

/** Ссылка в облике главной кнопки (`Button variant="primary"`). */
const PRIMARY_LINK =
  'inline-flex items-center rounded-ctl bg-brand px-3.5 py-2 text-caption font-semibold text-brand-ink transition-colors hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint';

function ScreenFrame({ children }: { children: ReactNode }) {
  const tt = useT();
  return (
    <div className="min-h-screen bg-paper">
      <header className="flex min-h-14 items-center gap-x-5 border-b border-line bg-card px-5 py-2">
        <img src={logoUrl()} alt={tt('ladeplan.brandName')} className="h-7 w-auto shrink-0" />
        <span className="border-l border-line pl-4 text-h2 font-semibold">{tt('app.title')}</span>
      </header>
      <main className="mx-auto max-w-[1120px] p-6">
        <div className="flex max-w-xl flex-col items-start gap-4 rounded-card border border-line bg-card p-5 shadow-card">
          {children}
        </div>
      </main>
    </div>
  );
}

export function SessionLoadingScreen(): JSX.Element {
  const tt = useT();
  return (
    <ScreenFrame>
      <p role="status" className="text-body text-muted">{tt('erp.session.loading')}</p>
    </ScreenFrame>
  );
}

export function SessionExpiredScreen(): JSX.Element {
  const tt = useT();
  return (
    <ScreenFrame>
      <div role="alert" className="w-full rounded-ctl border border-warning bg-sub p-3">
        <h1 className="text-h2 font-semibold">{tt('erp.session.expiredTitle')}</h1>
        <p className="mt-1 text-body text-muted">{tt('erp.session.expired')}</p>
      </div>
      <a className={PRIMARY_LINK} href={loginUrl(location.origin, location.pathname + location.search)}>
        {tt('erp.session.login')}
      </a>
    </ScreenFrame>
  );
}

export function SessionChangedScreen(): JSX.Element {
  const tt = useT();
  return (
    <ScreenFrame>
      <p role="alert" className="text-body">{tt('erp.session.changed')}</p>
      <Button variant="primary" onClick={() => location.reload()}>
        {tt('erp.session.reload')}
      </Button>
    </ScreenFrame>
  );
}

export function ErpBootErrorScreen({ error, onRetry }: { error: unknown; onRetry: () => void }): JSX.Element {
  const tt = useT();
  return (
    <ScreenFrame>
      <p role="alert" className="text-body text-danger">{tt(erpErrorKey(error))}</p>
      <Button variant="primary" onClick={onRetry}>
        {tt('erp.retry')}
      </Button>
    </ScreenFrame>
  );
}
