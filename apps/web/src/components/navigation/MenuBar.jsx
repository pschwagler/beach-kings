import React, { useEffect, useState, useMemo, useRef } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

/**
 * MenuBar
 *
 * Responsive menubar used for primary app navigation.
 *
 * - On desktop it renders as a left sidebar navigation rail.
 * - On mobile (<= 768px) CSS moves it to the bottom of the viewport
 *   and lays items out horizontally as a bottom menu bar.
 *
 * This component intentionally keeps using existing `.league-sidebar` /
 * `.sidebar` class names so we can share the current styling without
 * changing layout behavior. Conceptually this is a "menubar", not a
 * generic sidebar.
 */

export default function MenuBar({
  variant = 'league', // 'league' | 'home'
  title,
  titleNode,
  items,
  initialCollapsed,
  className = '',
  showCollapseButton = true,
  children,
}) {
  const moreButtonRef = useRef(null);

  // Always start with the same initial state on server and client to avoid hydration mismatch
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? false);

  // Auto-collapse on small screens after mount (client-side only)
  useEffect(() => {
    // Set initial collapsed state based on screen size (only runs on client)
    if (window.innerWidth <= 768) {
      setCollapsed(true);
    }

    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setCollapsed(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const wrapperClassName = useMemo(() => {
    const base =
      variant === 'home'
        ? 'sidebar sidebar--home'
        : 'league-sidebar';
    const collapsedClass = collapsed ? 'collapsed' : '';
    return [base, collapsedClass, className].filter(Boolean).join(' ');
  }, [variant, collapsed, className]);

  const headerContent = useMemo(() => {
    if (titleNode) {
      return titleNode;
    }

    if (!title) {
      return null;
    }

    return (
      <div className="league-sidebar-title-wrapper-container">
        <div className="league-sidebar-title-wrapper no-pointer">
          <h1 className="league-sidebar-title">{title}</h1>
        </div>
      </div>
    );
  }, [titleNode, title]);

  return (
    <aside className={wrapperClassName}>
      <div className="league-sidebar-header">
        {headerContent}
        {showCollapseButton && (
          <button
            className="league-sidebar-collapse-btn"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          </button>
        )}
      </div>

      <nav className="league-sidebar-nav" aria-label="Primary navigation">
        {items?.map((item) => {
          const { id, label, icon: Icon, active, onClick, title: itemTitle, className: itemClassName } = item;
          const itemClasses = [
            'league-sidebar-nav-item',
            active ? 'active' : '',
            itemClassName || '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={id}
              className={itemClasses}
              onClick={onClick}
              title={itemTitle || label}
              aria-current={active ? 'page' : undefined}
              type="button"
              ref={id === 'more' ? moreButtonRef : undefined}
              data-testid={`${id}-tab`}
            >
              {Icon && <Icon size={20} />}
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {typeof children === 'function' ? children({ moreButtonRef }) : children}
    </aside>
  );
}
