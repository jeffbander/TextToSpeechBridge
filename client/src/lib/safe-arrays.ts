/**
 * Safe array utilities to prevent null/undefined crashes
 */

export function safeArray<T>(array: T[] | null | undefined): T[] {
  return Array.isArray(array) ? array : [];
}

export function safeFind<T>(
  array: T[] | null | undefined, 
  predicate: (item: T) => boolean
): T | undefined {
  const safeArr = safeArray(array);
  return safeArr.find(predicate);
}

export function safeMap<T, U>(
  array: T[] | null | undefined,
  mapper: (item: T, index: number) => U
): U[] {
  const safeArr = safeArray(array);
  return safeArr.map(mapper);
}

export function safeFilter<T>(
  array: T[] | null | undefined,
  predicate: (item: T) => boolean
): T[] {
  const safeArr = safeArray(array);
  return safeArr.filter(predicate);
}

export function safeLength(array: any[] | null | undefined): number {
  return safeArray(array).length;
}

export function isEmpty(array: any[] | null | undefined): boolean {
  return safeLength(array) === 0;
}