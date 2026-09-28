/**
 * Returns gradient stroke colors for a progress bar by percentage.
 * - > 80%: red gradient
 * - > 50%: yellow gradient
 * - otherwise: blue gradient
 */
export function getProgressStrokeColor(percent: number): { "0%": string; "100%": string } {
  if (percent > 80) {
    return { "0%": "var(--color-danger)", "100%": "var(--color-danger)" };
  }
  if (percent > 50) {
    return { "0%": "var(--color-warning)", "100%": "var(--color-warning)" };
  }
  return { "0%": "var(--color-primary)", "100%": "var(--color-primary)" };
}
