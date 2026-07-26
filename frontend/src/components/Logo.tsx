import React from 'react';

/** The app mark: the favicon's lightning bolt on an Elenia-green tile. */
export const Logo: React.FC<{ size?: number; radius?: number }> = ({ size = 32, radius = 9 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="eleniaflow-mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#8ACD16" />
        <stop offset="100%" stopColor="#3F7A05" />
      </linearGradient>
    </defs>
    <rect width="32" height="32" rx={radius} fill="url(#eleniaflow-mark)" />
    <path d="M17.6 4 8 18h6.2l-1.8 10 11.6-15.4h-6.6z" fill="#fff" />
  </svg>
);

export default Logo;
