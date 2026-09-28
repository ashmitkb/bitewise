"use client";

import { toast } from "@/lib/client";
import { todayISO } from "@/lib/dates";
import { CameraIcon, SparkIcon, TextIcon } from "./icons";
import { ProfileForm } from "./ProfileForm";
import { useStore } from "./StoreProvider";

export function Onboarding() {
  const { saveProfile } = useStore();

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Welcome to Bitewise</h1>
        <p className="mx-auto mt-2 max-w-md text-ink-2">
          A diet tracker with an AI that runs on your own computer. Nothing you log leaves your machine.
        </p>
        <ul className="mt-5 grid gap-2 text-left text-sm sm:grid-cols-3">
          {[
            { Icon: TextIcon, text: "Type what you ate in plain words" },
            { Icon: CameraIcon, text: "Or snap a photo of your plate" },
            { Icon: SparkIcon, text: "Ask the coach what to eat next" },
          ].map(({ Icon, text }) => (
            <li key={text} className="card flex items-center gap-3 px-3 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand/12 text-brand-strong">
                <Icon size={18} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
      <div className="card p-5 sm:p-6">
        <h2 className="mb-4 text-lg font-semibold">First, a bit about you</h2>
        <ProfileForm
          submitLabel="Start tracking"
          onSubmit={async (profile) => {
            await saveProfile(profile, todayISO());
            window.scrollTo({ top: 0 });
            toast("You're all set. Log your first meal!");
          }}
        />
      </div>
    </div>
  );
}
