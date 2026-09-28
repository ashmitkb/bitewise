"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChartIcon, GearIcon, HomeIcon, Logo, SparkIcon } from "./icons";
import { Onboarding } from "./Onboarding";
import { useStore } from "./StoreProvider";
import { Toaster } from "./Toaster";

const NAV = [
  { href: "/", label: "Today", Icon: HomeIcon },
  { href: "/progress", label: "Progress", Icon: ChartIcon },
  { href: "/coach", label: "Coach", Icon: SparkIcon },
  { href: "/settings", label: "Settings", Icon: GearIcon },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status, state, error, reload } = useStore();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const ready = status === "ready" && !!state?.profile;

  let content: React.ReactNode = children;
  if (status === "loading") content = <Centered>Loading…</Centered>;
  else if (status === "error")
    content = (
      <Centered>
        <p className="font-semibold">Couldn&apos;t load your data</p>
        <p className="mt-1 text-sm text-ink-2">{error}</p>
        <button type="button" className="btn btn-secondary mt-4" onClick={() => void reload()}>
          Try again
        </button>
      </Centered>
    );
  else if (!state?.profile) content = <Onboarding />;

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-page/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 text-[1.05rem] font-semibold tracking-tight">
            <Logo />
            Bitewise
          </Link>
          {ready && (
            <nav aria-label="Main" className="hidden sm:block">
              <ul className="flex gap-1">
                {NAV.map(({ href, label, Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={isActive(href) ? "page" : undefined}
                      className={`flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors ${
                        isActive(href) ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:bg-surface-2"
                      }`}
                    >
                      <Icon size={18} />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 sm:pb-16">{content}</main>

      {ready && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        >
          <ul className="grid grid-cols-4">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={`flex h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-medium ${
                      active ? "text-brand-strong" : "text-muted"
                    }`}
                  >
                    <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <Toaster />
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-[50dvh] place-content-center text-center text-ink-2">{children}</div>;
}
