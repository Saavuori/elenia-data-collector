/** Shared chart/series colours. Elenia green for energy, amber for spot
 *  price, violet for cost — the same roles across every view. */
export const SERIES = {
  energy: '#63a70a',
  spot: '#dca70b',
  cost: '#8b5cf6',
} as const;

export const SERIES_SOFT = {
  energy: 'rgba(99, 167, 10, 0.12)',
  spot: 'rgba(220, 167, 11, 0.12)',
  cost: 'rgba(139, 92, 246, 0.12)',
} as const;
