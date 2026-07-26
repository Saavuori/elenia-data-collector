import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
  Spinner,
  Text,
  Badge,
  tokens,
  makeStyles,
  mergeClasses,
  shorthands,
} from '@fluentui/react-components';
import {
  BoxMultiple24Regular,
  Location24Regular,
  Diversity24Regular,
} from '@fluentui/react-icons';
import { SERIES } from '../theme';

// ── Types ────────────────────────────────────────────────────────────────────

export interface MeteringPoint {
  gsrn: string;
  customer_id: string;
  street_address: string | null;
  postal_code: string | null;
  city: string | null;
  product_description: string | null;
  device_name: string | null;
  device_serialnumber: string | null;
  contract_start: string | null;
  contract_end: string | null;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXL,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
    gap: tokens.spacingHorizontalXL,
  },
  card: {
    background: tokens.colorNeutralBackground2,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusXLarge,
    padding: tokens.spacingVerticalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    boxShadow: tokens.shadow4,
    transition: 'box-shadow 0.18s ease, border-color 0.18s ease',
    ':hover': {
      boxShadow: tokens.shadow8,
      ...shorthands.borderColor(tokens.colorNeutralStroke1),
    },
  },
  cardSelected: {
    ...shorthands.borderColor(SERIES.energy),
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  iconBox: {
    background: `linear-gradient(135deg, ${SERIES.energy}, #2f7d32)`,
    padding: '10px',
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: tokens.shadow4,
    fontSize: '20px',
    color: 'white',
  },
  detailList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    background: tokens.colorNeutralBackground3,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  sectionLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: tokens.fontWeightSemibold,
  },
  centeredState: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: tokens.spacingVerticalXXL,
  },
});

// ── Detail row ────────────────────────────────────────────────────────────────

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const styles = useStyles();
  return (
    <div className={styles.detailRow}>
      <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{label}</Text>
      <Text size={300} weight="semibold" style={{ fontFamily: tokens.fontFamilyMonospace }}>{value}</Text>
    </div>
  );
};

// ── MeteringPointInfo ─────────────────────────────────────────────────────────

const MeteringPointInfo: React.FC = () => {
  const styles = useStyles();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['metering-points'],
    queryFn: async () => {
      const res = await axios.get('metering-points');
      return res.data as { metering_points: MeteringPoint[]; selected_gsrn: string | null };
    },
    staleTime: 1000 * 60 * 30,
  });

  if (isLoading) {
    return (
      <div className={styles.centeredState}>
        <Spinner size="large" label="Loading metering points…" />
      </div>
    );
  }

  if (isError || !data?.metering_points?.length) return null;

  return (
    <div className={mergeClasses(styles.section, 'animate-fade-in')}>
      <div>
        <Text as="h2" size={600} weight="semibold" style={{ display: 'block' }}>Metering Points</Text>
        <Text size={300} style={{ color: tokens.colorNeutralForeground3, marginTop: '4px', display: 'block' }}>
          Delivery sites connected to your Elenia account
        </Text>
      </div>

      <div className={styles.grid}>
        {data.metering_points.map((mp) => {
          const isSelected = mp.gsrn === data.selected_gsrn;
          const address = [mp.street_address, [mp.postal_code, mp.city].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ');

          return (
            <div
              key={mp.gsrn}
              className={mergeClasses(styles.card, isSelected ? styles.cardSelected : undefined)}
            >
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderLeft}>
                  <div className={styles.iconBox}>
                    <BoxMultiple24Regular />
                  </div>
                  <div>
                    <Text size={400} weight="semibold" style={{ display: 'block' }}>
                      {mp.street_address || 'Metering point'}
                    </Text>
                    <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>
                      Customer {mp.customer_id}
                    </Text>
                  </div>
                </div>
                {isSelected && (
                  <Badge appearance="tint" color="success" shape="rounded">Active</Badge>
                )}
              </div>

              {address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Location24Regular style={{ color: tokens.colorNeutralForeground3, fontSize: '18px' }} />
                  <Text size={300} style={{ color: tokens.colorNeutralForeground2 }}>{address}</Text>
                </div>
              )}

              <div>
                <div className={styles.sectionLabel}>
                  <Diversity24Regular style={{ fontSize: '14px' }} />
                  Connection Details
                </div>
                <div className={styles.detailList}>
                  <DetailRow label="GSRN" value={mp.gsrn} />
                  {mp.product_description && (
                    <DetailRow label="Product" value={mp.product_description} />
                  )}
                  {mp.device_name && <DetailRow label="Meter" value={mp.device_name} />}
                  {mp.device_serialnumber && (
                    <DetailRow label="Serial number" value={mp.device_serialnumber} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MeteringPointInfo;
