import React from 'react';
import {
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Avatar,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import {
  WeatherSunny24Regular,
  WeatherMoon24Regular,
  SignOut24Regular,
} from '@fluentui/react-icons';
import Logo from './Logo';
import { TABS } from '../tabs';
import type { TabKey } from '../types';

const useStyles = makeStyles({
  bar: {
    position: 'sticky',
    top: 0,
    zIndex: 800,
    background: 'var(--glass)',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    borderBottom: '1px solid var(--border)',
    paddingTop: 'env(safe-area-inset-top)',
  },
  inner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    height: '56px',
    padding: '0 12px 0 16px',
    maxWidth: '1160px',
    margin: '0 auto',
    '@media (min-width: 768px)': {
      height: '64px',
      padding: '0 24px',
    },
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
  },
  wordmark: {
    fontSize: '17px',
    fontWeight: 680,
    letterSpacing: '-0.02em',
    lineHeight: 1.1,
  },
  version: {
    display: 'block',
    fontSize: '11px',
    color: 'var(--text-faint)',
  },
  spacer: { flex: 1 },
  navDesktop: {
    display: 'none',
    '@media (min-width: 768px)': {
      display: 'flex',
      gap: '4px',
    },
  },
  navLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '38px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '999px',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease',
    ':hover': {
      background: 'var(--surface-alt)',
      color: 'var(--text)',
    },
  },
  navLinkActive: {
    background: 'var(--energy-soft)',
    color: 'var(--energy)',
    ':hover': {
      background: 'var(--energy-soft)',
      color: 'var(--energy)',
    },
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
});

interface TopBarProps {
  version: string;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  isLoggedIn: boolean;
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  onSignOut: () => void;
}

const TopBar: React.FC<TopBarProps> = ({
  version,
  theme,
  onToggleTheme,
  isLoggedIn,
  activeTab,
  onTabChange,
  onSignOut,
}) => {
  const styles = useStyles();

  return (
    <header className={styles.bar}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <Logo size={30} />
          <div>
            <span className={styles.wordmark}>EleniaFlow</span>
            <span className={styles.version}>{version}</span>
          </div>
        </div>

        <div className={styles.spacer} />

        {isLoggedIn && (
          <nav className={styles.navDesktop} aria-label="Sections">
            {TABS.map(tab => {
              const active = tab.key === activeTab;
              const Icon = active ? tab.iconActive : tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onTabChange(tab.key)}
                  className={mergeClasses(styles.navLink, active && styles.navLinkActive)}
                >
                  <Icon fontSize={20} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        )}

        <div className={styles.actions}>
          <Button
            appearance="subtle"
            shape="circular"
            icon={theme === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          />
          {isLoggedIn && (
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <Avatar name="Elenia account" size={32} color="brand" style={{ cursor: 'pointer' }} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem icon={<SignOut24Regular />} onClick={onSignOut}>
                    Sign out
                  </MenuItem>
                </MenuList>
              </MenuPopover>
            </Menu>
          )}
        </div>
      </div>
    </header>
  );
};

export default TopBar;
