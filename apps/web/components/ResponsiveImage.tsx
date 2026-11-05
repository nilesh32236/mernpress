import { mediaUrl, type FeaturedImage } from '@/lib/api';

const WIDTH_PATTERN = /^(\d+)$/;

function srcSetFor(derivatives: Record<string, string>, suffix: '' | ':avif'): string | null {
  const entries: Array<{ width: number; url: string }> = [];
  for (const [key, path] of Object.entries(derivatives)) {
    if (suffix === ':avif') {
      if (!key.endsWith(':avif')) continue;
      const width = Number(key.slice(0, -':avif'.length));
      if (Number.isFinite(width) && width > 0) entries.push({ width, url: path });
      continue;
    }
    const match = WIDTH_PATTERN.exec(key);
    if (!match) continue;
    entries.push({ width: Number(match[1]), url: path });
  }
  if (entries.length === 0) return null;
  entries.sort((left, right) => left.width - right.width);
  return entries.map((entry) => `${mediaUrl(entry.url)} ${entry.width}w`).join(', ');
}

/**
 * Content image with modern format negotiation.
 *
 * The upload pipeline stores every derivative twice (AVIF + WebP); this renders
 * both in a `<picture>`, so supporting browsers download the smaller AVIF while
 * everyone else gets WebP via the `<img>` fallback. Explicit width/height keep
 * the intrinsic ratio and avoid layout shift (Core Web Vitals).
 */
export default function ResponsiveImage({
  image,
  sizes,
  className,
  loading = 'lazy',
  fetchPriority,
}: {
  image: FeaturedImage;
  sizes: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}) {
  const avif = srcSetFor(image.derivatives, ':avif');
  const webp = srcSetFor(image.derivatives, '');
  const fallback = image.derivatives['1200'] ?? image.url;
  return (
    <picture>
      {avif ? <source type="image/avif" srcSet={avif} sizes={sizes} /> : null}
      {webp ? <source type="image/webp" srcSet={webp} sizes={sizes} /> : null}
      <img
        src={mediaUrl(fallback)}
        alt={image.altText}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        className={className}
        loading={loading}
        decoding="async"
        {...(fetchPriority ? { fetchPriority } : {})}
      />
    </picture>
  );
}
