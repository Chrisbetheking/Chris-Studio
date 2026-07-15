import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'shield' | 'plus' | 'workspace' | 'history' | 'server' | 'settings' | 'info'
  | 'panel' | 'paperclip' | 'send' | 'search' | 'trash' | 'edit' | 'check'
  | 'alert' | 'eye' | 'eyeOff' | 'x' | 'download' | 'chevron' | 'lock';

const paths: Record<IconName, ReactNode> = {
  shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8 7 10 4.2-2 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
  plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
  workspace: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h8"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v5l3 2"/></>,
  server: <><rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></>,
  paperclip: <path d="m20.5 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-2.8-2.8l8.2-8.2"/>,
  send: <><path d="m22 2-7 20-4-9-9-4 20-7Z"/><path d="M22 2 11 13"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
  edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17h.01"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  eyeOff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.8M6.2 6.2C3.5 8 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4-.8"/></>,
  x: <><path d="m6 6 12 12M18 6 6 18"/></>,
  download: <><path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 20h16"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
};

export function Icon({ name, size = 18, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
