import os from "node:os";
import { readState } from "@/lib/db";
import { errorMessage, json, route } from "@/lib/http";
import { loadedModels, ollamaVersion, resolveModels } from "@/lib/ollama";
import type { AiStatus } from "@/lib/types";

// VMware, VirtualBox, WSL/Hyper-V and VPN adapters have IPs a phone can't reach.
const VIRTUAL_ADAPTER = /vmware|virtualbox|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier|vpn/i;

/** Addresses a phone on the same Wi-Fi can use to open the app. */
function lanUrls(req: Request): string[] {
  const port = new URL(req.url).port;
  const found = Object.entries(os.networkInterfaces()).flatMap(([name, list]) =>
    (list ?? [])
      .filter((i) => i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
      .map((i) => ({ name, address: i.address })),
  );
  const real = found.filter((i) => !VIRTUAL_ADAPTER.test(i.name));
  return (real.length ? real : found).map((i) => `http://${i.address}${port ? `:${port}` : ""}`);
}

export const GET = route(async (req: Request) => {
  const state = await readState();
  const base = { installed: [], loaded: [], textModel: null, visionModel: null, lanUrls: lanUrls(req) };
  try {
    const [version, models, loaded] = await Promise.all([ollamaVersion(), resolveModels(state.settings), loadedModels()]);
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
