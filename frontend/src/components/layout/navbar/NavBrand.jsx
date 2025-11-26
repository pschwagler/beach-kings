import { Crown } from 'lucide-react';

export default function NavBrand() {
  return (
    <div className="navbar-left">
      <a href="/" className="navbar-brand">
        <img 
          src="/beach-league-gold-on-navy.png" 
          alt="Beach League" 
          className="navbar-brand-logo"
        />
      </a>
    </div>
  );
}
