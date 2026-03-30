// Type shim for react-map-gl: only sub-path exports exist (./mapbox, ./maplibre, etc.)
// so a bare `import ... from 'react-map-gl'` needs this fallback shim.
declare module 'react-map-gl';

// Styled-jsx support: allow <style jsx> in TSX files
declare namespace React {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}
