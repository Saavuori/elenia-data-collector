import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { Button, makeStyles, mergeClasses, shorthands } from '@fluentui/react-components';
import {
  ChevronLeft24Regular,
  ChevronRight24Regular,
  CalendarLtr24Regular,
  Flash24Regular,
  Money24Regular,
  ArrowTrendingLines24Regular,
  TopSpeed24Regular,
  ArrowDown16Regular,
  ArrowUp16Regular,
  ErrorCircle24Regular,
  ArrowClockwise20Regular,
} from '@fluentui/react-icons';

import { usePalette, type Palette } from '../theme';
import { useIsMobile } from '../hooks/useMediaQuery';
import { errorText } from '../api';
import type { ConsumptionData } from '../types';
import { Card, Row, RowList, SegmentedControl, StatTile, EmptyState, Sheet } from './ui';

// ── Ranges & resolutions ──────────────────────────────────────────────────────

const today = () => format(new Date(), 'yyyy-MM-dd');

type PresetKey = 'today' | 'yesterday' | '7d' | '30d' | '12m';

const PRESETS: { key: PresetKey; label: string; range: () => [string, string] }[] = [
  { key: 'today', label: 'Today', range: () => [today(), today()] },
  {
    key: 'yesterday',
    label: 'Yesterday',
    range: () => {
      const d = format(subDays(new Date(), 1), 'yyyy-MM-dd');
      return [d, d];
    },
  },
  { key: '7d', label: '7 days', range: () => [format(subDays(new Date(), 6), 'yyyy-MM-dd'), today()] },
  { key: '30d', label: '30 days', range: () => [format(subDays(new Date(), 29), 'yyyy-MM-dd'), today()] },
  { key: '12m', label: '12 months', range: () => [format(subDays(new Date(), 364), 'yyyy-MM-dd'), today()] },
];

type Resolution = '5min' | 'quarter' | 'hour' | 'day' | 'month';

const RESOLUTION_LABELS: Record<Resolution, string> = {
  '5min': '5m',
  quarter: '15m',
  hour: '1h',
  day: '1d',
  month: '1mo',
};

// ── Styles ────────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  view: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 4px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    letterSpacing: '-0.03em',
    lineHeight: 1.1,
  },
  live: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: '26px',
    padding: '0 10px',
    borderRadius: '999px',
    background: 'var(--energy-soft)',
    color: 'var(--energy)',
    fontSize: '12px',
    fontWeight: 650,
  },
  liveDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: 'var(--energy)',
  },

  rangeBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px',
    borderRadius: '16px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
    '@media (min-width: 768px)': {
      maxWidth: '400px',
    },
  },
  rangeLabelButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    minWidth: 0,
    minHeight: '40px',
    padding: '0 8px',
    border: 'none',
    borderRadius: '12px',
    background: 'transparent',
    color: 'var(--text)',
    fontSize: '15px',
    fontWeight: 650,
    letterSpacing: '-0.01em',
    cursor: 'pointer',
    ':hover': { background: 'var(--surface-alt)' },
  },
  rangeLabelText: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  chipRail: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    // Bleed to the screen edges so the rail reads as scrollable on a phone.
    margin: '0 -16px',
    padding: '0 16px 2px',
    '@media (min-width: 768px)': {
      margin: 0,
      padding: '0 0 2px',
    },
  },
  chip: {
    flexShrink: 0,
    minHeight: '36px',
    padding: '0 14px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
  },
  chipActive: {
    background: 'var(--energy-soft)',
    ...shorthands.borderColor('var(--energy)'),
    color: 'var(--energy)',
  },

  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '10px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
      gap: '16px',
    },
  },

  chartCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  chartToolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    '@media (min-width: 768px)': {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
  },
  legendRail: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  legendChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    flexShrink: 0,
    minHeight: '32px',
    padding: '0 12px',
    borderRadius: '999px',
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-faint)',
    fontSize: '12px',
    fontWeight: 620,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  chartBox: {
    height: '240px',
    width: '100%',
    margin: '0 -6px',
    '@media (min-width: 768px)': {
      height: '380px',
      margin: 0,
    },
  },
  skeleton: {
    height: '240px',
    borderRadius: '16px',
    background: 'var(--surface-alt)',
    '@media (min-width: 768px)': {
      height: '380px',
    },
  },

  insightGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
      gap: '16px',
    },
  },
  insightHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px 10px',
    fontSize: '14px',
    fontWeight: 650,
  },

  sheetFields: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  fieldLabel: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text-muted)',
  },
  dateInput: {
    width: '100%',
    minHeight: '48px',
    padding: '0 14px',
    borderRadius: '14px',
    border: '1px solid var(--border-strong)',
    background: 'var(--surface-alt)',
    color: 'var(--text)',
    // 16px keeps iOS from zooming when the field takes focus.
    fontSize: '16px',
  },
});

