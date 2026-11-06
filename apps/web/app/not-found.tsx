import SearchForm from '@/components/SearchForm';
import { logCurrentNotFound } from '@/lib/not-found-log';
import { requestThemeStrings } from '@/lib/theme-strings';

export default async function NotFound() {
  await logCurrentNotFound();
  const strings = await requestThemeStrings();
  return (
    <main id="main-content" className="site-main not-found-main">
      <div className="not-found-columns">
        <figure className="not-found-image">
          <img src="/404-tree.webp" alt={strings.notFoundImageAlt} width={1048} height={1342} />
        </figure>
        <div className="not-found-content">
          <h1 className="entry-title">{strings.notFoundTitle}</h1>
          <p className="not-found-text">{strings.notFoundText}</p>
          <SearchForm strings={strings} />
        </div>
      </div>
    </main>
  );
}
