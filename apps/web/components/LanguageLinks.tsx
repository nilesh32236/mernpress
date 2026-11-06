import Link from 'next/link';
import { languageLabel } from '@mernpress/contracts';

/**
 * Language switcher for a document with published translations. Renders nothing
 * when the variant is the only language. The current language is marked with
 * `aria-current` instead of a link.
 */
export function LanguageLinks({
  language,
  translations,
  label = 'Languages',
}: {
  language: string;
  translations: Array<{ language: string; title: string; path: string }>;
  label?: string;
}) {
  if (translations.length === 0) return null;
  return (
    <nav className="language-links" aria-label={label}>
      <ul>
        <li>
          <span aria-current="true" lang={language}>
            {languageLabel(language)}
          </span>
        </li>
        {translations.map((translation) => (
          <li key={translation.language}>
            <Link
              href={translation.path}
              lang={translation.language}
              hrefLang={translation.language}
            >
              {languageLabel(translation.language)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
