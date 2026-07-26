import React, { useState, useEffect } from 'react';
import LoginForm from './components/LoginForm';
import ConsumptionChart from './components/ConsumptionChart';
import MeteringPointInfo from './components/MeteringPointInfo';
import Settings from './components/Settings';
import axios from 'axios';

// Configure Axios base URL based on dev vs production build
axios.defaults.baseURL = import.meta.env.DEV
  ? (import.meta.env.VITE_API_URL || 'http://localhost:3000')
  : '';

import {
  Spinner,
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Avatar,
  Text,
  tokens,
  makeStyles,
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from '@fluentui/react-components';
import {
  DataBarVertical24Regular,
  Settings24Regular,
  SignOut24Regular,
  WeatherSunny24Regular,
  WeatherMoon24Regular,
} from '@fluentui/react-icons';
import { SERIES } from './theme';

const useStyles = makeStyles({
  root: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '1.5rem 2rem',
    maxWidth: '1280px',
    margin: '0 auto',
    gap: '2rem',
  },
  nav: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '1.25rem',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  brandIcon: {
    background: `linear-gradient(135deg, ${SERIES.energy}, #2f7d32)`,
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: tokens.shadow4,
    fontSize: '24px',
    color: 'white',
  },
  navActions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '3rem',
  },
  footer: {
    paddingTop: '2rem',
    textAlign: 'center',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  splashCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
});

const App: React.FC = () => {
  const styles = useStyles();
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  const [version, setVersion] = useState<string>('Unknown');

  useEffect(() => {
    axios.get('status')
      .then(res => setIsLoggedIn(res.data.logged_in === true))
      .catch(() => setIsLoggedIn(false));

    axios.get('version')
      .then(res => setVersion(res.data.version))
      .catch(() => setVersion('Unknown'));
  }, []);

  const toggleTheme = () => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      return next;
    });
  };

  const currentTheme = theme === 'dark' ? webDarkTheme : webLightTheme;
  const bgStyle = {
    minHeight: '100vh',
    background: theme === 'dark' ? '#0a0f0a' : '#f5f7f5',
    color: theme === 'dark' ? '#ffffff' : '#000000',
    transition: 'background-color 0.25s ease, color 0.25s ease',
  };

  return (
    <FluentProvider theme={currentTheme} style={bgStyle}>
      {isLoggedIn === null ? (
        <div className={styles.splashCenter}>
          <Spinner size="extra-large" label="Connecting to Elenia…" />
        </div>
      ) : (
        <div className={styles.root}>
          {/* ── Nav ── */}
          <nav className={styles.nav}>
            <div className={styles.brand}>
              <div className={styles.brandIcon}>
                <DataBarVertical24Regular />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <Text size={500} weight="semibold" style={{ letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  EleniaFlow
                </Text>
                <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>
                  {version}
                </Text>
              </div>
            </div>

            {isLoggedIn && (
              <div className={styles.navActions}>
                <Button
                  appearance="subtle"
                  icon={theme === 'dark' ? <WeatherSunny24Regular /> : <WeatherMoon24Regular />}
                  onClick={toggleTheme}
                  title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
                />
                <Button
                  appearance="subtle"
                  icon={<Settings24Regular />}
                  onClick={() => setShowSettings(true)}
                  title="Settings"
                />
                <Menu>
                  <MenuTrigger disableButtonEnhancement>
                    <Avatar name="User" size={32} style={{ cursor: 'pointer' }} color="brand" />
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      <MenuItem icon={<SignOut24Regular />} onClick={() => setIsLoggedIn(false)}>
                        Sign out
                      </MenuItem>
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </div>
            )}
          </nav>

          {/* ── Main content ── */}
          <main className={styles.main}>
            {!isLoggedIn ? (
              <LoginForm onLoginSuccess={() => setIsLoggedIn(true)} />
            ) : (
              <>
                <ConsumptionChart />
                <MeteringPointInfo />
              </>
            )}
          </main>

          {/* ── Settings panel ── */}
          {showSettings && <Settings onClose={() => setShowSettings(false)} />}

          {/* ── Footer ── */}
          <footer className={styles.footer}>
            <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
              © 2026 EleniaFlow Data Collector — Built with Rust &amp; React
            </Text>
          </footer>
        </div>
      )}
    </FluentProvider>
  );
};

export default App;
