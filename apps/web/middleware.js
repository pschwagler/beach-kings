import { NextResponse } from 'next/server';

// Helper function to check if user is authenticated
// Since middleware runs on the edge, we can't use React context
// We'll check for the token in cookies or headers
function isAuthenticated(request) {
  // Check for auth token in cookies
  const accessToken = request.cookies.get('beach_access_token');
  // For now, we'll do a simple check - in production you might want to verify the token
  // For client-side routing, the actual auth check happens in the components
  return !!accessToken;
}

export function middleware(request) {
  const { pathname } = request.nextUrl;
  
  // Protected routes that require authentication
  const protectedRoutes = ['/home', '/league', '/whatsapp', '/admin-view', '/profile'];
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // Public routes
  const publicRoutes = ['/', '/privacy-policy', '/terms-of-service', '/signup', '/login'];
  const isPublicRoute = publicRoutes.includes(pathname) || pathname.startsWith('/api');
  
  // For protected routes, we'll let the client-side handle the redirect
  // since we need React context to check auth state properly
  // The middleware here is mainly for structure - actual protection happens in components
  
  // Allow all routes to pass through - client-side components will handle redirects
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};


