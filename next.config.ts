import os from "node:os";
import type { NextConfig } from "next";

// Let phones on the same Wi-Fi use the dev server (next dev only allows localhost by default).
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
};

export default nextConfig;
