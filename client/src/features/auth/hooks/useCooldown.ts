import { useCallback, useEffect, useState } from 'react';

/** A countdown in seconds, e.g. for a button that must stay disabled until the server's Retry-After passes. */
export const useCooldown = () => {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until <= Date.now()) return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  const start = useCallback((seconds: number) => {
    setNow(Date.now());
    setUntil(Date.now() + seconds * 1000);
  }, []);

  return { secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)), start };
};
