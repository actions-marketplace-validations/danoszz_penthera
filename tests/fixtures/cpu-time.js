/**
 * CPU time spent running `fn`, in milliseconds.
 *
 * For "stays linear on hostile input" (ReDoS) guards. Wall-clock time counts
 * every moment the worker is descheduled, so on a loaded laptop a linear
 * function can blow a 200 ms budget; CPU time only counts work this process
 * did, so a real regression (seconds of backtracking) still fails and load
 * does not. vitest's default pool runs each file in its own process.
 *
 * The process's CPU time also includes V8's own threads (garbage collection,
 * the compiler), so one run on a busy CI machine can come out slow. With
 * `runs` above 1 the fastest run counts: background work drops out, while real
 * backtracking is slow on every run. (CI, 2026-10-25: 1500.2 ms against a
 * 1500 ms budget for a function that takes 1 to 3 ms.)
 */
export function cpuMs(fn, { runs = 1 } = {}) {
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = process.cpuUsage();
    fn();
    const { user, system } = process.cpuUsage(start);
    best = Math.min(best, (user + system) / 1000);
  }
  return best;
}
