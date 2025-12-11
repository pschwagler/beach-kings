import { useState, useEffect } from 'react';

const HERO_IMAGES = [
  '/beach-kings.png',
  '/side-out-movie-cover.png',
  '/top-gun-vball.png'
];

const ROTATION_INTERVAL_MS = 10000;

export default function HeroHeader() {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % HERO_IMAGES.length);
    }, ROTATION_INTERVAL_MS);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div 
      className="hero-header" 
      style={{ "--hero-bg-image": `url(${HERO_IMAGES[currentImageIndex]})` }}
    >
    </div>
  );
}

