import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  // The dev overlay is a development-only floating badge; it obscured the
  // bottom-left corner of visual-regression captures and is never rendered in
  // production.
  devIndicators: false,
  async rewrites() {
    // The public site posts comments to the API over a same-origin URL. In
    // production Caddy routes /api to Fastify before Next; in local development
    // this rewrite provides the same path.
    const api = process.env.MERNPRESS_API_URL || 'http://127.0.0.1:4000';
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
