// Type shims for packages without @types/ definitions
declare module 'mapbox-gl';
declare module 'react-map-gl';
declare module 'heic-to';
declare module 'react-easy-crop';
declare module 'eventsource-parser';

// Styled-jsx support: allow <style jsx> in TSX files
declare namespace React {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
