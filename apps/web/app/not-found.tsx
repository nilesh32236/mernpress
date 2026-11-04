import SearchForm from '@/components/SearchForm';

export default function NotFound() {
  return (
    <main id="main-content" className="site-main not-found-main">
      <div className="not-found-columns">
        <figure className="not-found-image">
          <img
            src="/404-tree.webp"
            alt="Small totara tree on ridge above Long Point"
            width={1048}
            height={1342}
          />
        </figure>
        <div className="not-found-content">
          <h1 className="entry-title">Page not found</h1>
          <p className="not-found-text">
            The page you are looking for doesn&rsquo;t exist, or it has been moved. Please try
            searching using the form below.
          </p>
          <SearchForm />
        </div>
      </div>
    </main>
  );
}
