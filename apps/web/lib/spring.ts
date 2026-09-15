/**
 * A small critically-damped spring in Apple's two designer parameters
 * (damping ratio, response in seconds), driven by requestAnimationFrame.
 * Always animates from the current value, carries velocity through a
 * re-target, and integrates in fixed sub-steps so dropped frames cannot
 * make it explode.
 */
export function spring(
  get: () => number,
  set: (x: number) => void,
  opts: { response?: number; damping?: number; onDone?: () => void } = {},
) {
  const response = opts.response ?? 0.35;
  const damping = opts.damping ?? 1;
  const w = (2 * Math.PI) / response;
  const k = w * w;
  const c = 2 * damping * w;
  let v = 0;
  let target = get();
  let raf = 0;
  let last = 0;

  function step(t: number) {
    const dt = Math.min(0.1, Math.max(0.001, (t - last) / 1000 || 0.016));
    last = t;
    let x = get();
    let rem = dt;
    while (rem > 0) {
      const h = Math.min(0.002, rem);
      rem -= h;
      v += (-k * (x - target) - c * v) * h;
      x += v * h;
    }
    set(x);
    if (Math.abs(x - target) < 0.05 && Math.abs(v) < 0.5) {
      set(target);
      raf = 0;
      v = 0;
      opts.onDone?.();
      return;
    }
    raf = requestAnimationFrame(step);
  }

  return {
    to(t: number, velocity?: number) {
      target = t;
      if (velocity !== undefined) v = velocity;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(step);
      }
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    get velocity() {
      return v;
    },
  };
}

/** Where a flick would come to rest (UIKit's deceleration projection). */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}
