import os from "node:os";
import type { NextConfig } from "next";

// Let phones use the dev server (next dev only allows localhost by default):
// this computer's own addresses (Wi-Fi and Tailscale), its name, and Tailscale's *.ts.net names.
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: [...lanAddresses, os.hostname().toLowerCase(), "**.ts.net"],
};

export default nextConfig;
