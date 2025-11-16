import { Crown } from 'lucide-react';

export default function NavBrand() {
  return (
    <div className="navbar-left">
      <a href="/" className="navbar-brand">
        <Crown size={24} className="navbar-brand-crown" />
        <span className="navbar-brand-text">BEACH KINGS</span>
      </a>
    </div>
  );
}
