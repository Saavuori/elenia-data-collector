import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import {
  Field,
  Input,
  Button,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
  tokens,
  makeStyles,
} from '@fluentui/react-components';
import {
  DataBarVertical24Regular,
  PersonKey24Regular,
} from '@fluentui/react-icons';
import { SERIES } from '../theme';

interface LoginFormProps {
  onLoginSuccess: () => void;
}

const useStyles = makeStyles({
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    padding: '4rem 1rem',
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    padding: tokens.spacingVerticalXXL,
    boxShadow: tokens.shadow16,
    borderRadius: tokens.borderRadiusXLarge,
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalM,
    textAlign: 'center',
  },
  iconRing: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${SERIES.energy}, #2f7d32)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: tokens.shadow8,
    fontSize: '32px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
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

  // The backend passes Elenia's own error text through, which is far more
  // useful than a generic "login failed".
  const errorMessage =
    (loginMutation.error as any)?.response?.data ||
    'Login failed — please check your credentials.';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.hero}>
          <div className={styles.iconRing}>
            <DataBarVertical24Regular style={{ color: 'white' }} />
          </div>
          <Text size={700} weight="semibold">EleniaFlow</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            Sign in with your Elenia Aina credentials to access your energy insights
          </Text>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <Field label="Email address" required>
            <Input
              id="login-email"
              type="email"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="your@email.com"
              size="large"
              appearance="outline"
            />
          </Field>

          <Field label="Password" required>
            <Input
              id="login-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              size="large"
              appearance="outline"
            />
          </Field>

          {loginMutation.isError && (
            <MessageBar intent="error">
              <MessageBarBody>{String(errorMessage)}</MessageBarBody>
            </MessageBar>
          )}

          <Button
            type="submit"
            appearance="primary"
            size="large"
            disabled={loginMutation.isPending}
            icon={loginMutation.isPending ? <Spinner size="tiny" /> : <PersonKey24Regular />}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default LoginForm;
