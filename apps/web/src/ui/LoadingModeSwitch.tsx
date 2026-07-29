import { LOADING_MODES, type LoadingMode } from '@shadrin-v/engine';
import { useT } from '../i18n/LocaleContext';
import { Segmented } from './primitives';

/** Loading-strategy switch (ADR 012): rear | side | combined. Живёт в шапке «Настройки» и только
 *  ЗАПОМИНАЕТ выбор — раскладку он не пересчитывает (5nb этап 2): пересчитывать готовый план из его
 *  прежнего груза нельзя, заявку могли уже поправить. Выбор применяет «Рассчитать». */
export function LoadingModeSwitch({
  value,
  onChange,
}: {
  value: LoadingMode;
  onChange: (m: LoadingMode) => void;
}) {
  const tt = useT();
  return (
    <Segmented<LoadingMode>
      ariaLabel={tt('ladeplan.loadingMode')}
      value={value}
      onChange={onChange}
      options={LOADING_MODES.map((m) => ({ value: m, label: tt(`ladeplan.mode.${m}`) }))}
    />
  );
}
