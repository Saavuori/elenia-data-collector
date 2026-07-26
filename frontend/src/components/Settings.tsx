import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Field,
  Input,
  Switch,
  Spinner,
  Text,
  MessageBar,
  MessageBarBody,
  tokens,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components';
import {
  Database24Regular,
  Dismiss24Regular,
  Wifi424Regular,
  ArrowSync24Regular,
  Save24Regular,
  Clock24Regular,
  BoxMultiple24Regular,
} from '@fluentui/react-icons';
import type { MeteringPoint } from './MeteringPointInfo';
import { SERIES } from '../theme';

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
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(4px)',
    zIndex: 1000,
  },
  panel: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: 'min(500px, 100vw)',
    background: tokens.colorNeutralBackground1,
    borderLeft: `1px solid ${tokens.colorNeutralStroke2}`,
    zIndex: 1001,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: tokens.shadow64,
  },
  panelHeader: {
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXL}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    background: tokens.colorNeutralBackground2,
    flexShrink: 0,
  },
  panelHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  iconBox: {
    background: `linear-gradient(135deg, ${SERIES.energy}, #2f7d32)`,
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: tokens.shadow4,
    fontSize: '20px',
    color: 'white',
  },
  panelBody: {
    padding: tokens.spacingHorizontalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
    flex: 1,
  },
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    background: tokens.colorNeutralBackground3,
    gap: tokens.spacingHorizontalM,
  },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: tokens.fontWeightSemibold,
  },
  fieldsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  fieldRow2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
  },
  schemaBox: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  schemaCode: {
    fontSize: tokens.fontSizeBase200,
    color: '#a5d6a7',
    lineHeight: 1.8,
    display: 'block',
    fontFamily: tokens.fontFamilyMonospace,
  },
  statusGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalM,
  },
  statusCell: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  panelFooter: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalXL}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
    background: tokens.colorNeutralBackground2,
    flexShrink: 0,
  },
});

// ── Settings component ────────────────────────────────────────────────────────

interface SettingsProps { onClose: () => void; }

