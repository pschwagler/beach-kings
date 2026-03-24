import React from 'react';
import { LucideIcon } from 'lucide-react';

interface NavDropdownItemProps {
  icon?: LucideIcon;
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'danger' | 'league';
  className?: string;
}

export default function NavDropdownItem({
  icon: Icon,
  children,
  onClick,
  variant = 'default',
  className = ''
}: NavDropdownItemProps) {
  const variantClass = variant === 'danger' ? 'navbar-dropdown-item-danger' : '';
  const itemClass = variant === 'league' ? 'navbar-dropdown-item-league' : '';
  
  return (
    <button
      className={`navbar-dropdown-item ${variantClass} ${itemClass} ${className}`}
      onClick={onClick}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
}
