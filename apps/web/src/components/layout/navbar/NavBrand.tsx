'use client';

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../contexts/AuthContext';

export default function NavBrand() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    router.push(isAuthenticated ? '/home' : '/');
  };

  return (
    <Link
      href={isAuthenticated ? '/home' : '/'}
      className="navbar-brand"
      onClick={handleClick}
    >
      <Image
        src="/brand/lockup-on-dark-640.png"
        alt="Beach League"
        width={640}
        height={176}
        className="navbar-brand-logo"
        preload
      />
    </Link>
  );
}
