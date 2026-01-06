export default function NavDropdown({ children, className = '' }) {
  return (
    <div className={`navbar-dropdown ${className}`}>
      {children}
    </div>
  );
}
