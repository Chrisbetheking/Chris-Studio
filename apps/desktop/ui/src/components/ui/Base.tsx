import React from "react";

interface BadgeProps { variant?: "success"|"info"|"warning"|"danger"|"neutral"; children: React.ReactNode; className?: string; }
export function Badge({ variant = "neutral", children, className = "" }: BadgeProps) {
  return <span className={`tf-badge tf-badge-${variant} ${className}`}>{children}</span>;
}

interface CardProps { children: React.ReactNode; className?: string; style?: React.CSSProperties; onClick?: () => void; }
export function Card({ children, className = "", style, onClick }: CardProps) {
  return <div className={`tf-card ${className}`} style={{ ...style, cursor: onClick ? "pointer" : undefined }} onClick={onClick}>{children}</div>;
}

export function CardHeader({ children }: { children: React.ReactNode }) { return <div className="tf-card-header">{children}</div>; }
export function CardTitle({ children }: { children: React.ReactNode }) { return <div className="tf-card-title">{children}</div>; }
export function CardSubtitle({ children }: { children: React.ReactNode }) { return <div className="tf-card-subtitle">{children}</div>; }

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> { label?: string; }
export function Input({ label, className = "", ...props }: InputProps) {
  if (label) return <div><label className="tf-input-label">{label}</label><input className={`tf-input ${className}`} {...props} /></div>;
  return <input className={`tf-input ${className}`} {...props} />;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; options: { value: string; label: string }[];
}
export function Select({ label, options, className = "", ...props }: SelectProps) {
  const sel = <select className={`tf-select ${className}`} {...props}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if (label) return <div><label className="tf-input-label">{label}</label>{sel}</div>;
  return sel;
}

interface EmptyStateProps { icon?: string; title: string; description?: string; children?: React.ReactNode; }
export function EmptyState({ icon = "📭", title, description, children }: EmptyStateProps) {
  return (
    <div className="tf-empty">
      <div className="tf-empty-icon">{icon}</div>
      <div className="tf-empty-title">{title}</div>
      {description && <div className="tf-empty-desc">{description}</div>}
      {children}
    </div>
  );
}

interface ProgressProps { value: number; max?: number; variant?: "default"|"warning"|"danger"; }
export function Progress({ value, max = 100, variant = "default" }: ProgressProps) {
  const pct = Math.min(100, (value / max) * 100);
  return <div className="tf-progress"><div className={`tf-progress-fill ${variant !== "default" ? variant : ""}`} style={{ width: `${pct}%` }} /></div>;
}

interface TabsProps { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void; }
export function Tabs({ tabs, active, onChange }: TabsProps) {
  return <div className="tf-tabs">{tabs.map(t => <button key={t.id} className={`tf-tab ${t.id === active ? "active" : ""}`} onClick={() => onChange(t.id)}>{t.label}</button>)}</div>;
}

interface ModalProps { open: boolean; onClose: () => void; title: string; children: React.ReactNode; }
export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="tf-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tf-modal">
        <div className="tf-modal-header">
          <div className="tf-modal-title">{title}</div>
          <button className="tf-btn tf-btn-ghost tf-btn-sm" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}