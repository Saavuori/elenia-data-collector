import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FluentProvider, Spinner, makeStyles } from '@fluentui/react-components';

import LoginForm from './components/LoginForm';
import TopBar from './components/TopBar';
import BottomNav from './components/BottomNav';
import UsageView from './components/UsageView';
import SitesView from './components/SitesView';
import SettingsView from './components/SettingsView';
import Logo from './components/Logo';
import { PALETTES, PaletteProvider, applyPaletteToDocument, darkTheme, lightTheme } from './theme';
import type { TabKey } from './types';

// Configure Axios base URL based on dev vs production build
axios.defaults.baseURL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  : '';

const useStyles = makeStyles({
  app: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
    color: 'var(--text)',
  },
  main: {
    flex: 1,
    width: '100%',
    maxWidth: '1160px',
    margin: '0 auto',
    padding: '16px 16px calc(88px + env(safe-area-inset-bottom))',
    '@media (min-width: 768px)': {
      padding: '28px 24px 48px',
    },
  },
  splash: {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    background: 'var(--bg)',
  },
  splashText: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
});

const prefersLight = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;

const App: React.FC = () => {
  const styles = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabKey>('usage');
  const [version, setVersion] = useState<string>('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return prefersLight() ? 'light' : 'dark';
  });

  const palette = PALETTES[theme];

  useEffect(() => {
    applyPaletteToDocument(palette);
  }, [palette]);

  useEffect(() => {
    axios.get('status')
      .then(res => setIsLoggedIn(res.data.logged_in === true))
      .catch(() => setIsLoggedIn(false));

    axios.get('version')
      .then(res => setVersion(res.data.version))
      .catch(() => setVersion(''));
  }, []);

  // Views are swapped in place, so send the reader back to the top.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [tab]);

  const selectTheme = (next: 'dark' | 'light') => {
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  const toggleTheme = () => selectTheme(theme === 'dark' ? 'light' : 'dark');

  const handleSignOut = () => {
    setIsLoggedIn(false);
    setTab('usage');
  };

  return (
    <FluentProvider theme={theme === 'dark' ? darkTheme : lightTheme} style={{ background: 'var(--bg)' }}>
      <PaletteProvider value={palette}>
        {isLoggedIn === null ? (
          <div className={styles.splash}>
            <Logo size={56} radius={16} />
            <Spinner size="small" />
            <span className={styles.splashText}>Connecting to Elenia…</span>
          </div>
        ) : (
          <div className={styles.app}>
            <TopBar
              version={version}
              theme={theme}
              onToggleTheme={toggleTheme}
              isLoggedIn={isLoggedIn}
              activeTab={tab}
              onTabChange={setTab}
              onSignOut={handleSignOut}
            />

            <main className={styles.main}>
              {!isLoggedIn ? (
                <LoginForm onLoginSuccess={() => setIsLoggedIn(true)} />
              ) : tab === 'usage' ? (
                <UsageView />
              ) : tab === 'sites' ? (
                <SitesView />
              ) : (
                <SettingsView
                  version={version}
                  theme={theme}
                  onThemeChange={selectTheme}
                  onSignOut={handleSignOut}
                />
              )}
            </main>

            {isLoggedIn && <BottomNav active={tab} onChange={setTab} />}
          </div>
        )}
      </PaletteProvider>
    </FluentProvider>
  );
};

export default App;
