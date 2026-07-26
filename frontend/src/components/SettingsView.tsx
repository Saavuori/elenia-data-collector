import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
  Button,
  Field,
  Input,
  Switch,
  Spinner,
  MessageBar,
  MessageBarBody,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import {
  Database24Regular,
  PlugConnected24Regular,
  ArrowSync24Regular,
  Save24Regular,
  SignOut24Regular,
  Info24Regular,
} from '@fluentui/react-icons';

import { Card, Row, RowList, SegmentedControl } from './ui';
import { errorText } from '../api';

// ── Types ─────────────────────────────────────────────────────────────────────

interface InfluxConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  enabled: boolean;
  interval_minutes: number;
}

interface InfluxStatus {
  enabled: boolean;
  last_sync: string | null;
  next_sync: string | null;
  error: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—');

const elapsed = (iso: string | null) => {
  if (!iso) return '';
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  view: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
    padding: '0 4px',
  },
  groupLabel: {
    display: 'block',
    padding: '8px 4px 0',
    fontSize: '12px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '14px',
    fontSize: '15px',
    fontWeight: 650,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  },
  toggleText: {
    minWidth: 0,
  },
  toggleTitle: {
    display: 'block',
    fontSize: '15px',
    fontWeight: 620,
  },
  toggleHint: {
    display: 'block',
    marginTop: '2px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  fieldPair: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '14px',
    '@media (min-width: 480px)': {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  actionRow: {
    display: 'flex',
    gap: '10px',
    marginTop: '16px',
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    minWidth: '150px',
    height: '44px',
    borderRadius: '12px',
    justifyContent: 'center',
  },
  schema: {
    marginTop: '14px',
    borderRadius: '14px',
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  schemaSummary: {
    display: 'flex',
    alignItems: 'center',
    minHeight: '44px',
    padding: '0 14px',
    fontSize: '13px',
    fontWeight: 620,
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  schemaCode: {
    display: 'block',
    padding: '0 14px 14px',
    fontSize: '12px',
    lineHeight: 1.9,
    color: 'var(--energy)',
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  messages: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  saveBar: {
    position: 'sticky',
    zIndex: 5,
    // Phones: float above the tab bar. Desktop: pin to the bottom of the view.
    bottom: 'calc(76px + env(safe-area-inset-bottom))',
    marginTop: '8px',
    padding: '10px',
    borderRadius: '18px',
    background: 'var(--glass)',
    backdropFilter: 'saturate(180%) blur(16px)',
    WebkitBackdropFilter: 'saturate(180%) blur(16px)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-raised)',
    '@media (min-width: 768px)': {
      bottom: '16px',
    },
  },
  saveButton: {
    width: '100%',
    height: '48px',
    borderRadius: '14px',
    justifyContent: 'center',
    fontWeight: 650,
  },
  signOut: {
    width: '100%',
    height: '44px',
    borderRadius: '12px',
    justifyContent: 'center',
    marginTop: '12px',
  },
});

// ── View ──────────────────────────────────────────────────────────────────────

interface SettingsViewProps {
  version: string;
  theme: 'dark' | 'light';
  onThemeChange: (theme: 'dark' | 'light') => void;
  onSignOut: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ version, theme, onThemeChange, onSignOut }) => {
  const styles = useStyles();

  const [cfg, setCfg] = useState<InfluxConfig>({
    url: 'http://localhost:8086', token: '', org: '', bucket: 'electricity',
    enabled: false, interval_minutes: 60,
  });
  const [status, setStatus] = useState<InfluxStatus | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; points: number; message: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [loadingTest, setLoadingTest] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [loadingSave, setLoadingSave] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [cfgRes, stRes] = await Promise.all([
          axios.get('influx/config'),
          axios.get('influx/status'),
        ]);
        setCfg(cfgRes.data);
        setStatus(stRes.data);
      } catch {
        /* backend not reachable yet — the form still renders */
      }
    };
    load();
    const id = setInterval(async () => {
      try {
        const r = await axios.get('influx/status');
        setStatus(r.data);
      } catch {
        /* transient — keep the last known status */
      }
    }, 15_000);
    return () => clearInterval(id);
  }, []);

  const handleSave = async () => {
    setLoadingSave(true); setSaveMsg(null);
    try {
      await axios.post('influx/config', cfg);
      setSaveMsg('Settings saved');
      setTimeout(() => setSaveMsg(null), 3000);
      const r = await axios.get('influx/status');
      setStatus(r.data);
    } catch (e) {
      setSaveMsg('Save failed: ' + errorText(e, 'unknown error'));
    } finally { setLoadingSave(false); }
  };

  const handleTest = async () => {
    setLoadingTest(true); setTestResult(null);
    try {
      const r = await axios.post('influx/test', cfg);
      setTestResult(r.data);
    } catch { setTestResult({ ok: false, message: 'Could not reach backend' }); }
    finally { setLoadingTest(false); }
  };

  const handleSync = async () => {
    setLoadingSync(true); setSyncResult(null);
    try {
      const r = await axios.post('influx/sync');
      setSyncResult(r.data);
      const sr = await axios.get('influx/status');
      setStatus(sr.data);
    } catch { setSyncResult({ ok: false, points: 0, message: 'Sync request failed' }); }
    finally { setLoadingSync(false); }
  };

  return (
    <div className={mergeClasses(styles.view, 'animate-fade-in')}>
      <h1 className={styles.title}>Settings</h1>

      {/* Appearance */}
      <span className={styles.groupLabel}>Appearance</span>
      <Card>
        <div className={styles.toggleRow}>
          <div className={styles.toggleText}>
            <span className={styles.toggleTitle}>Theme</span>
            <span className={styles.toggleHint}>Applies to this device only</span>
          </div>
          <SegmentedControl
            ariaLabel="Theme"
            value={theme}
            onChange={onThemeChange}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
          />
        </div>
      </Card>

      {/* Collector */}
      <span className={styles.groupLabel}>Data collection</span>
      <Card>
        <div className={styles.toggleRow}>
          <div className={styles.toggleText}>
            <span className={styles.toggleTitle}>Background collector</span>
            <span className={styles.toggleHint}>
              Push 5-minute readings to InfluxDB every {cfg.interval_minutes} min
            </span>
          </div>
          <Switch
            checked={cfg.enabled}
            onChange={(_, d) => setCfg(c => ({ ...c, enabled: d.checked }))}
            aria-label="Enable background collector"
          />
        </div>
      </Card>

      <Card>
        <div className={styles.cardHeader}>
          <Database24Regular fontSize={20} style={{ color: 'var(--energy)' }} />
          InfluxDB connection
        </div>

        <div className={styles.fields}>
          <Field label="URL">
            <Input
              id="influx-url"
              value={cfg.url}
              onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
              placeholder="http://localhost:8086"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              size="large"
            />
          </Field>
          <Field label="API token">
            <Input
              id="influx-token"
              type="password"
              value={cfg.token}
              onChange={e => setCfg(c => ({ ...c, token: e.target.value }))}
              placeholder="your-influxdb-token"
              size="large"
            />
          </Field>
          <div className={styles.fieldPair}>
            <Field label="Organization">
              <Input
                id="influx-org"
                value={cfg.org}
                onChange={e => setCfg(c => ({ ...c, org: e.target.value }))}
                placeholder="my-org"
                autoCapitalize="none"
                size="large"
              />
            </Field>
            <Field label="Bucket">
              <Input
                id="influx-bucket"
                value={cfg.bucket}
                onChange={e => setCfg(c => ({ ...c, bucket: e.target.value }))}
                placeholder="electricity"
                autoCapitalize="none"
                size="large"
              />
            </Field>
          </div>
          <Field label="Sync interval (minutes)">
            <Input
              id="influx-interval"
              type="number"
              inputMode="numeric"
              value={String(cfg.interval_minutes)}
              onChange={e => setCfg(c => ({ ...c, interval_minutes: Math.max(1, parseInt(e.target.value) || 60) }))}
              placeholder="60"
              size="large"
            />
          </Field>
        </div>

        <div className={styles.actionRow}>
          <Button
            appearance="secondary"
            className={styles.actionButton}
            icon={loadingTest ? <Spinner size="tiny" /> : <PlugConnected24Regular />}
            onClick={handleTest}
            disabled={loadingTest}
          >
            Test connection
          </Button>
          <Button
            appearance="secondary"
            className={styles.actionButton}
            icon={loadingSync ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={handleSync}
            disabled={loadingSync}
          >
            Sync now
          </Button>
        </div>

        <details className={styles.schema}>
          <summary className={styles.schemaSummary}>Data schema</summary>
          <code className={styles.schemaCode}>{`elenia_electricity
  tags: gsrn, resolution (5min|quarter)
  electricity          kWh
  electricity_netted   kWh
  spot_price           c/kWh
  spot_price_vat       c/kWh
  timestamp            seconds`}</code>
        </details>
      </Card>

      {/* Sync status */}
      {status && (
        <>
          <span className={styles.groupLabel}>Sync status</span>
          <Card padded={false}>
            <RowList>
              <Row
                label="Last sync"
                value={elapsed(status.last_sync) || '—'}
                mono
              />
              <Row label="Timestamp" value={fmtDate(status.last_sync)} mono />
              <Row label="Next sync" value={fmtDate(status.next_sync)} mono />
            </RowList>
          </Card>
        </>
      )}

      {(status?.error || testResult || syncResult || saveMsg) && (
        <div className={styles.messages}>
          {status?.error && (
            <MessageBar intent="error"><MessageBarBody>{status.error}</MessageBarBody></MessageBar>
          )}
          {testResult && (
            <MessageBar intent={testResult.ok ? 'success' : 'error'}>
              <MessageBarBody>{testResult.message}</MessageBarBody>
            </MessageBar>
          )}
          {syncResult && (
            <MessageBar intent={syncResult.ok ? 'success' : 'error'}>
              <MessageBarBody>
                {syncResult.ok ? `${syncResult.message} (today + yesterday)` : syncResult.message}
              </MessageBarBody>
            </MessageBar>
          )}
          {saveMsg && (
            <MessageBar intent={saveMsg.startsWith('Save failed') ? 'error' : 'success'}>
              <MessageBarBody>{saveMsg}</MessageBarBody>
            </MessageBar>
          )}
        </div>
      )}

      {/* About */}
      <span className={styles.groupLabel}>About</span>
      <Card>
        <div className={styles.cardHeader}>
          <Info24Regular fontSize={20} style={{ color: 'var(--text-muted)' }} />
          EleniaFlow
        </div>
        <RowList>
          <Row label="Version" value={version || 'Unknown'} mono />
          <Row label="Backend" value="Rust · Axum" />
        </RowList>
        <Button
          appearance="subtle"
          className={styles.signOut}
          icon={<SignOut24Regular />}
          onClick={onSignOut}
        >
          Sign out
        </Button>
      </Card>

      {/* Sticky save */}
      <div className={styles.saveBar}>
        <Button
          appearance="primary"
          className={styles.saveButton}
          icon={loadingSave ? <Spinner size="tiny" /> : <Save24Regular />}
          onClick={handleSave}
          disabled={loadingSave}
        >
          Save settings
        </Button>
      </div>
    </div>
  );
};

export default SettingsView;
