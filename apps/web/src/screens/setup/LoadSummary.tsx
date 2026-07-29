// Пустое состояние панели разбора (LKWkalk-5nb, спека §6): пока строка не выбрана, панель занята
// делом — показывает сводку заявки и то, что мешает или испортит расчёт. Каждое сообщение с адресом
// кликабельно и ведёт к своей строке.
import { formatVolume } from '@shadrin-v/i18n';
import { useT, useLocale } from '../../i18n/LocaleContext';
import { fillTemplate } from '../components/stackFormula';
import type { SetupMessage, SetupMessageWhere, SetupSummary } from './setupValidation';

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-title font-[700] leading-none tabular-nums text-brand">{value}</div>
      <div className="mt-1 text-label uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function MessageList({
  title,
  messages,
  danger,
  onGoTo,
}: {
  title: string;
  messages: SetupMessage[];
  danger: boolean;
  onGoTo: (where: SetupMessageWhere) => void;
}) {
  const tt = useT();
  if (messages.length === 0) return null;
  return (
    <section className="flex flex-col gap-1">
      <span className={`text-label uppercase font-semibold ${danger ? 'text-danger' : 'text-warning'}`}>
        {title}
      </span>
      <ul className="flex flex-col gap-1">
        {messages.map((m, i) => {
          const text = tt(m.code);
          // Позиция без названия (например, свежая emptyPosition()) даёт пустую строку в m.name —
          // адрес тогда не складывается, и подставлять его в aria-label нельзя: шаблонная строка
          // превратит null в буквальное "null", которое озвучит скринридер (ревью, дефект 1).
          const address = m.orderId && m.name ? `${m.orderId} · ${m.name}` : null;
          const goTo = tt('setup.msg.goToPosition');
          return (
            <li key={`${m.code}-${m.where?.positionId ?? 'plan'}-${i}`} className="text-caption">
              {m.where ? (
                <button
                  type="button"
                  className="text-left underline decoration-line underline-offset-2 hover:text-brand"
                  aria-label={address ? `${address}: ${text} — ${goTo}` : `${text} — ${goTo}`}
                  onClick={() => onGoTo(m.where!)}
                >
                  {address && <span className="font-semibold">{address}</span>}
                  {address ? ' — ' : ''}
                  {text}
                </button>
              ) : (
                <span>{text}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function LoadSummary({
  summary,
  messages,
  onGoTo,
}: {
  summary: SetupSummary;
  messages: SetupMessage[];
  onGoTo: (where: SetupMessageWhere) => void;
}) {
  const tt = useT();
  const { locale } = useLocale();
  const errors = messages.filter((m) => m.level === 'error');
  const warnings = messages.filter((m) => m.level === 'warning');
  return (
    <aside className="flex flex-col gap-4 rounded-card bg-card p-4 shadow-card">
      <span className="text-label uppercase font-semibold text-faint">{tt('setup.summary.title')}</span>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Figure value={String(summary.orders)} label={tt('setup.summary.orders')} />
        <Figure value={String(summary.positions)} label={tt('setup.summary.positions')} />
        <Figure value={String(summary.units)} label={tt('setup.summary.units')} />
      </div>
      <div className="text-caption text-muted">
        <span className="font-semibold text-ink">{formatVolume(summary.cargoVolume, locale)}</span>{' '}
        {fillTemplate(tt('setup.summary.ofVehicle'), {
          vehicle: formatVolume(summary.vehicleVolume, locale),
        })}
        <div className="text-label uppercase tracking-wide text-faint">{tt('setup.summary.volume')}</div>
      </div>
      <MessageList title={tt('setup.msg.errors')} messages={errors} danger onGoTo={onGoTo} />
      <MessageList title={tt('setup.msg.warnings')} messages={warnings} danger={false} onGoTo={onGoTo} />
      {messages.length === 0 && <p className="text-caption text-muted">{tt('setup.msg.none')}</p>}
    </aside>
  );
}
