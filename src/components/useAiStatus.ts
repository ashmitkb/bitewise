"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { AiStatus } from "@/lib/types";

function fetchStatus(): Promise<AiStatus> {
  return api<AiStatus>("/api/ai/status").catch((err) => ({
    online: false,
    error: errorText(err),
    installed: [],
    loaded: [],
    textModel: null,
    visionModel: null,
    lanUrls: [],
    tailscaleUrls: [],
  }));
}

/** Is Ollama running, and which models will the app use? */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let active = true;
    void fetchStatus().then((s) => {
      if (active) setStatus(s);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setStatus(await fetchStatus());
  }, []);

  return { status, refresh };
}
