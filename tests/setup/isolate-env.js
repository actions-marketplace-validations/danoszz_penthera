/**
 * Runs in every test worker before its test file (vitest `setupFiles`).
 *
 * Gives the worker a private, empty HOME and points everything that would
 * otherwise read or write the developer's real machine state at it. Spawned
 * `git`, `npm` and `node bin/penthera.js` children inherit process.env, so they
 * are isolated too:
 *
 * - git ignores ~/.gitconfig, /etc/gitconfig and ~/.config/git (global hooks,
 *   hooksPath, signing, excludes) and never prompts.
 * - npm gets a per-worker cache and no update check, so parallel files never
 *   contend on ~/.npm and the deps scanner never reads the real cache.
 * - Penthera's own ~/.penthera (memory, settings, reports) is per worker.
 * - Spawned scans print the terminal report, not the agent brief they would
 *   print to a pipe by default (PENTHERA_BRIEF=0). Tests of that default
 *   delete the variable from the child's env.
 *
 * Tests that need a specific HOME or PENTHERA_HOME still pass their own.
 * See CONTRIBUTING.md, "Writing tests that stay reliable".
 */
import { mkdtempSync, mkdirSync, rmSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll } from "vitest";

const home = realpathSync(mkdtempSync(join(tmpdir(), "penthera-test-home-")));
mkdirSync(join(home, ".config"));
mkdirSync(join(home, ".cache"));

Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: join(home, ".config"),
  XDG_CACHE_HOME: join(home, ".cache"),
  PENTHERA_HOME: join(home, ".penthera"),
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "Penthera Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Penthera Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
  npm_config_cache: join(home, ".npm"),
  npm_config_update_notifier: "false",
  npm_config_fund: "false",
  npm_config_audit: "false",
  NO_UPDATE_NOTIFIER: "1",
  PENTHERA_BRIEF: "0",
});

afterAll(() => rmSync(home, { recursive: true, force: true }));
