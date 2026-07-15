import { useT } from '../../i18n/LocaleContext';

/**
 * Holz-Schäfer brand lockup for the Ladeplan header + print document. Renders /logo.svg — a
 * placeholder asset today (bead LKWkalk-2ll.7); dropping the real brand SVG at that path updates
 * both this mark and the browser favicon with no code change.
 */
export function BrandMark() {
  const tt = useT();
  return (
    <img
      src="/logo.svg"
      alt={tt('ladeplan.brandName')}
      className="h-10 w-auto max-w-[240px] object-contain"
    />
  );
}
