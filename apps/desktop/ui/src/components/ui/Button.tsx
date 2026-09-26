import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = "secondary", size = "md", loading, icon, children, className = "", ...props }: ButtonProps) {
  const cls = [
    "tf-btn",
    `tf-btn-${variant}`,
    size !== "md" ? `tf-btn-${size}` : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <span className="tf-spinner" /> : icon}
      {children}
    </button>
  );
}
