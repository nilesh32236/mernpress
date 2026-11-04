import Link from 'next/link';

/** WordPress query pagination: previous arrow, page numbers, next arrow. */
export default function Pagination({
  page,
  totalPages,
  basePath,
  query = {},
}: {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string>;
}) {
  if (totalPages <= 1) return null;

  function href(target: number): string {
    const params = new URLSearchParams(query);
    if (target > 1) {
      params.set('page', String(target));
    } else {
      params.delete('page');
    }
    const search = params.toString();
    return search ? `${basePath}?${search}` : basePath;
  }

  return (
    <nav className="pagination" aria-label="Posts pagination">
      {page > 1 ? (
        <Link className="pagination-arrow" href={href(page - 1)} aria-label="Previous page">
          <span aria-hidden="true">←</span>
        </Link>
      ) : (
        <span className="pagination-arrow is-disabled" aria-hidden="true">
          ←
        </span>
      )}
      <span className="pagination-numbers">
        {Array.from({ length: totalPages }, (_, index) => index + 1).map((number) =>
          number === page ? (
            <span key={number} className="page-numbers current" aria-current="page">
              {number}
            </span>
          ) : (
            <Link key={number} className="page-numbers" href={href(number)}>
              {number}
            </Link>
          ),
        )}
      </span>
      {page < totalPages ? (
        <Link className="pagination-arrow" href={href(page + 1)} aria-label="Next page">
          <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span className="pagination-arrow is-disabled" aria-hidden="true">
          →
        </span>
      )}
    </nav>
  );
}
