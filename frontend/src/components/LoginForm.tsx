import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import {
  Field,
  Input,
  Button,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
} from '@fluentui/react-components';
import { ShieldCheckmark20Regular } from '@fluentui/react-icons';
import Logo from './Logo';
import { errorText } from '../api';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    minHeight: 'calc(100dvh - 160px)',
    padding: '8px 0 24px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    '@media (min-width: 768px)': {
      padding: '32px',
      borderRadius: '24px',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-raised)',
    },
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: '12px',
  },
  title: {
    fontSize: '26px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.15,
  },
  subtitle: {
    fontSize: '14px',
    lineHeight: 1.5,
    color: 'var(--text-muted)',
    maxWidth: '300px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  submit: {
    width: '100%',
    height: '48px',
    justifyContent: 'center',
    borderRadius: '14px',
    fontWeight: 650,
  },
  note: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-faint)',
    textAlign: 'center',
  },
});

const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const styles = useStyles();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const loginMutation = useMutation({
    mutationFn: async () => {
      await axios.post('login', { username, password });
    },
    onSuccess: onLoginSuccess,
  });

  const errorMessage = errorText(
    loginMutation.error,
    'Login failed — please check your credentials.',
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.hero}>
          <Logo size={56} radius={16} />
          <span className={styles.title}>Welcome back</span>
          <span className={styles.subtitle}>
            Sign in with your Elenia Aina account to follow your electricity use.
          </span>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Field label="Email address" required>
            <Input
              id="login-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your@email.com"
              size="large"
            />
          </Field>

          <Field label="Password" required>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              size="large"
            />
          </Field>

          {loginMutation.isError && (
            <MessageBar intent="error">
              <MessageBarBody>{errorMessage}</MessageBarBody>
            </MessageBar>
          )}

          <Button
            type="submit"
            appearance="primary"
            size="large"
            disabled={loginMutation.isPending || !username || !password}
            icon={loginMutation.isPending ? <Spinner size="tiny" /> : undefined}
            className={styles.submit}
          >
            {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <span className={styles.note}>
          <ShieldCheckmark20Regular fontSize={16} />
          Signs in to Elenia Aina through your own EleniaFlow server.
        </span>
      </div>
    </div>
  );
};

export default LoginForm;
