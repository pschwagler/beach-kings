import { Crown } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { navigateTo } from '../../../Router';

export default function NavBrand() {
  const { isAuthenticated } = useAuth();

  const handleClick = (e) => {
    e.preventDefault();
    navigateTo(isAuthenticated ? '/home' : '/');
  };

  return (
    <div className="navbar-left">
      <a href={isAuthenticated ? '/home' : '/'} className="navbar-brand" onClick={handleClick}>
        <img 
          src="/beach-league-gold-on-navy.png" 
          alt="Beach League" 
          className="navbar-brand-logo"
        />
      </a>
    </div>
  );
}
