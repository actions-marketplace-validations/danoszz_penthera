/**
 * CPU time spent running `fn`, in milliseconds.
 *
 * For "stays linear on hostile input" (ReDoS) guards. Wall-clock time counts
 * every moment the worker is descheduled, so on a loaded laptop a linear
 * function can blow a 200 ms budget; CPU time only counts work this process
 * did, so a real regression (seconds of backtracking) still fails and load
 * does not. vitest's default pool runs each file in its own process.
 */
export function cpuMs(fn) {
  const start = process.cpuUsage();
  fn();
  const { user, system } = process.cpuUsage(start);
  return (user + system) / 1000;
}
