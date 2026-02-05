/**
 * Returns the backend base URL for WebSocket/SSE in development.
 * In production we only expose this when BACKEND_PROXY_TARGET is set (e.g. preview envs);
 * otherwise 404 to avoid exposing the backend URL unnecessarily.
 */
export async function GET() {
  const url =
    process.env.BACKEND_PROXY_TARGET ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000';

  // In production, only respond if BACKEND_PROXY_TARGET is explicitly set
  if (process.env.NODE_ENV === 'production' && !process.env.BACKEND_PROXY_TARGET) {
    return new Response(null, { status: 404 });
  }

  return Response.json({ url });
}
