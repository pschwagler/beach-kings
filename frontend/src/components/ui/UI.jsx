import { useState, useRef, useEffect } from 'react';
import { Calendar, Trophy } from 'lucide-react';

// Button Component - handles all button variants
export function Button({ 
  children, 
  onClick, 
  disabled = false, 
  variant = 'default',
  className = '',
  active = false,
  type = 'button',
  style = {}
}) {
  let buttonClass = 'button';
  
  if (variant === 'success') {
    buttonClass = 'button btn-success';
  } else if (variant === 'danger') {
    buttonClass = 'button btn-danger';
  } else if (variant === 'whatsapp') {
    buttonClass = 'button btn-whatsapp';
  } else if (variant === 'tab') {
    buttonClass = `tab ${active ? 'active' : ''}`;
  } else if (variant === 'close') {
    buttonClass = 'close-btn';
  }
  
  return (
    <button
      type={type}
      className={`${buttonClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
    >
      {children}
    </button>
  );
}

// Alert Component - displays messages
export function Alert({ type, children, className = '' }) {
  if (!type || !children) return null;
  
  return (
    <div className={`${type} ${className}`}>
      {children}
    </div>
  );
}

// Tooltip Component - React-based tooltip
export function Tooltip({ children, text }) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);
  
  const handleMouseEnter = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Set initial position and show the tooltip
    setPosition({
      top: rect.top - 10,
      left: rect.left + rect.width / 2,
    });
    setIsVisible(true);
  };
  
  const handleMouseLeave = () => {
    setIsVisible(false);
  };
  
  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="tooltip-trigger"
      >
        {children}
      </span>
      {isVisible && (
        <div
          ref={tooltipRef}
          className="tooltip tooltip-fixed"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          {text}
        </div>
      )}
    </>
  );
}

// Tabs Component - tab navigation
export function Tabs({ activeTab, onTabChange }) {
  return (
    <div className="tabs">
      <Button
        variant="tab"
        active={activeTab === 'rankings'}
        onClick={() => onTabChange('rankings')}
      >
        <Trophy size={18} />
        League Standings
      </Button>
      <Button
        variant="tab"
        active={activeTab === 'matches'}
        onClick={() => onTabChange('matches')}
      >
        <Calendar size={18} />
        Matches
      </Button>
    </div>
  );
}


