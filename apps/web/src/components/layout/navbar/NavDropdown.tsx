import React from 'react';

interface NavDropdownProps {
  children: React.ReactNode;
  className?: string;
}

export default function NavDropdown({ children, className = '' }: NavDropdownProps) {
  return (
    <div className={`navbar-dropdown ${className}`}>
      {children}
    </div>
  );
}
