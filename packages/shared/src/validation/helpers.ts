export function emptyStringToUndefined(value: unknown): unknown {
  return value === '' ? undefined : value;
}
