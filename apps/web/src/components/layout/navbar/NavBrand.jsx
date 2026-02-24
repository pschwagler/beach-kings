'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';

export default function NavBrand() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleClick = (e) => {
    e.preventDefault();
    router.push(isAuthenticated ? '/home' : '/');
  };

  return (
    <Link
      href={isAuthenticated ? '/home' : '/'}
      className="navbar-brand"
      onClick={handleClick}
    >
      <span className="navbar-brand-text">Beach League</span>
    </Link>
  );
}
