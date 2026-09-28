import os from "node:os";
import { requirePerson } from "@/lib/auth";
import { readPeople } from "@/lib/db";
import { errorMessage, json, route } from "@/lib/http";
import { loadedModels, ollamaVersion, resolveModels } from "@/lib/ollama";
import { tailscaleInfo } from "@/lib/tailscale";
import type { AiStatus } from "@/lib/types";

// VMware, VirtualBox, WSL/Hyper-V and VPN adapters have IPs a phone on your Wi-Fi can't reach.
const VIRTUAL_ADAPTER = /vmware|virtualbox|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier|vpn/i;

function addresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list ?? [])
      .filter((i) => i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
      .map((i) => ({ name, address: i.address })),
  );
}

/** Tailscale hands out addresses in 100.64.0.0/10. */
const isTailscaleIp = (ip: string) => {
  const [a, b] = ip.split(".").map(Number);
  return a === 100 && b >= 64 && b <= 127;
};

/** Addresses a phone can use: on the same Wi-Fi, and from anywhere through Tailscale. */
async function appUrls(req: Request): Promise<{ lanUrls: string[]; tailscaleUrls: string[] }> {
  const port = new URL(req.url).port;
  const withPort = (host: string) => `http://${host}${port ? `:${port}` : ""}`;
  const found = addresses();
  const lan = found.filter((i) => !VIRTUAL_ADAPTER.test(i.name) && !isTailscaleIp(i.address));

  const ts = await tailscaleInfo();
  const tailscaleUrls = ts.serving && ts.dnsName
    ? [`https://${ts.dnsName}`]
    : found.filter((i) => /tailscale/i.test(i.name) || isTailscaleIp(i.address)).map((i) => withPort(i.address));

  return { lanUrls: (lan.length ? lan : found.filter((i) => !isTailscaleIp(i.address))).map((i) => withPort(i.address)), tailscaleUrls };
}

export const GET = route(async (req: Request) => {
  await requirePerson(req);
  const [{ settings }, urls] = await Promise.all([readPeople(), appUrls(req)]);
  const base = { installed: [], loaded: [], textModel: null, visionModel: null, ...urls };
  try {
    const [version, models, loaded] = await Promise.all([ollamaVersion(), resolveModels(settings), loadedModels()]);
    const status: AiStatus = {
      ...base,
      online: true,
      version,
      installed: models.installed,
      loaded,
      textModel: models.text,
      visionModel: models.vision,
    };
    return json(status);
  } catch (err) {
    const status: AiStatus = { ...base, online: false, error: errorMessage(err) };
    return json(status);
  }
});
