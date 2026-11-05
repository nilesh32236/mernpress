import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ResponsiveImage from '../components/ResponsiveImage';

const image = {
  id: 'm1',
  url: '/api/media/m1/abc.webp',
  width: 1600,
  height: 900,
  altText: 'A beach',
  derivatives: {
    '300': '/api/media/m1/abc-300.webp',
    '600': '/api/media/m1/abc-600.webp',
    '1200': '/api/media/m1/abc-1200.webp',
    '300:avif': '/api/media/m1/abc-300.avif',
    '600:avif': '/api/media/m1/abc-600.avif',
    '1200:avif': '/api/media/m1/abc-1200.avif',
  },
};

describe('ResponsiveImage', () => {
  it('offers AVIF and WebP srcsets with an intrinsic-size fallback', () => {
    const html = renderToStaticMarkup(
      <ResponsiveImage image={image} sizes="(max-width: 760px) 100vw, 760px" />,
    );
    expect(html).toContain('<source type="image/avif"');
    expect(html).toContain('abc-300.avif 300w');
    expect(html).toContain('abc-1200.avif 1200w');
    expect(html).toContain('<source type="image/webp"');
    expect(html).toContain('abc-300.webp 300w');
    expect(html).toContain('sizes="(max-width: 760px) 100vw, 760px"');
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="900"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    // The AVIF key must never leak into the WebP srcset.
    expect(html).not.toContain('abc-300.webp 300w, /api/media/m1/abc-300.avif');
  });

  it('renders a plain img when only the canonical file exists', () => {
    const html = renderToStaticMarkup(
      <ResponsiveImage
        image={{ ...image, derivatives: {} }}
        sizes="100vw"
        loading="eager"
        fetchPriority="high"
      />,
    );
    expect(html).not.toContain('<source');
    expect(html).toContain('/api/media/m1/abc.webp');
    expect(html).toContain('loading="eager"');
    expect(html.toLowerCase()).toContain('fetchpriority="high"');
  });
});
