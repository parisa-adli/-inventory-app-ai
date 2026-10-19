import { useMemo } from 'react';
import { useSettings } from './settings';

/** Formats an amount in the app currency ("$1,250.00", "€1.250,00"), in the browser's locale. Nothing is converted. */
export const useMoney = (): ((value: number) => string) => {
  const { currency } = useSettings();
  return useMemo(() => {
    const format = new Intl.NumberFormat(undefined, { style: 'currency', currency });
    return (value: number) => format.format(value);
  }, [currency]);
};
