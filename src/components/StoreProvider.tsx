"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ApiError, api, errorText } from "@/lib/client";
import type { AppState, FoodEntry, MealType, NewEntryItem, ProfileInput, Settings } from "@/lib/types";

/** "signed-out" = show the "Who's using Bitewise?" screen */
type Status = "loading" | "ready" | "error" | "signed-out";

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
  // profiles
  signIn: (personId: string, pin?: string) => Promise<void>;
  createPerson: (name: string, pin?: string) => Promise<void>;
  signOut: () => Promise<void>;
  setPin: (currentPin: string | undefined, pin: string | null) => Promise<void>;
  deleteMe: () => Promise<void>;
  // my data
  saveProfile: (profile: ProfileInput, date: string) => Promise<void>;
  addEntries: (input: NewEntries) => Promise<void>;
  updateEntry: (id: string, patch: EntryPatch) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
  setWeight: (date: string, kg: number) => Promise<void>;
  deleteWeight: (date: string) => Promise<void>;
  setWater: (date: string, glasses: number) => Promise<void>;
  saveSettings: (settings: Partial<Settings>) => Promise<void>;
  importBackup: (data: unknown) => Promise<void>;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const signedOut = useCallback(() => {
    setState(null);
    setStatus("signed-out");
  }, []);

  const load = useCallback(
    () =>
      api<AppState>("/api/state").then(
        (data) => {
          setState(data);
          setStatus("ready");
          setError(null);
        },
        (err) => {
          if (err instanceof ApiError && err.status === 401) return signedOut();
          setError(errorText(err));
          setStatus("error");
        },
      ),
    [signedOut],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(async () => {
    setStatus("loading");
    await load();
  }, [load]);

  // Every change returns the full saved state, so the UI always matches the files on disk.
  const mutate = useCallback(
    async (path: string, method: string, body?: unknown) => {
      try {
        setState(await api<AppState>(path, { method, body }));
        setStatus("ready");
      } catch (err) {
        // signed out elsewhere, or the profile was deleted
        if (err instanceof ApiError && err.status === 401 && path !== "/api/session" && path !== "/api/pin") signedOut();
        throw err;
      }
    },
    [signedOut],
  );

  const store = useMemo<Store>(
    () => ({
      status,
      error,
      state,
      reload,
      signIn: (personId, pin) => mutate("/api/session", "POST", { id: personId, pin }),
      createPerson: (name, pin) => mutate("/api/people", "POST", { name, pin }),
      signOut: async () => {
        await api("/api/session", { method: "DELETE" });
        signedOut();
      },
      setPin: (currentPin, pin) => mutate("/api/pin", "PUT", { currentPin, pin }),
      deleteMe: async () => {
        await api("/api/backup", { method: "DELETE" });
        signedOut();
      },
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
    }),
    [status, error, state, reload, mutate, signedOut],
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
