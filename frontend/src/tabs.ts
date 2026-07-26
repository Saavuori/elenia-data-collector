import {
  DataBarVertical24Regular,
  DataBarVertical24Filled,
  Home24Regular,
  Home24Filled,
  Settings24Regular,
  Settings24Filled,
} from '@fluentui/react-icons';
import type React from 'react';
import type { TabKey } from './types';

export interface TabDef {
  key: TabKey;
  label: string;
  icon: React.FC<{ fontSize?: number }>;
  iconActive: React.FC<{ fontSize?: number }>;
}

/** The three sections of the app, in tab-bar order. */
export const TABS: TabDef[] = [
  { key: 'usage', label: 'Usage', icon: DataBarVertical24Regular, iconActive: DataBarVertical24Filled },
  { key: 'sites', label: 'Sites', icon: Home24Regular, iconActive: Home24Filled },
  { key: 'settings', label: 'Settings', icon: Settings24Regular, iconActive: Settings24Filled },
];
