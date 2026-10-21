/** node:os for the check: a fixed home that is never mounted, so --home scans find nothing. */
export const homedir = () => "/home/visitor";
export const tmpdir = () => "/tmp";
export const platform = () => "browser";
export const EOL = "\n";
export default { homedir, tmpdir, platform, EOL };
