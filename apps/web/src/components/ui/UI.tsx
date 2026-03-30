import { useState, useRef, useEffect, ReactNode, CSSProperties } from 'react';
import { Calendar, Trophy } from 'lucide-react';
import './Button.css';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  children?: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  variant?: 'default' | 'success' | 'danger' | 'tab' | 'close' | 'ghost' | 'outline';
  size?: 'sm' | 'small' | 'default';
  className?: string;
  active?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  form?: string;
}

// Button Component - handles all button variants
export function Button({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  className = '',
  active = false,
  type = 'button',
  style = {},
  form,
  ...rest
}: ButtonProps) {
  let buttonClass = 'button';
  
  if (variant === 'success') {
    buttonClass = 'button btn-success';
  } else if (variant === 'danger') {
    buttonClass = 'button btn-danger';
  } else if (variant === 'tab') {
    buttonClass = `tab ${active ? 'active' : ''}`;
  } else if (variant === 'close') {
    buttonClass = 'close-btn';
  } else if (variant === 'ghost') {
    buttonClass = 'button btn-ghost';
  } else if (variant === 'outline') {
    buttonClass = 'button btn-outline';
  }
  
  return (
    <button
      type={type}
      className={`${buttonClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      style={style}
      form={form}
      {...rest}
    >
      {children}
    </button>
  );
}

interface AlertProps {
  type?: 'error' | 'success' | 'info' | 'warning' | string;
  children?: ReactNode;
  className?: string;
}

// Alert Component - displays messages
export function Alert({ type, children, className = '' }: AlertProps) {
  if (!type || !children) return null;
  
  return (
    <div className={`${type} ${className}`}>
      {children}
    </div>
  );
}

interface TooltipProps {
  children: ReactNode;
  text: string;
  multiline?: boolean;
}

// Tooltip Component - React-based tooltip
export function Tooltip({ children, text, multiline = false }: TooltipProps) {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  
  const handleMouseEnter = (e: React.MouseEvent<HTMLSpanElement>) => {
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
          className={`tooltip tooltip-fixed ${multiline ? 'tooltip-multiline' : ''}`}
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

interface TabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

// Tabs Component - tab navigation
export function Tabs({ activeTab, onTabChange }: TabsProps) {
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
        Games
      </Button>
    </div>
  );
}
