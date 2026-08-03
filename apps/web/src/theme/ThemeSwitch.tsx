// Переключатель фирменной палитры (ADR 025). Использует ту же пилюлю Segmented, что и режим
// погрузки/группировка заказов в этой шапке и переключатель языка в HeroHeader — палитра тоже
// «настройка представления», собственную разметку под неё изобретать незачем.
import { useT } from '../i18n/LocaleContext';
import { Segmented } from '../ui/primitives';
import { useTheme, type ThemeName } from './useTheme';

const THEME_NAMES: ThemeName[] = ['forest', 'warm'];

export function ThemeSwitch() {
  const tt = useT();
  const [theme, setTheme] = useTheme();
  return (
    <Segmented<ThemeName>
      ariaLabel={tt('theme.label')}
      value={theme}
      onChange={setTheme}
      options={THEME_NAMES.map((name) => ({ value: name, label: tt(`theme.${name}`) }))}
    />
  );
}
