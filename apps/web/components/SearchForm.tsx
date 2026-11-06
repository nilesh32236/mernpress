import { DEFAULT_THEME_STRINGS, type ThemeStrings } from '@mernpress/contracts';

/** WordPress search block: text input plus a dark Search button. */
export default function SearchForm({
  query = '',
  label,
  strings = DEFAULT_THEME_STRINGS,
}: {
  query?: string;
  label?: string;
  strings?: ThemeStrings;
}) {
  return (
    <form className="search-form" role="search" method="get" action="/search">
      <label className="screen-reader-text" htmlFor="site-search-input">
        {label ?? strings.search}
      </label>
      <div className="search-form-inner">
        <input
          id="site-search-input"
          className="search-form-input"
          type="search"
          name="q"
          placeholder={strings.searchPlaceholder}
          defaultValue={query}
          required
        />
        <button className="search-form-button" type="submit">
          {strings.searchButton}
        </button>
      </div>
    </form>
  );
}