// ── Tooltip ───────────────────────────────────────────────────────────────────

interface TooltipEntry {
  dataKey?: string | number;
  value?: number | null;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  showSpot: boolean;
  showCost: boolean;
  palette: Palette;
}

const ChartTooltip = ({ active, payload, label, showSpot, showCost, palette }: ChartTooltipProps) => {
  if (!active || !payload?.length) return null;
  const consumption = payload.find(p => p.dataKey === 'consumption');
  const spot = payload.find(p => p.dataKey === 'spotPrice');
  const cost = payload.find(p => p.dataKey === 'cost');

  const line = (color: string, name: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '18px', color, marginTop: '4px' }}>
      <span>{name}</span>
      <span style={{ fontWeight: 700 }} className="tnum">{value}</span>
    </div>
  );

  return (
    <div
      style={{
        background: palette.tooltipBg,
        border: `1px solid ${palette.border}`,
        borderRadius: '14px',
        padding: '10px 14px',
        fontSize: '12px',
        minWidth: '170px',
        boxShadow: palette.shadowRaised,
        backdropFilter: 'blur(8px)',
      }}
    >
      <div style={{ color: palette.textMuted, fontWeight: 650 }}>{label}</div>
      {consumption && line(palette.energy, 'Consumption', `${Number(consumption.value).toFixed(3)} kWh`)}
      {showSpot && spot?.value != null && line(palette.spot, 'Spot incl. VAT', `${Number(spot.value).toFixed(2)} c/kWh`)}
      {showCost && cost?.value != null && line(palette.cost, 'Cost', `${Number(cost.value).toFixed(2)} €`)}
    </div>
  );
};

// ── View ──────────────────────────────────────────────────────────────────────

