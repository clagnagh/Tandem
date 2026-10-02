import type { NextConfig } from 'next';

// The browser only ever talks to this app. Requests to /api/* are forwarded
// to the Fastify server, so cookies stay first-party on one origin
// (docs/adr/0002).
const apiOrigin = process.env.API_ORIGIN ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  typedRoutes: true,
  rewrites() {
    return Promise.resolve([{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }]);
  },
};

export default nextConfig;