const Settings: React.FC<SettingsProps> = ({ onClose }) => {
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
  const queryClient = useQueryClient();

  const [meteringPoints, setMeteringPoints] = useState<MeteringPoint[]>([]);
  const [selectedGsrn, setSelectedGsrn] = useState<string | null>(null);
  const [loadingPoints, setLoadingPoints] = useState(false);

  const fetchMeteringPoints = async () => {
    setLoadingPoints(true);
    try {
      const res = await axios.get('metering-points');
      setMeteringPoints(res.data.metering_points || []);
      setSelectedGsrn(res.data.selected_gsrn || null);
    } catch (e) {
      console.error('Failed to fetch metering points', e);
    } finally {
      setLoadingPoints(false);
    }
  };

  const handleSelectPoint = async (gsrn: string) => {
    try {
      await axios.post('metering-points/select', { gsrn });
      setSelectedGsrn(gsrn);
      queryClient.invalidateQueries({ queryKey: ['consumption'] });
      queryClient.invalidateQueries({ queryKey: ['metering-points'] });
      await fetchMeteringPoints();
    } catch (e) {
      console.error('Failed to select metering point', e);
    }
  };

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
        /* backend not reachable yet — the panel still renders */
      }
    };
    load();
    fetchMeteringPoints();
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
      setSaveMsg('Saved successfully');
      setTimeout(() => setSaveMsg(null), 3000);
      const r = await axios.get('influx/status');
      setStatus(r.data);
    } catch (e: any) {
      setSaveMsg('Save failed: ' + (e.message ?? 'unknown error'));
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
    <>
      {/* Backdrop */}
      <div className={styles.backdrop} onClick={onClose} />

      {/* Slide-in panel */}
      <div className={mergeClasses(styles.panel, 'slide-in-right')}>

        {/* Header */}
        <div className={styles.panelHeader}>
          <div className={styles.panelHeaderLeft}>
            <div className={styles.iconBox}>
              <Database24Regular />
            </div>
            <div>
              <Text size={400} weight="semibold" style={{ display: 'block' }}>Settings</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Metering point &amp; InfluxDB export</Text>
            </div>
          </div>
          <Button
            appearance="subtle"
            icon={<Dismiss24Regular />}
            onClick={onClose}
            aria-label="Close settings"
          />
        </div>

        {/* Body */}
        <div className={styles.panelBody}>

          {/* Metering points */}
          <div>
            <div className={styles.sectionLabel}>
              <BoxMultiple24Regular style={{ fontSize: '15px' }} />
              Metering Points
            </div>
            {loadingPoints ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px' }}>
                <Spinner size="tiny" />
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Loading metering points…</Text>
              </div>
            ) : meteringPoints.length === 0 ? (
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>No metering points found.</Text>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {meteringPoints.map(mp => {
                  const isSelected = selectedGsrn === mp.gsrn;
                  const city = [mp.postal_code, mp.city].filter(Boolean).join(' ');
                  return (
                    <div
                      key={mp.gsrn}
                      style={{
                        padding: '12px 14px',
                        borderRadius: tokens.borderRadiusMedium,
                        border: `1px solid ${isSelected ? SERIES.energy : tokens.colorNeutralStroke2}`,
                        background: isSelected ? 'rgba(99, 167, 10, 0.08)' : tokens.colorNeutralBackground3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <Text size={300} weight="semibold" style={{ display: 'block' }}>
                          {mp.street_address || 'Metering point'}{city ? `, ${city}` : ''}
                        </Text>
                        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>
                          GSRN: {mp.gsrn}
                        </Text>
                        <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>
                          {mp.product_description || 'Electricity'} • Customer {mp.customer_id}
                        </Text>
                      </div>
                      <Button
                        appearance={isSelected ? 'primary' : 'secondary'}
                        disabled={isSelected}
                        onClick={() => handleSelectPoint(mp.gsrn)}
                        size="small"
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Enable toggle */}
          <div className={styles.toggleRow}>
            <div>
              <Text size={300} weight="semibold" style={{ display: 'block' }}>Background Collector</Text>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Auto-sync 5-minute Elenia data to InfluxDB every {cfg.interval_minutes} min
              </Text>
            </div>
            <Switch
              checked={cfg.enabled}
              onChange={(_, d) => setCfg(c => ({ ...c, enabled: d.checked }))}
              aria-label="Enable background collector"
            />
          </div>

          {/* Connection fields */}
          <div>
            <div className={styles.sectionLabel}>
              <Wifi424Regular style={{ fontSize: '15px' }} />
              Connection
            </div>
            <div className={styles.fieldsGrid}>
              <Field label="InfluxDB URL">
                <Input id="influx-url" value={cfg.url}
                  onChange={e => setCfg(c => ({ ...c, url: e.target.value }))}
                  placeholder="http://localhost:8086" appearance="outline" />
              </Field>
              <Field label="API Token">
                <Input id="influx-token" type="password" value={cfg.token}
                  onChange={e => setCfg(c => ({ ...c, token: e.target.value }))}
                  placeholder="your-influxdb-token" appearance="outline" />
              </Field>
              <div className={styles.fieldRow2}>
                <Field label="Organization">
                  <Input id="influx-org" value={cfg.org}
                    onChange={e => setCfg(c => ({ ...c, org: e.target.value }))}
                    placeholder="my-org" appearance="outline" />
                </Field>
                <Field label="Bucket">
                  <Input id="influx-bucket" value={cfg.bucket}
                    onChange={e => setCfg(c => ({ ...c, bucket: e.target.value }))}
                    placeholder="electricity" appearance="outline" />
                </Field>
              </div>
              <Field label="Sync Interval (minutes)">
                <Input id="influx-interval" type="number" value={String(cfg.interval_minutes)}
                  onChange={e => setCfg(c => ({ ...c, interval_minutes: Math.max(1, parseInt(e.target.value) || 60) }))}
                  placeholder="60" appearance="outline" />
              </Field>
            </div>
          </div>

          {/* Data schema */}
          <div className={styles.schemaBox}>
            <Text size={100} style={{ color: tokens.colorNeutralForeground4, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px', fontWeight: tokens.fontWeightSemibold }}>
              Data Schema
            </Text>
            <code className={styles.schemaCode}>
              elenia_electricity,gsrn=&lt;meter-id&gt;,<br />
              &nbsp;&nbsp;resolution=&lt;5min|quarter&gt;<br />
              &nbsp;&nbsp;electricity=kWh<br />
              &nbsp;&nbsp;electricity_netted=kWh<br />
              &nbsp;&nbsp;spot_price=c/kWh<br />
              &nbsp;&nbsp;spot_price_vat=c/kWh<br />
              &nbsp;&nbsp;timestamp (seconds)
            </code>
          </div>

          {/* Sync status */}
          {status && (
            <div>
              <div className={styles.sectionLabel}>
                <Clock24Regular style={{ fontSize: '15px' }} />
                Sync Status
              </div>
              <div className={styles.statusGrid}>
                <div className={styles.statusCell}>
                  <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>Last Sync</Text>
                  <Text size={300} weight="semibold">{elapsed(status.last_sync) || '—'}</Text>
                  <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>{fmtDate(status.last_sync)}</Text>
                </div>
                <div className={styles.statusCell}>
                  <Text size={100} style={{ color: tokens.colorNeutralForeground4 }}>Next Sync</Text>
                  <Text size={300} weight="semibold">{fmtDate(status.next_sync)}</Text>
                </div>
              </div>
              {status.error && (
                <MessageBar intent="error" style={{ marginTop: '10px' }}>
                  <MessageBarBody>{status.error}</MessageBarBody>
                </MessageBar>
              )}
            </div>
          )}

          {/* Result banners */}
          {testResult && (
            <MessageBar intent={testResult.ok ? 'success' : 'error'}>
              <MessageBarBody>{testResult.message}</MessageBarBody>
            </MessageBar>
          )}
          {syncResult && (
            <MessageBar intent={syncResult.ok ? 'success' : 'error'}>
              <MessageBarBody>
                {syncResult.ok ? `✓ ${syncResult.message} (today + yesterday)` : syncResult.message}
              </MessageBarBody>
            </MessageBar>
          )}
          {saveMsg && (
            <MessageBar intent={saveMsg.startsWith('Save failed') ? 'error' : 'success'}>
              <MessageBarBody>{saveMsg}</MessageBarBody>
            </MessageBar>
          )}
        </div>

        {/* Footer */}
        <div className={styles.panelFooter}>
          <Button
            appearance="secondary"
            icon={loadingTest ? <Spinner size="tiny" /> : <Wifi424Regular />}
            onClick={handleTest}
            disabled={loadingTest}
          >
            Test Connection
          </Button>
          <Button
            appearance="secondary"
            icon={loadingSync ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={handleSync}
            disabled={loadingSync}
          >
            Sync Now
          </Button>
          <Button
            appearance="primary"
            icon={loadingSave ? <Spinner size="tiny" /> : <Save24Regular />}
            onClick={handleSave}
            disabled={loadingSave}
          >
            Save
          </Button>
        </div>
      </div>
    </>
  );
};

export default Settings;
