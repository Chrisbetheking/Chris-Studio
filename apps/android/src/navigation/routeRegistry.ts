// Type-safe route definitions for TokenFence Mobile Lite
export type ScreenName =
  | 'Home'
  | 'Guard'
  | 'Documents'
  | 'Models'
  | 'Archive'
  | 'Settings'
  | 'AgentLab'
  | 'PluginStore'
  | 'Output'
  | 'MindMap'
  | 'ComputerUse'
  | 'Routing';

export interface RouteConfig {
  name: ScreenName | 'More';
  label: string;
  icon: string;
  badge?: string;
}

export const ROUTE_REGISTRY: RouteConfig[] = [
  { name: 'Home',        label: 'Home',      icon: '\u{1F3E0}' },
  { name: 'Guard',       label: 'Guard',     icon: '\u{1F6E1}\uFE0F' },
  { name: 'Documents',   label: 'Docs',      icon: '\u{1F4C4}' },
  { name: 'Models',      label: 'Models',    icon: '\u2699\uFE0F' },
  { name: 'Archive',     label: 'Archive',   icon: '\u{1F4C1}' },
  { name: 'AgentLab',    label: 'Agent',     icon: '\u{1F916}' },
  { name: 'PluginStore', label: 'Plugins',   icon: '\u{1F9E9}' },
  { name: 'Output',      label: 'Output',    icon: '\u{1F4E4}' },
  { name: 'MindMap',     label: 'MindMap',   icon: '\u{1F9E0}' },
  { name: 'ComputerUse', label: 'CompUse',   icon: '\u{1F5A5}\uFE0F' },
  { name: 'Routing',     label: 'Routing',   icon: '\u{1F500}' },
  { name: 'Settings',    label: 'Settings',  icon: '\u2699\uFE0F' },
  { name: 'More',        label: 'More',      icon: '\u22EF' },
];

export const TAB_ROUTES: (ScreenName | 'More')[] = ['Home', 'Guard', 'Documents', 'Models', 'More'];
export const MORE_ROUTES: ScreenName[] = ['Archive', 'AgentLab', 'PluginStore', 'Output', 'MindMap', 'ComputerUse', 'Routing', 'Settings'];

export function findRoute(name: ScreenName | 'More'): RouteConfig {
  return ROUTE_REGISTRY.find(r => r.name === name) || { name, label: name, icon: '\u2022' };
}