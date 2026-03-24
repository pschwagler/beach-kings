import React from 'react';

interface NavDropdownSectionProps {
  title?: string;
  children: React.ReactNode;
}

export default function NavDropdownSection({ title, children }: NavDropdownSectionProps) {
  return (
    <div className="navbar-dropdown-section">
      {title && <div className="navbar-dropdown-header">{title}</div>}
      {children}
    </div>
  );
}
