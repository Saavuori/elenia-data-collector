import React, { useEffect } from 'react';
import { makeStyles, mergeClasses, Button, Portal } from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { useIsMobile } from '../hooks/useMediaQuery';

/* ── Shared building blocks ───────────────────────────────────────────────────
   Everything here is mobile-first: base rules describe the phone layout and
   the `min-width: 768px` blocks scale it up for tablets and desktops.
--------------------------------------------------------------------------- */

const useStyles = makeStyles({
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
  },
  cardPadded: {
    padding: '16px',
    '@media (min-width: 768px)': {
      padding: '24px',
    },
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 4px 12px',
  },
  sectionTitle: {
    fontSize: '18px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
  },
  sectionSubtitle: {
    display: 'block',
    marginTop: '2px',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },

  segmented: {
    display: 'flex',
    gap: '2px',
    padding: '3px',
    borderRadius: '999px',
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    overflowX: 'auto',
  },
  segment: {
    // Phones: split the width evenly. Desktop: size to the label.
    flex: '1 0 auto',
    '@media (min-width: 768px)': {
      flex: '0 0 auto',
    },
    minHeight: '34px',
    padding: '0 14px',
    border: 'none',
    borderRadius: '999px',
    background: 'transparent',
    color: 'var(--text-muted)',
    fontSize: '13px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease',
  },
  segmentActive: {
    background: 'var(--surface)',
    color: 'var(--text)',
    boxShadow: 'var(--shadow-card)',
  },
  segmentDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },

  statTile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '14px 16px',
    borderRadius: '18px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow-card)',
    minWidth: 0,
  },
  statTop: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    borderRadius: '9px',
    fontSize: '16px',
    flexShrink: 0,
  },
  statLabel: {
    fontSize: '12px',
    fontWeight: 600,
    lineHeight: 1.25,
    color: 'var(--text-muted)',
  },
  statValue: {
    fontSize: '24px',
    fontWeight: 680,
    lineHeight: 1.1,
    letterSpacing: '-0.03em',
    '@media (min-width: 768px)': {
      fontSize: '28px',
    },
  },
  statHint: {
    fontSize: '12px',
    color: 'var(--text-faint)',
  },

  rowList: {
    display: 'flex',
    flexDirection: 'column',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    minHeight: '48px',
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    ':first-child': {
      borderTop: 'none',
    },
  },
  rowLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: 'var(--text-muted)',
    minWidth: 0,
  },
  rowValue: {
    fontSize: '14px',
    fontWeight: 620,
    textAlign: 'right',
    minWidth: 0,
    overflowWrap: 'anywhere',
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '48px 24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
  },
  emptyIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '52px',
    height: '52px',
    borderRadius: '18px',
    background: 'var(--surface-alt)',
    fontSize: '24px',
    color: 'var(--text-faint)',
  },
  emptyTitle: {
    fontSize: '15px',
    fontWeight: 620,
    color: 'var(--text)',
  },
  emptyBody: {
    fontSize: '13px',
    maxWidth: '280px',
  },

  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 900,
    background: 'rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
  },
  sheet: {
    position: 'fixed',
    zIndex: 901,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--surface)',
    boxShadow: 'var(--shadow-raised)',
    // Phone: bottom sheet.
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: 'min(88vh, 720px)',
    borderRadius: '24px 24px 0 0',
    borderTop: '1px solid var(--border)',
    paddingBottom: 'env(safe-area-inset-bottom)',
    // Tablet and up: right-hand drawer.
    '@media (min-width: 768px)': {
      left: 'auto',
      top: 0,
      width: 'min(460px, 100vw)',
      maxHeight: 'none',
      borderRadius: 0,
      borderTop: 'none',
      borderLeft: '1px solid var(--border)',
    },
  },
  grabber: {
    width: '40px',
    height: '4px',
    borderRadius: '999px',
    background: 'var(--border-strong)',
    margin: '10px auto 0',
    flexShrink: 0,
    '@media (min-width: 768px)': {
      display: 'none',
    },
  },
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '12px 12px 12px 20px',
    flexShrink: 0,
    '@media (min-width: 768px)': {
      paddingTop: '20px',
    },
  },
  sheetTitle: {
    fontSize: '17px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
  },
  sheetSubtitle: {
    display: 'block',
    fontSize: '13px',
    color: 'var(--text-muted)',
  },
  sheetBody: {
    padding: '4px 20px 24px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  },
});

