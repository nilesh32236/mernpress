/** WordPress search block: text input plus a dark Search button. */
export default function SearchForm({
  query = '',
  label = 'Search',
}: {
  query?: string;
  label?: string;
}) {
  return (
    <form className="search-form" role="search" method="get" action="/search">
      <label className="screen-reader-text" htmlFor="site-search-input">
        {label}
      </label>
      <div className="search-form-inner">
        <input
          id="site-search-input"
          className="search-form-input"
          type="search"
          name="q"
          placeholder="Type here..."
          defaultValue={query}
          required
        />
        <button className="search-form-button" type="submit">
          Search
        </button>
      </div>
    </form>
  );
}
