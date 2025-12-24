import type { ReactNode } from "react";

interface CalloutProps {
  children: ReactNode;
  variant?: "info" | "warning" | "error";
}

export function Callout({ children, variant = "info" }: CalloutProps) {
  const variantStyles = {
    info: "bg-blue-500/10 border-blue-500/30 text-blue-400",
    warning: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
    error: "bg-annex-500/10 border-annex-500/30 text-annex-400",
  };

  return <div className={`rounded border p-4 ${variantStyles[variant]}`}>{children}</div>;
}
