/** Signal strength is a search aid, never proof of custody or measured distance. */
export interface SignalState { rssi: number; strength: number; intervalMs: number; receivedAt: number }
export class ProximityProcessor {
  private value: SignalState | null = null;
  constructor(private target: string, private alpha = .35, private staleMs = 3000) {
    if (!target.trim() || !Number.isFinite(alpha) || alpha <= 0 || alpha > 1 || !Number.isFinite(staleMs) || staleMs <= 0) throw new Error('Invalid signal configuration');
  }
  reset() { this.value = null; }
  read(now = Date.now()): SignalState | null {
    if (!this.value || now - this.value.receivedAt >= this.staleMs || now < this.value.receivedAt) return null;
    return { ...this.value };
  }
  accept(tag: string, rssi: number, now = Date.now()): SignalState | null {
    if (tag.trim().toUpperCase() !== this.target.trim().toUpperCase() || !Number.isFinite(rssi) || rssi < -127 || rssi >= 0 || !Number.isFinite(now)) return null;
    if (this.value && now < this.value.receivedAt) return null;
    const previous = this.read(now);
    const filtered = previous ? this.alpha * rssi + (1 - this.alpha) * previous.rssi : rssi;
    const strength = Math.max(0, Math.min(1, (filtered + 95) / 60));
    this.value = { rssi: filtered, strength, intervalMs: Math.round(1200 - 1000 * strength ** 1.8), receivedAt: now };
    return { ...this.value };
  }
}

/** One loop; independently controlled audio/haptics, with stale checks before every pulse. */
export class ProximityFeedback {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  constructor(private sample: () => SignalState | null, private pulse: (state: SignalState) => void) {}
  start() { if (this.active) return; this.active = true; this.tick(); }
  stop() { this.active = false; if (this.timer !== null) clearTimeout(this.timer); this.timer = null; }
  private tick = () => {
    if (!this.active) return;
    const state = this.sample();
    if (state) this.pulse(state);
    if (this.active) this.timer = setTimeout(this.tick, state?.intervalMs ?? 250);
  };
}
