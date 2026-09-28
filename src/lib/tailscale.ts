import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

// The CLI isn't always on PATH right after installing on Windows.
const CANDIDATES =
  process.platform === "win32"
    ? ["tailscale", "C:\\Program Files\\Tailscale\\tailscale.exe"]
    : process.platform === "darwin"
      ? ["tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"]
      : ["tailscale"];

async function tailscale(args: string[]): Promise<string | null> {
  for (const bin of CANDIDATES) {
    try {
      return (await run(bin, args, { timeout: 2500, windowsHide: true })).stdout;
    } catch {
      // not installed here, not running, or not signed in
    }
  }
  return null;
}

export interface TailscaleInfo {
  /** e.g. my-pc.tail1234.ts.net, when Tailscale is running and signed in */
  dnsName: string | null;
  /** true when `tailscale serve` publishes the app over HTTPS on the tailnet */
  serving: boolean;
}

const shared = globalThis as typeof globalThis & { __tailscaleInfo?: { at: number; info: Promise<TailscaleInfo> } };

/** Best-effort, cached for 30 s: the app works the same without Tailscale. */
export function tailscaleInfo(): Promise<TailscaleInfo> {
  const cached = shared.__tailscaleInfo;
  if (cached && Date.now() - cached.at < 30_000) return cached.info;
  const info = (async (): Promise<TailscaleInfo> => {
    let dnsName: string | null = null;
    try {
      const status = JSON.parse((await tailscale(["status", "--json"])) ?? "null");
      if (status?.BackendState === "Running") dnsName = String(status.Self?.DNSName ?? "").replace(/\.$/, "") || null;
    } catch {
      // unexpected output
    }
    let serving = false;
    if (dnsName) {
      try {
        const serve = JSON.parse((await tailscale(["serve", "status", "--json"])) ?? "{}");
        serving = !!serve?.Web && Object.keys(serve.Web).length > 0;
      } catch {
        // no serve config
      }
    }
    return { dnsName, serving };
  })();
  shared.__tailscaleInfo = { at: Date.now(), info };
  return info;
}
