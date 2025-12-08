import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';

export default function NavBrand() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleClick = (e) => {
    e.preventDefault();
    navigate(isAuthenticated ? '/home' : '/');
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
