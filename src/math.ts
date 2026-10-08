export const clamp = (v: number, a = 0, b = 1): number => Math.min(b, Math.max(a, v));

/** Per-frame easing factor for a time constant: `k = 1 - e^(-dt/tau)`. */
export const expK = (dt: number, tau: number): number => 1 - Math.exp(-dt / tau);

export const easeInOut = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const easeOut = (x: number): number => 1 - Math.pow(1 - x, 3);
export const easeBack = (x: number): number => {
  const c1 = 2.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
/** The springy curve used for placement and the card (SPEC §9). */
export const springy = (x: number): number => 1 - Math.exp(-6 * x) * Math.cos(9 * x);
