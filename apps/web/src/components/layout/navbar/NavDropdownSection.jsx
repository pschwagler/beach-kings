export default function NavDropdownSection({ title, children }) {
  return (
    <div className="navbar-dropdown-section">
      {title && <div className="navbar-dropdown-header">{title}</div>}
      {children}
    </div>
  );
}
