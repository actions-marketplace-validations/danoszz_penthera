/**
 * The owner-verified scan. Placeholder until agent C lands it: the token
 * action and the deep report both answer "not available yet".
 */
import { CheckError } from "./guard.mjs";

const notYet = () => new CheckError("not_available", "The verified scan is not available yet.", 501, "Run npx penthera <url> on your own machine for the full scan.");

export function tokenFor() { throw notYet(); }
export async function deepReport() { throw notYet(); }
