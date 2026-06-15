const JAVA_INT_MIN = -2147483648n;
const JAVA_INT_MAX = 2147483647n;
const ASCII_DECIMAL_INT_RE = /^[+-]?\d+$/;

/**
 * Parse an ASCII base-10 token using Java {@code Integer.parseInt}-style
 * syntax and 32-bit signed range checks.
 */
export function parseJavaInt(s: string): number | null {
  if (!ASCII_DECIMAL_INT_RE.test(s)) {
    return null;
  }

  const value = BigInt(s);
  if ((value < JAVA_INT_MIN) || (value > JAVA_INT_MAX)) {
    return null;
  }

  return Number(value);
}
