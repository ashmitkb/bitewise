"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, errorText } from "@/lib/client";
import type { AppState, FoodEntry, MealType, NewEntryItem, ProfileInput, Settings } from "@/lib/types";

type Status = "loading" | "ready" | "error";

export interface NewEntries {
  date: string;
  meal: MealType;
  items: NewEntryItem[];
  /** small JPEG data URL of the meal photo */
  photo?: string | null;
}

export type EntryPatch = Partial<Pick<FoodEntry, "name" | "portion" | "meal" | "date" | "grams" | "per100g" | "calories" | "protein" | "carbs" | "fat">>;

interface Store {
  status: Status;
  error: string | null;
  state: AppState | null;
  reload: () => Promise<void>;
  saveProfile: (profile: ProfileInput, date: string) => Promise<void>;
  addEntries: (input: NewEntries) => Promise<void>;
  updateEntry: (id: string, patch: EntryPatch) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  setWeight: (date: string, kg: number) => Promise<void>;
  deleteWeight: (date: string) => Promise<void>;
  setWater: (date: string, glasses: number) => Promise<void>;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  importBackup: (data: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<AppState>("/api/state").then(
        (data) => {
          setState(data);
          setStatus("ready");
          setError(null);
        },
        (err) => {
          setError(errorText(err));
          setStatus("error");
        },
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    setStatus("loading");
    await load();
  }, [load]);

  // Every mutation returns the full saved state, so the UI always matches the file on disk.
  const mutate = useCallback(async (path: string, method: string, body?: unknown) => {
    setState(await api<AppState>(path, { method, body }));
  }, []);

  const store = useMemo<Store>(
    () => ({
      status,
      error,
      state,
      reload,
      saveProfile: (profile, date) => mutate("/api/profile", "PUT", { ...profile, date }),
      addEntries: (input) => mutate("/api/entries", "POST", input),
      updateEntry: (id, patch) => mutate(`/api/entries/${id}`, "PATCH", patch),
      deleteEntry: (id) => mutate(`/api/entries/${id}`, "DELETE"),
      setWeight: (date, kg) => mutate("/api/weights", "PUT", { date, kg }),
      deleteWeight: (date) => mutate(`/api/weights?date=${encodeURIComponent(date)}`, "DELETE"),
      setWater: async (date, glasses) => {
        // optimistic: taps on the water glasses should feel instant
        setState((s) => (s ? { ...s, water: { ...s.water, [date]: glasses } } : s));
        await mutate("/api/water", "PUT", { date, glasses });
      },
      saveSettings: (settings) => mutate("/api/settings", "PUT", settings),
      importBackup: (data) => mutate("/api/backup", "POST", data),
      resetAll: () => mutate("/api/backup", "DELETE"),
    }),
    [status, error, state, reload, mutate],
  );

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error("useStore must be used inside <StoreProvider>");
  return store;
}

/** For components that only render once data has loaded. */
export function useAppState(): AppState {
  const { state } = useStore();
  if (!state) throw new Error("App state not loaded yet");
  return state;
}
