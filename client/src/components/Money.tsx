import { useMoney } from '@/lib/money';

/** An amount in the app currency, kept on one line (table cells). */
export function Money({ value }: { value: number }) {
  const money = useMoney();
  return <span className="whitespace-nowrap">{money(value)}</span>;
}
