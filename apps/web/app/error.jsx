'use client';

/**
 * Root error boundary — catches unhandled errors across all routes.
 * Next.js App Router requires this to be a 'use client' component
 * with `error` and `reset` props.
 */
export default function RootError({ error, reset }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      padding: '40px 20px',
      textAlign: 'center',
    }}>
      <h2 style={{ fontSize: '22px', fontWeight: 600, marginBottom: '12px' }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: '15px', color: '#757575', marginBottom: '24px', maxWidth: '400px' }}>
        An unexpected error occurred. Try refreshing the page.
      </p>
      <button
        onClick={reset}
        style={{
          padding: '10px 24px',
          fontSize: '15px',
          fontWeight: 500,
          color: '#fff',
          backgroundColor: '#2c7a8f',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
        }}
      >
        Try again
      </button>
    </div>
  );
}
