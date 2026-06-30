import { useEffect, useState } from "react";

function remainingMs(expiresAt: string): number {
  return Math.max(0, new Date(expiresAt).getTime() - Date.now());
}

export function formatGrantCountdown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function WeekGrantCountdown({
  expiresAt,
  className,
}: {
  expiresAt: string;
  className?: string;
}) {
  const [ms, setMs] = useState(() => remainingMs(expiresAt));

  useEffect(() => {
    setMs(remainingMs(expiresAt));
    const id = setInterval(() => setMs(remainingMs(expiresAt)), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (ms <= 0) return null;

  return (
    <span className={`font-mono tabular-nums font-semibold ${className ?? ""}`}>
      {formatGrantCountdown(ms)}
    </span>
  );
}
