'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../../contexts/AuthContext';

export default function NavBrand() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleClick = (e) => {
    e.preventDefault();
    router.push(isAuthenticated ? '/home' : '/');
  };

  return (
    <div className="navbar-left">
      <Link href={isAuthenticated ? '/home' : '/'} className="navbar-brand" onClick={handleClick}>
        <Image 
          src="/beach-league-gold-on-navy.png" 
          alt="Beach League" 
          width={150}
          height={40}
          priority
          className="navbar-brand-logo"
          style={{ width: 'auto', height: 'auto' }}
        />
      </Link>
    </div>
  );
}
