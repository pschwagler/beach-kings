/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React strict mode
  reactStrictMode: true,
  
  
  // Configure API rewrites for development (proxy to FastAPI backend)
  // In production, API calls go directly to NEXT_PUBLIC_API_URL
  async rewrites() {
    // Only proxy in development when NEXT_PUBLIC_API_URL is not set
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

