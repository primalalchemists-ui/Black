"use client";

import { useEffect, useState } from "react";

export function ErrorSlot({
  message,
  minHeight = 20, // px ~ 1 linia
  hideAfterMs = 3000,
}: {
  message?: string;
  minHeight?: number;
  hideAfterMs?: number;
}) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const t = setTimeout(() => setVisible(false), hideAfterMs);
    return () => clearTimeout(t);
  }, [message, hideAfterMs]);

  return (
    <div style={{ minHeight }} aria-live="polite">
      {visible ? (
        <p className="text-sm text-destructive">{message}</p>
      ) : (
        <span />
      )}
    </div>
  );
}
