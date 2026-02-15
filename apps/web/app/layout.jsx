import ClientProviders from './ClientProviders';
import '../src/index.css';
import '../src/App.css';

export const metadata = {
  metadataBase: new URL('https://beachleaguevb.com'),
  title: {
    default: 'Beach League Volleyball',
    template: '%s | Beach League Volleyball',
  },
  description:
    'Find and join beach volleyball leagues near you. Track stats, ELO ratings, standings, and connect with players in your area.',
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    siteName: 'Beach League Volleyball',
    images: [{ url: '/og-default.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
  },
  // verification: {
  //   google: 'GSC_VERIFICATION_CODE',
  // },
  other: {
    'mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1.0,
  maximumScale: 5.0,
  minimumScale: 1.0,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
