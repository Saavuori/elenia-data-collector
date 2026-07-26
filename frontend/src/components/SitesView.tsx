import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Button, Spinner, makeStyles, mergeClasses, shorthands } from '@fluentui/react-components';
import {
  Home24Filled,
  Location20Regular,
  CheckmarkCircle20Filled,
  ErrorCircle24Regular,
} from '@fluentui/react-icons';

import { usePalette } from '../theme';
import { Card, EmptyState, Row, RowList } from './ui';
import type { MeteringPointsResponse } from '../types';

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
  subtitle: {
    display: 'block',
    marginTop: '4px',
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: '12px',
    '@media (min-width: 768px)': {
      gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
      gap: '16px',
    },
  },
  cardActive: {
    ...shorthands.borderColor('var(--energy)'),
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '16px 16px 12px',
  },
  iconTile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '42px',
    height: '42px',
    borderRadius: '14px',
    background: 'var(--energy-soft)',
    color: 'var(--energy)',
    flexShrink: 0,
  },
  headText: {
    minWidth: 0,
    flex: 1,
  },
  name: {
    display: 'block',
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  address: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginTop: '2px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    height: '26px',
    padding: '0 10px',
    borderRadius: '999px',
    background: 'var(--energy-soft)',
    color: 'var(--energy)',
    fontSize: '12px',
    fontWeight: 650,
    flexShrink: 0,
  },
  footer: {
    padding: '12px 16px 16px',
  },
  selectButton: {
    width: '100%',
    height: '44px',
    borderRadius: '12px',
    justifyContent: 'center',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '64px 0',
  },
});

const SitesView: React.FC = () => {
  const styles = useStyles();
  const palette = usePalette();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['metering-points'],
    queryFn: async () => {
      const res = await axios.get('metering-points');
      return res.data as MeteringPointsResponse;
    },
    staleTime: 1000 * 60 * 30,
  });

  const selectMutation = useMutation({
    mutationFn: async (gsrn: string) => {
      await axios.post('metering-points/select', { gsrn });
      return gsrn;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metering-points'] });
      queryClient.invalidateQueries({ queryKey: ['consumption'] });
    },
  });

  return (
    <div className={mergeClasses(styles.view, 'animate-fade-in')}>
      <div>
        <h1 className={styles.title}>Sites</h1>
        <span className={styles.subtitle}>Delivery sites linked to your Elenia account</span>
      </div>

      {isLoading ? (
        <div className={styles.loading}>
          <Spinner size="small" label="Loading sites…" />
        </div>
      ) : isError ? (
        <Card>
          <EmptyState
            icon={<ErrorCircle24Regular />}
            title="Could not load sites"
            body="The backend did not answer. Check that it is running and try again."
            action={<Button appearance="secondary" onClick={() => refetch()}>Retry</Button>}
          />
        </Card>
      ) : !data?.metering_points?.length ? (
        <Card>
          <EmptyState
            icon={<Home24Filled />}
            title="No metering points"
            body="Your Elenia account has no delivery sites attached to it."
          />
        </Card>
      ) : (
        <div className={styles.list}>
          {data.metering_points.map(mp => {
            const isSelected = mp.gsrn === data.selected_gsrn;
            const city = [mp.postal_code, mp.city].filter(Boolean).join(' ');
            const isPending = selectMutation.isPending && selectMutation.variables === mp.gsrn;

            return (
              <Card key={mp.gsrn} padded={false} className={isSelected ? styles.cardActive : undefined}>
                <div className={styles.head}>
                  <span className={styles.iconTile}>
                    <Home24Filled />
                  </span>
                  <div className={styles.headText}>
                    <span className={styles.name}>{mp.street_address || 'Metering point'}</span>
                    {city && (
                      <span className={styles.address}>
                        <Location20Regular fontSize={15} />
                        {city}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <span className={styles.badge}>
                      <CheckmarkCircle20Filled fontSize={14} />
                      Active
                    </span>
                  )}
                </div>

                <RowList>
                  <Row label="GSRN" value={mp.gsrn} mono />
                  <Row label="Customer" value={mp.customer_id} mono />
                  {mp.product_description && <Row label="Product" value={mp.product_description} />}
                  {mp.device_name && <Row label="Meter" value={mp.device_name} />}
                  {mp.device_serialnumber && <Row label="Serial" value={mp.device_serialnumber} mono />}
                </RowList>

                {!isSelected && (
                  <div className={styles.footer}>
                    <Button
                      appearance="secondary"
                      className={styles.selectButton}
                      disabled={isPending}
                      icon={isPending ? <Spinner size="tiny" /> : undefined}
                      onClick={() => selectMutation.mutate(mp.gsrn)}
                    >
                      Show this site
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selectMutation.isError && (
        <Card>
          <span style={{ color: palette.negative, fontSize: '13px' }}>
            Could not switch site — please try again.
          </span>
        </Card>
      )}
    </div>
  );
};

export default SitesView;
