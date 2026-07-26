import React from 'react';
import { makeStyles, mergeClasses } from '@fluentui/react-components';
import { TABS } from '../tabs';
import type { TabKey } from '../types';

const useStyles = makeStyles({
  bar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 800,
    display: 'flex',
    background: 'var(--glass)',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    borderTop: '1px solid var(--border)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    // The tab bar is a phone affordance; desktop navigates from the app bar.
    '@media (min-width: 768px)': {
      display: 'none',
    },
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '3px',
    minHeight: '56px',
    padding: '8px 0 6px',
    border: 'none',
    background: 'transparent',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    transition: 'color 0.18s ease',
  },
  tabActive: {
    color: 'var(--energy)',
  },
  iconWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    height: '26px',
    borderRadius: '999px',
    transition: 'background 0.2s ease',
  },
  iconWrapActive: {
    background: 'var(--energy-soft)',
  },
  label: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
});

const BottomNav: React.FC<{
  active: TabKey;
  onChange: (tab: TabKey) => void;
}> = ({ active, onChange }) => {
  const styles = useStyles();

  return (
    <nav className={styles.bar} aria-label="Sections">
      {TABS.map(tab => {
        const isActive = tab.key === active;
        const Icon = isActive ? tab.iconActive : tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onChange(tab.key)}
            className={mergeClasses(styles.tab, isActive && styles.tabActive)}
          >
            <span className={mergeClasses(styles.iconWrap, isActive && styles.iconWrapActive)}>
              <Icon fontSize={22} />
            </span>
            <span className={styles.label}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
