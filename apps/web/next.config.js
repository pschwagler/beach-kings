/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  output: 'standalone',

  // Configure API rewrites for development (proxy to FastAPI backend)
  // In production, API calls go directly to NEXT_PUBLIC_API_URL (no proxy).
  // In development, we always proxy /api/* so the client can use relative URLs and
  // avoid compile-time inlining of the backend URL (which would poison the shared .next cache).
  // Proxy target: BACKEND_PROXY_TARGET (default http://localhost:8000). E2E sets it to 8001.
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') {
      return [];
    }
    const backendTarget = process.env.BACKEND_PROXY_TARGET || 'http://localhost:8000';
    return [
      {
        source: '/api/:path*',
        destination: `${backendTarget}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
