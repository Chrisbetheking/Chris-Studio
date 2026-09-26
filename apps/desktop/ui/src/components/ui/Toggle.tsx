import React from "react";

interface ToggleProps { checked: boolean; onChange: (checked: boolean) => void; label?: string; disabled?: boolean; }
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <label className="tf-toggle" style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="tf-toggle-track" />
      {label && <span className="tf-toggle-label">{label}</span>}
    </label>
  );
}