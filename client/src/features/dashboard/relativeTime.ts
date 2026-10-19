const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "15 minutes ago", "yesterday", "3 weeks ago" in the browser's locale, from `now`. */
export const formatRelativeTime = (iso: string, now = Date.now()) => {
  let amount = (new Date(iso).getTime() - now) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(amount) < size) return relative.format(Math.round(amount), unit);
    amount /= size;
  }
  return relative.format(Math.round(amount), 'year');
};
