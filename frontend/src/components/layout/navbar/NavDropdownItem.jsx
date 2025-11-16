export default function NavDropdownItem({ 
  icon: Icon, 
  children, 
  onClick, 
  variant = 'default' 
}) {
  const variantClass = variant === 'danger' ? 'navbar-dropdown-item-danger' : '';
  const itemClass = variant === 'league' ? 'navbar-dropdown-item-league' : '';
  
  return (
    <button
      className={`navbar-dropdown-item ${variantClass} ${itemClass}`}
      onClick={onClick}
    >
      {Icon && <Icon size={18} />}
      {children}
    </button>
  );
}

