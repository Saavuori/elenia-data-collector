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
import {
  Button,
  Spinner,
  Text,
  tokens,
  makeStyles,
  mergeClasses,
  shorthands,
} from '@fluentui/react-components';
import {
  ChevronLeft24Regular,
  ChevronRight24Regular,
  Flash24Regular,
  ArrowTrending24Regular,
  Calendar24Regular,
  ErrorCircle24Regular,
  Money24Regular,
  ArrowDown16Regular,
  ArrowUp16Regular,
  Clock20Regular,
} from '@fluentui/react-icons';
import { SERIES, SERIES_SOFT } from '../theme';

// ── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  dateNav: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
  },
  dateInput: {
    background: 'none',
    border: 'none',
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    outline: 'none',
    fontFamily: tokens.fontFamilyBase,
    padding: '2px',
  },
  statCard: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
  },
  statIcon: {
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: '18px',
  },
  statIconEnergy: { background: SERIES_SOFT.energy },
  statIconCost: { background: SERIES_SOFT.cost },
  chartCard: {
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    padding: tokens.spacingHorizontalXL,
    boxShadow: tokens.shadow4,
  },
  toggleRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
    marginBottom: tokens.spacingVerticalM,
  },
  toggleLeft: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  togglePill: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '5px 14px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1.5px solid ${tokens.colorNeutralStroke1}`,
    background: 'transparent',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    fontFamily: tokens.fontFamilyBase,
    whiteSpace: 'nowrap',
  },
  togglePillEnergy: {
    ...shorthands.borderColor(SERIES.energy),
    backgroundColor: SERIES_SOFT.energy,
    color: SERIES.energy,
  },
  togglePillSpot: {
    ...shorthands.borderColor(SERIES.spot),
    backgroundColor: SERIES_SOFT.spot,
    color: SERIES.spot,
  },
  togglePillCost: {
    ...shorthands.borderColor(SERIES.cost),
    backgroundColor: SERIES_SOFT.cost,
    color: SERIES.cost,
  },
  pillDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  centeredState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: '80px 0',
    color: tokens.colorNeutralForeground3,
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: tokens.spacingHorizontalL,
    marginTop: tokens.spacingVerticalM,
  },
  analyticsCard: {
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    padding: tokens.spacingHorizontalXL,
    boxShadow: tokens.shadow4,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  analyticsHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingBottom: tokens.spacingVerticalS,
  },
});

// ── Custom tooltip ────────────────────────────────────────────────────────────

const CustomTooltip = ({ active, payload, label, showSpot, showCost }: any) => {
  if (!active || !payload?.length) return null;
  const consumption = payload.find((p: any) => p.dataKey === 'consumption');
  const spot = payload.find((p: any) => p.dataKey === 'spotPrice');
  const cost = payload.find((p: any) => p.dataKey === 'cost');
  return (
    <div style={{
      background: 'rgba(16,22,16,0.97)',
      border: `1px solid ${tokens.colorNeutralStroke1}`,
      borderRadius: tokens.borderRadiusMedium,
      padding: '12px 16px',
      fontSize: tokens.fontSizeBase200,
      minWidth: '175px',
      boxShadow: tokens.shadow16,
    }}>
      <div style={{ color: tokens.colorNeutralForeground3, marginBottom: '8px', fontWeight: 600 }}>{label}</div>
      {consumption && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: SERIES.energy }}>
          <span>Consumption</span>
          <span style={{ fontWeight: 700 }}>{Number(consumption.value).toFixed(4)} kWh</span>
        </div>
      )}
      {showSpot && spot && spot.value != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: SERIES.spot, marginTop: '4px' }}>
          <span>Spot (incl. VAT)</span>
          <span style={{ fontWeight: 700 }}>{Number(spot.value).toFixed(4)} c/kWh</span>
        </div>
      )}
      {showCost && cost && cost.value != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', color: SERIES.cost, marginTop: '4px' }}>
          <span>Cost</span>
          <span style={{ fontWeight: 700 }}>{Number(cost.value).toFixed(2)} €</span>
        </div>
      )}
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────

