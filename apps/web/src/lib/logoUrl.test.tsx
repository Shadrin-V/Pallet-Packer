import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { logoUrl } from './logoUrl';
import { LocaleProvider } from '../i18n/LocaleContext';
import { BrandMark } from '../screens/components/BrandMark';
import { HeroHeader } from '../ui/HeroHeader';

describe('logoUrl (контракт §7)', () => {
  it('логотип: параметр версии из data-logo-v, без атрибута — без параметра', () => {
    expect(logoUrl()).toBe('/logo.svg');
    document.documentElement.setAttribute('data-logo-v', '0.21.570-1a2b3c4d');
    expect(logoUrl()).toBe('/logo.svg?v=0.21.570-1a2b3c4d');
    render(<LocaleProvider initial="de" persist={false}><BrandMark /></LocaleProvider>);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/logo.svg?v=0.21.570-1a2b3c4d');
    document.documentElement.removeAttribute('data-logo-v');
  });

  it('значение атрибута кодируется в параметре', () => {
    document.documentElement.setAttribute('data-logo-v', 'a b&c');
    expect(logoUrl()).toBe('/logo.svg?v=a%20b%26c');
    document.documentElement.removeAttribute('data-logo-v');
  });

  it('шапка обычной сборки берёт тот же адрес логотипа', () => {
    document.documentElement.setAttribute('data-logo-v', '0.21.570-1a2b3c4d');
    render(<LocaleProvider initial="de" persist={false}><HeroHeader /></LocaleProvider>);
    expect(screen.getByRole('img')).toHaveAttribute('src', '/logo.svg?v=0.21.570-1a2b3c4d');
    document.documentElement.removeAttribute('data-logo-v');
  });
});
