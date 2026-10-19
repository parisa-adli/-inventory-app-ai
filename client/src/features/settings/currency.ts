const names = new Intl.DisplayNames(undefined, { type: 'currency' });

/** "EUR — Euro"; a code the browser has no name for shows alone. */
export const currencyLabel = (code: string) => {
  const name = names.of(code);
  return name && name !== code ? `${code} — ${name}` : code;
};

/** Every ISO 4217 code this browser knows, so only a real currency can be picked. */
export const CURRENCIES = Intl.supportedValuesOf('currency').map((code) => ({ code, label: currencyLabel(code) }));
