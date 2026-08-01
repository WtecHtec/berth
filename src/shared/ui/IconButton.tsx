import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: "plain" | "glass" | "accent";
}

export function IconButton({ label, children, variant = "plain", className = "", ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-button icon-button--${variant} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