// ── Card ─────────────────────────────────────────────────────────────────────

export const Card: React.FC<{
  children: React.ReactNode;
  padded?: boolean;
  className?: string;
}> = ({ children, padded = true, className }) => {
  const styles = useStyles();
  return (
    <div className={mergeClasses(styles.card, padded && styles.cardPadded, className)}>
      {children}
    </div>
  );
};

// ── Section header ───────────────────────────────────────────────────────────

export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}> = ({ title, subtitle, action }) => {
  const styles = useStyles();
  return (
    <div className={styles.sectionHeader}>
      <div>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle && <span className={styles.sectionSubtitle}>{subtitle}</span>}
      </div>
      {action}
    </div>
  );
};

// ── Segmented control ────────────────────────────────────────────────────────

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const styles = useStyles();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={mergeClasses(styles.segmented, 'no-scrollbar', className)}
    >
      {options.map(opt => (
        <button
          key={opt.value}
          role="tab"
          type="button"
          aria-selected={opt.value === value}
          disabled={opt.disabled}
          onClick={() => onChange(opt.value)}
          className={mergeClasses(
            styles.segment,
            opt.value === value && styles.segmentActive,
            opt.disabled && styles.segmentDisabled,
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Stat tile ────────────────────────────────────────────────────────────────

export const StatTile: React.FC<{
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tint?: string;
  accent?: string;
}> = ({ label, value, hint, icon, tint, accent }) => {
  const styles = useStyles();
  return (
    <div className={styles.statTile}>
      <div className={styles.statTop}>
        {icon && (
          <span className={styles.statIcon} style={{ background: tint, color: accent }}>
            {icon}
          </span>
        )}
        <span className={styles.statLabel}>{label}</span>
      </div>
      <span className={mergeClasses(styles.statValue, 'tnum')} style={{ color: accent }}>
        {value}
      </span>
      {hint && <span className={mergeClasses(styles.statHint, 'tnum')}>{hint}</span>}
    </div>
  );
};

// ── Key/value rows ───────────────────────────────────────────────────────────

export const RowList: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const styles = useStyles();
  return <div className={styles.rowList}>{children}</div>;
};

export const Row: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  valueColor?: string;
  mono?: boolean;
}> = ({ label, value, valueColor, mono }) => {
  const styles = useStyles();
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span
        className={mergeClasses(styles.rowValue, mono && 'tnum')}
        style={{ color: valueColor }}
      >
        {value}
      </span>
    </div>
  );
};

// ── Empty / error state ──────────────────────────────────────────────────────

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}> = ({ icon, title, body, action }) => {
  const styles = useStyles();
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}>{icon}</span>
      <span className={styles.emptyTitle}>{title}</span>
      {body && <span className={styles.emptyBody}>{body}</span>}
      {action}
    </div>
  );
};

// ── Sheet (bottom sheet on phones, drawer on desktop) ────────────────────────

export const Sheet: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ open, title, subtitle, onClose, children }) => {
  const styles = useStyles();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portalled because the view containers run a keyframe animation, and an
  // animated ancestor becomes the containing block for fixed positioning.
  return (
    <Portal>
      <div className={mergeClasses(styles.backdrop, 'animate-backdrop')} onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={mergeClasses(
          styles.sheet,
          isMobile ? 'animate-sheet-up' : 'animate-slide-in-right',
        )}
      >
        <div className={styles.grabber} />
        <div className={styles.sheetHeader}>
          <div>
            <span className={styles.sheetTitle}>{title}</span>
            {subtitle && <span className={styles.sheetSubtitle}>{subtitle}</span>}
          </div>
          <Button appearance="subtle" icon={<Dismiss24Regular />} onClick={onClose} aria-label="Close" />
        </div>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </Portal>
  );
};
