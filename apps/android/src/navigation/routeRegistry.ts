// Type-safe route definitions for TokenFence Mobile Lite
// Labels are now i18n-aware via tk() and labelKey

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
  labelKey: string;
  icon: string;
  badge?: string;
}

export const ROUTE_REGISTRY: RouteConfig[] = [
  { name: 'Home',        labelKey: 'android.home',       icon: '\u{1F3E0}' },
  { name: 'Guard',       labelKey: 'android.guard',      icon: '\u{1F6E1}\uFE0F' },
  { name: 'Documents',   labelKey: 'android.documents',  icon: '\u{1F4C4}' },
  { name: 'Models',      labelKey: 'android.models',     icon: '\u2699\uFE0F' },
  { name: 'Archive',     labelKey: 'android.archive',    icon: '\u{1F4C1}' },
  { name: 'AgentLab',    labelKey: 'android.agentLab',   icon: '\u{1F916}' },
  { name: 'PluginStore', labelKey: 'android.plugins',    icon: '\u{1F9E9}' },
  { name: 'Output',      labelKey: 'android.output',     icon: '\u{1F4E4}' },
  { name: 'MindMap',     labelKey: 'android.mindMap',    icon: '\u{1F9E0}' },
  { name: 'ComputerUse', labelKey: 'android.computerUse',icon: '\u{1F5A5}\uFE0F' },
  { name: 'Routing',     labelKey: 'android.routing',    icon: '\u{1F500}' },
  { name: 'Settings',    labelKey: 'android.settings',   icon: '\u2699\uFE0F' },
  { name: 'More',        labelKey: 'android.more',       icon: '\u22EF' },
];

export const TAB_ROUTES: (ScreenName | 'More')[] = ['Home', 'Guard', 'Documents', 'Models', 'More'];
export const MORE_ROUTES: ScreenName[] = ['Archive', 'AgentLab', 'PluginStore', 'Output', 'MindMap', 'ComputerUse', 'Routing', 'Settings'];

export function findRoute(name: ScreenName | 'More'): RouteConfig {
  return ROUTE_REGISTRY.find(r => r.name === name) || { name, labelKey: name, icon: '\u2022' };
}
