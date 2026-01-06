/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  output: 'standalone',
  
  
  // Configure API rewrites for development (proxy to FastAPI backend)
  // In production, API calls go directly to NEXT_PUBLIC_API_URL
  // 
  // For local development:
  // - If NEXT_PUBLIC_API_URL is set (in root .env file, symlinked to apps/web/.env), it will be used directly
  // - If NEXT_PUBLIC_API_URL is not set, requests to /api/* will be proxied to http://localhost:8000
  // 
  // For E2E tests:
  // - Playwright sets NEXT_PUBLIC_API_URL=http://localhost:8001 via command line, which overrides .env
  async rewrites() {
    // Only proxy in development when NEXT_PUBLIC_API_URL is not set
    // This allows root .env to set it to http://localhost:8000 for normal dev,
    // and Playwright to override it to http://localhost:8001 for tests
    if (process.env.NODE_ENV === 'development' && !process.env.NEXT_PUBLIC_API_URL) {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:8000/api/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
