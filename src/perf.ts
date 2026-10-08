const WINDOW_MS = 2000;
const LIMIT_MS = 20;
const RESTORE_MS = 10000;
const IGNORE_ABOVE_MS = 250;

/**
 * SPEC §14 frame-time guard. If frames average over 20 ms across 2 s, `low` turns on (one noise octave,
 * half resolution). It turns off again after 10 s of good windows.
 */
export class FrameGuard {
  low = false;
  private sum = 0;
  private n = 0;
  private windowMs = 0;
  private goodMs = 0;

  /** Feed one raw frame interval in ms. Returns true when `low` changed. */
  push(frameMs: number): boolean {
    if (frameMs > IGNORE_ABOVE_MS) return false; // a pause (hidden tab, off-screen), not a slow frame
    this.sum += frameMs;
    this.n++;
    this.windowMs += frameMs;
    if (this.windowMs < WINDOW_MS) return false;

    const avg = this.sum / this.n;
    const span = this.windowMs;
    this.sum = this.n = this.windowMs = 0;

    if (!this.low) {
      if (avg > LIMIT_MS) {
        this.low = true;
        this.goodMs = 0;
        return true;
      }
      return false;
    }
    this.goodMs = avg <= LIMIT_MS ? this.goodMs + span : 0;
    if (this.goodMs >= RESTORE_MS) {
      this.low = false;
      this.goodMs = 0;
      return true;
    }
    return false;
  }

  reset(): void {
    this.low = false;
    this.sum = this.n = this.windowMs = this.goodMs = 0;
  }
}
