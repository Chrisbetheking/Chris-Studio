"use client";

import { type ReactNode } from "react";

/* ── Card primitives ── */

type CardVariant = "default" | "accent" | "warning" | "success" | "danger";

export function Card({ children, variant = "default", className = "", onClick }: {
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
  onClick?: () => void;
}) {
  const colors: Record<CardVariant, string> = {
    default: "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800",
    accent: "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30",
    warning: "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30",
    success: "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30",
    danger: "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`rounded-2.5xl border shadow-card p-5 transition-all ${colors[variant]} ${onClick ? "cursor-pointer hover:shadow-elevated hover:-translate-y-0.5" : ""} ${className}`}
      onClick={onClick as any}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action }: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardStat({ label, value, trend }: {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
}) {
  const trendColors = { up: "text-emerald-600 dark:text-emerald-400", down: "text-red-600 dark:text-red-400", neutral: "text-slate-400" };
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 ${trend ? trendColors[trend] : ""}`}>
        {value}
      </span>
    </div>
  );
}

/* ── Chips & badges ── */

type ChipTone = "slate" | "blue" | "green" | "amber" | "red" | "purple";

const chipColorMap: Record<ChipTone, string> = {
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export function Chip({ children, tone = "slate", className = "" }: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${chipColorMap[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function StatusDot({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`status-dot inline-block h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
      {label && <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>}
    </span>
  );
}

export function RiskBadge({ level }: { level: "safe" | "low" | "medium" | "high" | "critical" }) {
  const map = {
    safe: { tone: "green" as const, label: "Safe" },
    low: { tone: "blue" as const, label: "Low Risk" },
    medium: { tone: "amber" as const, label: "Medium" },
    high: { tone: "red" as const, label: "High Risk" },
    critical: { tone: "red" as const, label: "Critical" },
  };
  const { tone, label } = map[level];
  return <Chip tone={tone}>{label}</Chip>;
}

export function VersionChip({ version }: { version: string }) {
  return (
    <Chip tone="blue">
      <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="mr-0.5"><circle cx="5" cy="5" r="4"/></svg>
      {version}
    </Chip>
  );
}

export function TokenChip({ tokens, label }: { tokens: number; label?: string }) {
  return (
    <Chip tone="slate">
      <span className="tabular-nums">{tokens}{label ? ` ${label}` : " tok"}</span>
    </Chip>
  );
}

/* ── Legacy compatibility (keep existing exports) ── */

export function Panel({ title, children, right, className = "" }: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2.5xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-card p-5 animate-fade-in ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title ? <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2> : <span />}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Badge({ children, tone = "slate" }: {
  children: ReactNode;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const tones = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    red: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  };
  return <span className={`rounded-full px-2 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="mb-3 text-slate-300 dark:text-slate-600">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export const inputClass = "w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 outline-none ring-0 transition placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500";
export const buttonClass = "rounded-xl bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 transition hover:bg-slate-700 dark:hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-50";
export const ghostButtonClass = "rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-700";