const UsageView: React.FC = () => {
  const styles = useStyles();
  const palette = usePalette();
  const isMobile = useIsMobile();

  // The 5-minute meter registers are only ~10 minutes behind, so today is a
  // useful default even though the settled series lag by days.
  const [startDate, setStartDate] = useState<string>(today());
  const [stopDate, setStopDate] = useState<string>(today());
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);

  const [showConsumption, setShowConsumption] = useState(true);
  const [showSpotPrice, setShowSpotPrice] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [resolutionOverride, setResolutionOverride] = useState<Resolution | null>(null);

  const daysDiff = (() => {
    try {
      const start = parseISO(startDate);
      const stop = parseISO(stopDate);
      return Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    } catch {
      return 1;
    }
  })();

  const resolution: Resolution = resolutionOverride || (
    daysDiff <= 1 ? '5min' :
    daysDiff <= 2 ? 'quarter' :
    daysDiff <= 31 ? 'hour' : 'day'
  );

  const showsToday = stopDate === today();
  const isLive = showsToday && resolution === '5min';

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['consumption', startDate, stopDate, resolution],
    queryFn: async () => {
      const response = await axios.get<ConsumptionData>('consumption', {
        params: { start: startDate, stop: stopDate, resolution },
      });
      return response.data;
    },
    // Elenia publishes a new 5-minute register roughly every 10 minutes, so
    // keep today's view live.
    refetchInterval: isLive ? 5 * 60_000 : false,
  });

  // A manually picked resolution can become invalid when the range grows.
  const clearImpossibleOverride = (start: Date, stop: Date) => {
    const diff = Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    if ((diff > 7 && resolutionOverride === 'quarter') ||
        (diff > 3 && resolutionOverride === '5min')) {
      setResolutionOverride(null);
    }
  };

  const handleStartDateChange = (val: string) => {
    if (!val) return;
    setStartDate(val);
    clearImpossibleOverride(parseISO(val), parseISO(stopDate));
  };

  const handleStopDateChange = (val: string) => {
    if (!val) return;
    setStopDate(val);
    clearImpossibleOverride(parseISO(startDate), parseISO(val));
  };

  const applyPreset = (key: PresetKey) => {
    const preset = PRESETS.find(p => p.key === key)!;
    const [start, stop] = preset.range();
    setStartDate(start);
    setStopDate(stop);
    setResolutionOverride(null);
  };

  const activePreset = PRESETS.find(p => {
    const [start, stop] = p.range();
    return start === startDate && stop === stopDate;
  })?.key;

  const shiftPeriod = (direction: -1 | 1) => {
    const start = parseISO(startDate);
    const stop = parseISO(stopDate);
    const days = Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    let newStart = subDays(start, -days * direction);
    let newStop = subDays(stop, -days * direction);

    const now = new Date();
    if (direction === 1 && newStop > now) {
      const shift = Math.round((now.getTime() - stop.getTime()) / (1000 * 3600 * 24));
      newStart = subDays(start, -shift);
      newStop = now;
    }
    setStartDate(format(newStart, 'yyyy-MM-dd'));
    setStopDate(format(newStop, 'yyyy-MM-dd'));
  };

  const isPeriodEndLatest = parseISO(stopDate) >= parseISO(today());

  const dateLabel = (() => {
    if (startDate === stopDate) {
      const isToday = startDate === today();
      const isYesterday = startDate === format(subDays(new Date(), 1), 'yyyy-MM-dd');
      if (isToday) return `Today · ${format(parseISO(startDate), 'MMM d')}`;
      if (isYesterday) return `Yesterday · ${format(parseISO(startDate), 'MMM d')}`;
      return format(parseISO(startDate), 'EEE, MMM d yyyy');
    }
    return `${format(parseISO(startDate), 'MMM d')} – ${format(parseISO(stopDate), 'MMM d, yyyy')}`;
  })();

  // ── Derived series ─────────────────────────────────────────────────────────

  const chartData = data?.series.map(item => {
    const consumption = item.electricity ?? null;
    const spotPrice = item.electricity_spot_prices_vat ?? null;
    const cost = (consumption !== null && spotPrice !== null)
      ? (consumption * spotPrice) / 100
      : null;

    let timeLabel = '';
    try {
      const itemDate = new Date(item.start ?? '');
      if (daysDiff <= 1) {
        timeLabel = format(itemDate, 'HH:mm');
      } else if (daysDiff <= 5) {
        timeLabel = format(itemDate, 'MMM d, HH:mm');
      } else {
        timeLabel = format(itemDate, 'MMM d');
      }
    } catch {
      timeLabel = item.start ?? '';
    }

    return { time: timeLabel, consumption, spotPrice, cost };
  }) ?? [];

  const xAxisInterval = (() => {
    const len = chartData.length;
    if (len === 0) return 0;
    const ticks = isMobile ? 4 : 8;
    return Math.max(0, Math.round(len / ticks) - 1);
  })();

  const formatOccurrenceTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return daysDiff <= 1 ? format(date, 'HH:mm') : format(date, 'MMM d, HH:mm');
    } catch {
      return '';
    }
  };

  const totalKwh = data?.series.reduce((s, i) => s + (i.electricity ?? 0), 0) ?? 0;

  const totalCost = data?.series.reduce((s, i) => {
    const consumption = i.electricity ?? 0;
    const spotPrice = i.electricity_spot_prices_vat ?? 0;
    return s + (consumption * spotPrice) / 100;
  }, 0) ?? 0;

  const avgPricePaid = totalKwh > 0 ? (totalCost / totalKwh) * 100 : 0;

  const avgSpot = (() => {
    if (!data?.series) return null;
    const vals = data.series
      .map(i => i.electricity_spot_prices_vat)
      .filter((v): v is number => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  })();

  const spotPrices = data?.series
    .map(item => ({ price: item.electricity_spot_prices_vat, time: item.start ?? '' }))
    .filter((item): item is { price: number; time: string } => item.price != null) ?? [];

  const minSpot = spotPrices.length
    ? spotPrices.reduce((min, cur) => (cur.price < min.price ? cur : min), spotPrices[0])
    : null;

  const maxSpot = spotPrices.length
    ? spotPrices.reduce((max, cur) => (cur.price > max.price ? cur : max), spotPrices[0])
    : null;

  const peakPower = (() => {
    if (!data?.series?.length) return null;
    let maxVal = -1.0;
    let maxTime = '';
    for (const item of data.series) {
      if (item.electricity != null && item.start && item.stop) {
        const start = new Date(item.start).getTime();
        const stop = new Date(item.stop).getTime();
        const hours = (stop - start) / (1000 * 3600);
        if (hours > 0) {
          const kw = item.electricity / hours;
          if (kw > maxVal) {
            maxVal = kw;
            maxTime = item.start;
          }
        }
      }
    }
    return maxVal >= 0 ? { kw: maxVal, time: maxTime } : null;
  })();

  const errorMessage = errorText(error, 'Could not load consumption data.');

  const resolutionOptions = (['5min', 'quarter', 'hour', 'day', 'month'] as Resolution[]).map(r => ({
    value: r,
    label: RESOLUTION_LABELS[r],
    disabled:
      (r === '5min' && daysDiff > 3) ||
      (r === 'quarter' && daysDiff > 7) ||
      (r === 'month' && daysDiff < 28),
  }));

  const legend = [
    { on: showConsumption, toggle: () => setShowConsumption(v => !v), color: palette.energy, soft: palette.energySoft, label: isMobile ? 'kWh' : 'Consumption (kWh)' },
    { on: showSpotPrice, toggle: () => setShowSpotPrice(v => !v), color: palette.spot, soft: palette.spotSoft, label: isMobile ? 'Spot' : 'Spot price (c/kWh)' },
    { on: showCost, toggle: () => setShowCost(v => !v), color: palette.cost, soft: palette.costSoft, label: isMobile ? 'Cost' : 'Cost (€)' },
  ];

  return (
    <div className={mergeClasses(styles.view, 'animate-fade-in')}>
      {/* Title */}
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Usage</h1>
        {isLive ? (
          <span className={styles.live}>
            <span className={mergeClasses(styles.liveDot, 'animate-pulse')} />
            Live
          </span>
        ) : (
          <Button
            appearance="subtle"
            shape="circular"
            icon={<ArrowClockwise20Regular />}
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh"
          />
        )}
      </div>

      {/* Range navigator */}
      <div className={styles.rangeBar}>
        <Button
          appearance="subtle"
          shape="circular"
          icon={<ChevronLeft24Regular />}
          onClick={() => shiftPeriod(-1)}
          aria-label="Previous period"
        />
        <button
          type="button"
          className={styles.rangeLabelButton}
          onClick={() => setRangeSheetOpen(true)}
        >
          <CalendarLtr24Regular fontSize={18} style={{ color: palette.energy, flexShrink: 0 }} />
          <span className={styles.rangeLabelText}>{dateLabel}</span>
        </button>
        <Button
          appearance="subtle"
          shape="circular"
          icon={<ChevronRight24Regular />}
          onClick={() => shiftPeriod(1)}
          disabled={isPeriodEndLatest}
          aria-label="Next period"
        />
      </div>

      {/* Quick ranges */}
      <div className={mergeClasses(styles.chipRail, 'no-scrollbar')}>
        {PRESETS.map(preset => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset.key)}
            className={mergeClasses(styles.chip, activePreset === preset.key && styles.chipActive)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Headline numbers */}
      <div className={styles.statGrid}>
        <StatTile
          label="Consumption"
          value={`${totalKwh.toFixed(totalKwh >= 100 ? 0 : 2)} kWh`}
          icon={<Flash24Regular fontSize={16} />}
          tint={palette.energySoft}
          accent={palette.energy}
        />
        <StatTile
          label="Spot cost"
          value={`${totalCost.toFixed(2)} €`}
          icon={<Money24Regular fontSize={16} />}
          tint={palette.costSoft}
          accent={palette.cost}
        />
        <StatTile
          label="Avg price"
          value={`${avgPricePaid.toFixed(2)} c`}
          hint={avgSpot != null ? `market ${avgSpot.toFixed(2)} c/kWh` : undefined}
          icon={<ArrowTrendingLines24Regular fontSize={16} />}
          tint={palette.spotSoft}
        />
        <StatTile
          label="Peak power"
          value={peakPower ? `${peakPower.kw.toFixed(2)} kW` : '—'}
          hint={peakPower ? `at ${formatOccurrenceTime(peakPower.time)}` : undefined}
          icon={<TopSpeed24Regular fontSize={16} />}
          tint={palette.energySoft}
        />
      </div>

      {/* Chart */}
      <Card>
        <div className={styles.chartCard}>
          <div className={styles.chartToolbar}>
            <div className={mergeClasses(styles.legendRail, 'no-scrollbar')}>
              {legend.map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={item.toggle}
                  aria-pressed={item.on}
                  className={styles.legendChip}
                  style={item.on
                    ? { background: item.soft, borderColor: item.color, color: item.color }
                    : undefined}
                >
                  <span
                    className={styles.dot}
                    style={{ background: item.on ? item.color : palette.textFaint }}
                  />
                  {item.label}
                </button>
              ))}
            </div>

            <SegmentedControl
              ariaLabel="Chart resolution"
              options={resolutionOptions}
              value={resolution}
              onChange={setResolutionOverride}
            />
          </div>

          {isLoading ? (
            <div className={mergeClasses(styles.skeleton, 'animate-pulse')} />
          ) : isError ? (
            <EmptyState
              icon={<ErrorCircle24Regular />}
              title="Nothing to show"
              body={errorMessage}
              action={<Button appearance="secondary" onClick={() => refetch()}>Try again</Button>}
            />
          ) : chartData.length === 0 ? (
            <EmptyState
              icon={<Flash24Regular />}
              title="No readings yet"
              body="Elenia has not published measurements for this period."
            />
          ) : (
            <div className={styles.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 8, right: showSpotPrice ? (isMobile ? 4 : 24) : 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={palette.energy} stopOpacity={0.34} />
                      <stop offset="95%" stopColor={palette.energy} stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} vertical={false} />
                  <XAxis
                    dataKey="time"
                    stroke={palette.textFaint}
                    fontSize={isMobile ? 10 : 11}
                    tickLine={false}
                    axisLine={false}
                    interval={xAxisInterval}
                    minTickGap={8}
                    tickMargin={8}
                  />
                  {/* Consumption and cost are never negative, so anchor the
                      axis at zero instead of letting Recharts pad below it. */}
                  <YAxis
                    yAxisId="kwh"
                    orientation="left"
                    // Without allowDataOverflow, Recharts stretches this axis
                    // below zero to line its ticks up with the spot axis.
                    domain={[0, 'auto']}
                    allowDataOverflow
                    tick={{ fill: showConsumption ? palette.textMuted : 'transparent', fontSize: isMobile ? 10 : 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={isMobile ? 32 : 44}
                  />
                  {showSpotPrice && (
                    <YAxis
                      yAxisId="spot"
                      orientation="right"
                      tick={{ fill: palette.textMuted, fontSize: isMobile ? 10 : 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={isMobile ? 28 : 40}
                    />
                  )}
                  <Tooltip
                    content={<ChartTooltip showSpot={showSpotPrice} showCost={showCost} palette={palette} />}
                    cursor={{ stroke: palette.borderStrong, strokeWidth: 1 }}
                  />

                  {showConsumption && (
                    <Area
                      yAxisId="kwh"
                      type="monotone"
                      dataKey="consumption"
                      stroke={palette.energy}
                      strokeWidth={2.25}
                      fillOpacity={1}
                      fill="url(#usageFill)"
                      dot={false}
                      activeDot={{ r: 4, fill: palette.energy, strokeWidth: 0 }}
                      connectNulls
                    />
                  )}
                  {showCost && (
                    <Bar
                      yAxisId="kwh"
                      dataKey="cost"
                      fill={palette.cost}
                      fillOpacity={0.18}
                      stroke={palette.cost}
                      strokeWidth={1}
                      radius={[3, 3, 0, 0]}
                    />
                  )}
                  {showSpotPrice && (
                    <Line
                      yAxisId="spot"
                      type="monotone"
                      dataKey="spotPrice"
                      stroke={palette.spot}
                      strokeWidth={1.75}
                      dot={false}
                      activeDot={{ r: 4, fill: palette.spot, strokeWidth: 0 }}
                      connectNulls
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Card>

      {/* Insights */}
      {data && (
        <div className={styles.insightGrid}>
          <Card padded={false}>
            <div className={styles.insightHeader}>
              <Money24Regular fontSize={18} style={{ color: palette.cost }} />
              Cost performance
            </div>
            <RowList>
              <Row label="Average price paid" value={`${avgPricePaid.toFixed(2)} c/kWh`} valueColor={palette.cost} mono />
              {avgSpot != null && (
                <Row label="Market average" value={`${avgSpot.toFixed(2)} c/kWh`} mono />
              )}
              {avgSpot != null && avgSpot > 0 && (
                <Row
                  label="Versus market"
                  value={avgPricePaid <= avgSpot
                    ? `${((1 - avgPricePaid / avgSpot) * 100).toFixed(1)}% cheaper`
                    : `${((avgPricePaid / avgSpot - 1) * 100).toFixed(1)}% pricier`}
                  valueColor={avgPricePaid <= avgSpot ? palette.positive : palette.negative}
                  mono
                />
              )}
            </RowList>
          </Card>

          <Card padded={false}>
            <div className={styles.insightHeader}>
              <TopSpeed24Regular fontSize={18} style={{ color: palette.energy }} />
              Peak demand
            </div>
            <RowList>
              {peakPower ? (
                <>
                  <Row label="Peak load" value={`${peakPower.kw.toFixed(2)} kW`} valueColor={palette.energy} mono />
                  <Row label="Occurred at" value={formatOccurrenceTime(peakPower.time)} mono />
                </>
              ) : (
                <Row label="Peak load" value="No data" />
              )}
            </RowList>
          </Card>

          <Card padded={false}>
            <div className={styles.insightHeader}>
              <ArrowTrendingLines24Regular fontSize={18} style={{ color: palette.spot }} />
              Spot price range
            </div>
            <RowList>
              {minSpot ? (
                <Row
                  label={<><ArrowDown16Regular style={{ color: palette.positive }} /> Lowest</>}
                  value={`${minSpot.price.toFixed(2)} c · ${formatOccurrenceTime(minSpot.time)}`}
                  valueColor={palette.positive}
                  mono
                />
              ) : (
                <Row label="Lowest" value="No data" />
              )}
              {maxSpot && (
                <Row
                  label={<><ArrowUp16Regular style={{ color: palette.negative }} /> Highest</>}
                  value={`${maxSpot.price.toFixed(2)} c · ${formatOccurrenceTime(maxSpot.time)}`}
                  valueColor={palette.negative}
                  mono
                />
              )}
            </RowList>
          </Card>
        </div>
      )}

      {/* Custom range picker */}
      <RangeSheet
        open={rangeSheetOpen}
        onClose={() => setRangeSheetOpen(false)}
        startDate={startDate}
        stopDate={stopDate}
        onStartChange={handleStartDateChange}
        onStopChange={handleStopDateChange}
        onPreset={applyPreset}
        activePreset={activePreset}
      />
    </div>
  );
};

// ── Range sheet ───────────────────────────────────────────────────────────────

const RangeSheet: React.FC<{
  open: boolean;
  onClose: () => void;
  startDate: string;
  stopDate: string;
  onStartChange: (value: string) => void;
  onStopChange: (value: string) => void;
  onPreset: (key: PresetKey) => void;
  activePreset?: PresetKey;
}> = ({ open, onClose, startDate, stopDate, onStartChange, onStopChange, onPreset, activePreset }) => {
  const styles = useStyles();

  return (
    <Sheet open={open} title="Select period" subtitle="Pick a preset or a custom range" onClose={onClose}>
      <div className={styles.sheetFields}>
        <div className={mergeClasses(styles.chipRail, 'no-scrollbar')}>
          {PRESETS.map(preset => (
            <button
              key={preset.key}
              type="button"
              onClick={() => onPreset(preset.key)}
              className={mergeClasses(styles.chip, activePreset === preset.key && styles.chipActive)}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="range-start">From</label>
          <input
            id="range-start"
            type="date"
            className={styles.dateInput}
            value={startDate}
            max={stopDate}
            onChange={e => onStartChange(e.target.value)}
          />
        </div>

        <div>
          <label className={styles.fieldLabel} htmlFor="range-stop">To</label>
          <input
            id="range-stop"
            type="date"
            className={styles.dateInput}
            value={stopDate}
            min={startDate}
            max={today()}
            onChange={e => onStopChange(e.target.value)}
          />
        </div>

        <Button appearance="primary" size="large" onClick={onClose} style={{ height: '48px', borderRadius: '14px' }}>
          Show period
        </Button>
      </div>
    </Sheet>
  );
};

export default UsageView;
