/** node:url. The build rewrites import.meta.url to file:///penthera/lib/..., so this is a plain path decode. */
export const fileURLToPath = (u) => decodeURIComponent(new URL(String(u)).pathname);
export const pathToFileURL = (p) => new URL(`file://${p}`);
export default { fileURLToPath, pathToFileURL };