const ConsumptionChart: React.FC = () => {
  const styles = useStyles();

  // The 5-minute meter registers are only ~10 minutes behind, so today is a
  // useful default even though the settled series lag by days.
  const [startDate, setStartDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [stopDate, setStopDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  const [showConsumption, setShowConsumption] = useState(true);
  const [showSpotPrice, setShowSpotPrice] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [resolutionOverride, setResolutionOverride] = useState<string | null>(null);

  const daysDiff = (() => {
    try {
      const start = parseISO(startDate);
      const stop = parseISO(stopDate);
      return Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    } catch {
      return 1;
    }
  })();

  const resolution = resolutionOverride || (
    daysDiff <= 1 ? '5min' :
    daysDiff <= 2 ? 'quarter' :
    daysDiff <= 31 ? 'hour' : 'day'
  );

  const showsToday = stopDate === format(new Date(), 'yyyy-MM-dd');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['consumption', startDate, stopDate, resolution],
    queryFn: async () => {
      const response = await axios.get('consumption', {
        params: { start: startDate, stop: stopDate, resolution },
      });
      return response.data;
    },
    // Elenia publishes a new 5-minute register roughly every 10 minutes, so
    // keep today's view live.
    refetchInterval: showsToday && resolution === '5min' ? 5 * 60_000 : false,
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
    setStartDate(val);
    clearImpossibleOverride(parseISO(val), parseISO(stopDate));
  };

  const handleStopDateChange = (val: string) => {
    setStopDate(val);
    clearImpossibleOverride(parseISO(startDate), parseISO(val));
  };

  const goToPrevPeriod = () => {
    const start = parseISO(startDate);
    const stop = parseISO(stopDate);
    const days = Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    setStartDate(format(subDays(start, days), 'yyyy-MM-dd'));
    setStopDate(format(subDays(stop, days), 'yyyy-MM-dd'));
  };

  const goToNextPeriod = () => {
    const start = parseISO(startDate);
    const stop = parseISO(stopDate);
    const days = Math.round((stop.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    let newStart = subDays(start, -days);
    let newStop = subDays(stop, -days);

    const today = new Date();
    if (newStop > today) {
      const shift = Math.round((today.getTime() - stop.getTime()) / (1000 * 3600 * 24));
      newStart = subDays(start, -shift);
      newStop = today;
    }
    setStartDate(format(newStart, 'yyyy-MM-dd'));
    setStopDate(format(newStop, 'yyyy-MM-dd'));
  };

  const isPeriodEndLatest = (() => {
    const stop = parseISO(stopDate);
    const today = parseISO(format(new Date(), 'yyyy-MM-dd'));
    return stop >= today;
  })();

  const dateLabel = (() => {
    if (startDate === stopDate) {
      const isToday = startDate === format(new Date(), 'yyyy-MM-dd');
      const isYesterday = startDate === format(subDays(new Date(), 1), 'yyyy-MM-dd');
      return isToday ? 'Today' : isYesterday ? 'Yesterday' : format(parseISO(startDate), 'MMMM do, yyyy');
    }
    return `${format(parseISO(startDate), 'MMM d, yyyy')} — ${format(parseISO(stopDate), 'MMM d, yyyy')}`;
  })();

  const chartData = data?.series.map((item: any) => {
    const consumption = item.electricity ?? null;
    const spotPrice = item.electricity_spot_prices_vat ?? null;
    const cost = (consumption !== null && spotPrice !== null)
      ? (consumption * spotPrice) / 100
      : null;

    let timeLabel = '';
    try {
      const itemDate = new Date(item.start);
      if (daysDiff <= 1) {
        timeLabel = format(itemDate, 'HH:mm');
      } else if (daysDiff <= 5) {
        timeLabel = format(itemDate, 'MMM d, HH:mm');
      } else {
        timeLabel = format(itemDate, 'MMM d');
      }
    } catch {
      timeLabel = item.start;
    }

    return { time: timeLabel, consumption, spotPrice, cost };
  }) ?? [];

  const xAxisInterval = (() => {
    const len = chartData.length;
    if (len === 0) return 0;
    if (len > 300) return Math.round(len / 8);
    if (len > 100) return Math.round(len / 6);
    return Math.round(len / 8) || 1;
  })();

  const formatOccurrenceTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return daysDiff <= 1 ? format(date, 'HH:mm') : format(date, 'MMM d, HH:mm');
    } catch {
      return '';
    }
  };

  const totalKwh = data?.series.reduce((s: number, i: any) => s + (i.electricity ?? 0), 0) ?? 0;

  const totalCost = data?.series.reduce((s: number, i: any) => {
    const consumption = i.electricity ?? 0;
    const spotPrice = i.electricity_spot_prices_vat ?? 0;
    return s + (consumption * spotPrice) / 100;
  }, 0) ?? 0;

  const avgPricePaid = totalKwh > 0 ? (totalCost / totalKwh) * 100 : 0;

  const avgSpot = (() => {
    if (!data?.series) return null;
    const vals = data.series.map((i: any) => i.electricity_spot_prices_vat).filter((v: any) => v != null);
    return vals.length ? vals.reduce((a: number, b: number) => a + b, 0) / vals.length : null;
  })();

  const spotPrices = data?.series
    .map((item: any) => ({ price: item.electricity_spot_prices_vat, time: item.start }))
    .filter((item: any) => item.price != null) ?? [];

  const minSpot = spotPrices.length
    ? spotPrices.reduce((min: any, cur: any) => (cur.price < min.price ? cur : min), spotPrices[0])
    : null;

  const maxSpot = spotPrices.length
    ? spotPrices.reduce((max: any, cur: any) => (cur.price > max.price ? cur : max), spotPrices[0])
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

  const errorMessage =
    (error as any)?.response?.data || 'Failed to fetch consumption data.';

  return (
    <div className={mergeClasses(styles.section, 'animate-fade-in')}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <Text as="h2" size={600} weight="semibold" style={{ display: 'block' }}>Usage Insights</Text>
          <Text size={300} style={{ color: tokens.colorNeutralForeground3 }}>
            Detailed consumption for {dateLabel}
          </Text>
        </div>

        <div className={styles.headerRight}>
          {/* Date range navigator */}
          <div className={styles.dateNav}>
            <Button appearance="subtle" icon={<ChevronLeft24Regular />} onClick={goToPrevPeriod} size="small" />
            <Calendar24Regular style={{ color: SERIES.energy, flexShrink: 0 }} />
            <input
              type="date"
              value={startDate}
              max={stopDate}
              onChange={e => handleStartDateChange(e.target.value)}
              className={styles.dateInput}
            />
            <span style={{ color: tokens.colorNeutralForeground4, margin: '0 4px' }}>—</span>
            <input
              type="date"
              value={stopDate}
              min={startDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => handleStopDateChange(e.target.value)}
              className={styles.dateInput}
            />
            <Button appearance="subtle" icon={<ChevronRight24Regular />} onClick={goToNextPeriod} disabled={isPeriodEndLatest} size="small" />
          </div>

          {/* Summary stat cards */}
          {data && (
            <>
              <div className={styles.statCard}>
                <div className={mergeClasses(styles.statIcon, styles.statIconEnergy)}>
                  <Flash24Regular style={{ color: SERIES.energy }} />
                </div>
                <div>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>Total Usage</Text>
                  <Text size={400} weight="bold">{totalKwh.toFixed(2)} kWh</Text>
                </div>
              </div>
              <div className={styles.statCard}>
                <div className={mergeClasses(styles.statIcon, styles.statIconCost)}>
                  <Money24Regular style={{ color: SERIES.cost }} />
                </div>
                <div>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block' }}>Spot Cost</Text>
                  <Text size={400} weight="bold">{totalCost.toFixed(2)} €</Text>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chart card */}
      <div className={styles.chartCard}>
        {/* Series toggles & resolution switcher */}
        <div className={styles.toggleRow}>
          <div className={styles.toggleLeft}>
            <button
              className={mergeClasses(styles.togglePill, showConsumption ? styles.togglePillEnergy : undefined)}
              onClick={() => setShowConsumption(v => !v)}
            >
              <span className={styles.pillDot} style={{ background: showConsumption ? SERIES.energy : tokens.colorNeutralForeground4 }} />
              Consumption (kWh)
            </button>
            <button
              className={mergeClasses(styles.togglePill, showSpotPrice ? styles.togglePillSpot : undefined)}
              onClick={() => setShowSpotPrice(v => !v)}
            >
              <span className={styles.pillDot} style={{ background: showSpotPrice ? SERIES.spot : tokens.colorNeutralForeground4 }} />
              Spot Price incl. VAT (c/kWh)
            </button>
            <button
              className={mergeClasses(styles.togglePill, showCost ? styles.togglePillCost : undefined)}
              onClick={() => setShowCost(v => !v)}
            >
              <span className={styles.pillDot} style={{ background: showCost ? SERIES.cost : tokens.colorNeutralForeground4 }} />
              Interval Cost (€)
            </button>
          </div>

          {/* Resolution tabs */}
          <div style={{ display: 'flex', gap: '4px', background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium, padding: '2px', border: `1px solid ${tokens.colorNeutralStroke2}` }}>
            {['5min', 'quarter', 'hour', 'day', 'month'].map((r) => {
              const isDisabled =
                (r === '5min' && daysDiff > 3) ||
                (r === 'quarter' && daysDiff > 7) ||
                (r === 'month' && daysDiff < 28);
              const isSelected = resolution === r;
              return (
                <button
                  key={r}
                  disabled={isDisabled}
                  onClick={() => setResolutionOverride(r)}
                  style={{
                    border: 'none',
                    background: isSelected ? tokens.colorNeutralBackground1 : 'transparent',
                    color: isSelected ? tokens.colorNeutralForeground1 : tokens.colorNeutralForeground4,
                    padding: '4px 10px',
                    borderRadius: tokens.borderRadiusMedium,
                    fontSize: '11px',
                    fontWeight: isSelected ? 600 : 400,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.4 : 1,
                    fontFamily: tokens.fontFamilyBase,
                  }}
                >
                  {r === '5min' ? '5m' : r === 'quarter' ? '15m' : r === 'hour' ? '1h' : r === 'day' ? '1d' : '1mo'}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <div className={styles.centeredState}>
            <Spinner size="extra-large" />
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Loading consumption data…</Text>
          </div>
        ) : isError ? (
          <div className={styles.centeredState}>
            <ErrorCircle24Regular style={{ fontSize: '48px', color: tokens.colorPaletteRedForeground1 }} />
            <Text style={{ color: tokens.colorPaletteRedForeground1 }}>{String(errorMessage)}</Text>
          </div>
        ) : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: showSpotPrice ? 60 : 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="colorUsage" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={SERIES.energy} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={SERIES.energy} stopOpacity={0} />
                  </linearGradient>
                </defs>

                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="time" stroke={tokens.colorNeutralForeground4} fontSize={11} tickLine={false} axisLine={false} interval={xAxisInterval} />
                <YAxis yAxisId="kwh" orientation="left"
                  stroke={showConsumption ? SERIES.energy : 'transparent'}
                  tick={{ fill: showConsumption ? tokens.colorNeutralForeground3 : 'transparent', fontSize: 11 }}
                  tickLine={false} axisLine={false} tickFormatter={v => `${v} kWh`} width={62} />
                {showSpotPrice && (
                  <YAxis yAxisId="spot" orientation="right" stroke={SERIES.spot}
                    tick={{ fill: tokens.colorNeutralForeground3, fontSize: 11 }}
                    tickLine={false} axisLine={false} tickFormatter={v => `${v} c`} width={52} />
                )}
                <Tooltip content={<CustomTooltip showSpot={showSpotPrice} showCost={showCost} />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />

                {showConsumption && (
                  <Area yAxisId="kwh" type="monotone" dataKey="consumption"
                    stroke={SERIES.energy} strokeWidth={2.5} fillOpacity={1} fill="url(#colorUsage)"
                    dot={false} activeDot={{ r: 4, fill: SERIES.energy, strokeWidth: 0 }} connectNulls />
                )}
                {showCost && (
                  <Bar yAxisId="kwh" dataKey="cost" fill={SERIES.cost} fillOpacity={0.15} stroke={SERIES.cost} strokeWidth={1} radius={[2, 2, 0, 0]} />
                )}
                {showSpotPrice && (
                  <Line yAxisId="spot" type="monotone" dataKey="spotPrice"
                    stroke={SERIES.spot} strokeWidth={1.8} dot={false}
                    activeDot={{ r: 4, fill: SERIES.spot, strokeWidth: 0 }} connectNulls />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Detailed analytics grid */}
      {data && (
        <div className={styles.analyticsGrid}>
          {/* Card 1: cost performance */}
          <div className={styles.analyticsCard}>
            <div className={styles.analyticsHeader}>
              <Money24Regular style={{ color: SERIES.cost, fontSize: '20px' }} />
              <Text size={300} weight="semibold">Cost Performance</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Average Price Paid</Text>
                <Text size={300} weight="bold" style={{ color: SERIES.cost }}>{avgPricePaid.toFixed(2)} c/kWh</Text>
              </div>
              {avgSpot != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Market Avg Spot</Text>
                  <Text size={300} weight="semibold">{avgSpot.toFixed(2)} c/kWh</Text>
                </div>
              )}
              {avgSpot != null && avgSpot > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '6px', marginTop: '2px' }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Optimization Ratio</Text>
                  <Text size={300} weight="bold" style={{ color: avgPricePaid <= avgSpot ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                    {avgPricePaid <= avgSpot
                      ? `-${((1 - avgPricePaid / avgSpot) * 100).toFixed(1)}% cheaper`
                      : `+${((avgPricePaid / avgSpot - 1) * 100).toFixed(1)}% expensive`}
                  </Text>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: peak demand */}
          <div className={styles.analyticsCard}>
            <div className={styles.analyticsHeader}>
              <Flash24Regular style={{ color: SERIES.energy, fontSize: '20px' }} />
              <Text size={300} weight="semibold">Peak Demand</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {peakPower ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Peak Load (Power)</Text>
                    <Text size={300} weight="bold" style={{ color: SERIES.energy }}>{peakPower.kw.toFixed(2)} kW</Text>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Peak Load Time</Text>
                    <Text size={300} weight="semibold" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock20Regular style={{ fontSize: '14px', color: tokens.colorNeutralForeground3 }} />
                      {formatOccurrenceTime(peakPower.time)}
                    </Text>
                  </div>
                </>
              ) : (
                <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>No peak load data available</Text>
              )}
            </div>
          </div>

          {/* Card 3: spot price range */}
          <div className={styles.analyticsCard}>
            <div className={styles.analyticsHeader}>
              <ArrowTrending24Regular style={{ color: SERIES.spot, fontSize: '20px' }} />
              <Text size={300} weight="semibold">Spot Price Range</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {minSpot && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ArrowDown16Regular style={{ color: tokens.colorPaletteGreenForeground1 }} />
                    Minimum Price
                  </Text>
                  <div>
                    <Text size={300} weight="semibold" style={{ color: tokens.colorPaletteGreenForeground1 }}>{minSpot.price.toFixed(2)} c</Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground4, marginLeft: '6px' }}>at {formatOccurrenceTime(minSpot.time)}</Text>
                  </div>
                </div>
              )}
              {maxSpot && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <ArrowUp16Regular style={{ color: tokens.colorPaletteRedForeground1 }} />
                    Maximum Price
                  </Text>
                  <div>
                    <Text size={300} weight="semibold" style={{ color: tokens.colorPaletteRedForeground1 }}>{maxSpot.price.toFixed(2)} c</Text>
                    <Text size={100} style={{ color: tokens.colorNeutralForeground4, marginLeft: '6px' }}>at {formatOccurrenceTime(maxSpot.time)}</Text>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsumptionChart;
