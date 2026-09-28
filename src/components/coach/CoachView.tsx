"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorText, readLocal, streamEvents, writeLocal } from "@/lib/client";
import { todayISO } from "@/lib/dates";
import type { CoachEvent } from "@/lib/types";
import { AlertIcon, SendIcon, SparkIcon, StopIcon } from "../icons";
import { useAppState } from "../StoreProvider";
import { useAiStatus } from "../useAiStatus";
import { Markdown } from "./Markdown";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  error?: string;
}

const STORAGE_KEY = "bitewise-coach-chat";

const SUGGESTIONS = [
  "How am I doing today?",
  "What should I eat for dinner to hit my protein?",
  "Review my last 7 days",
  "3 high-protein snacks under 200 kcal",
];

export function CoachView() {
  const state = useAppState();
  const { status } = useAiStatus();
  const [messages, setMessages] = useState<ChatMessage[]>(() => readLocal<ChatMessage[]>(STORAGE_KEY, []));
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingNote, setLoadingNote] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void api("/api/ai/warmup", { method: "POST", body: { kind: "text" } }).catch(() => undefined);
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!busy) writeLocal(STORAGE_KEY, messages.slice(-40));
  }, [messages, busy]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loadingNote]);

  async function send(text: string, base: ChatMessage[] = messages) {
    const content = text.trim();
    if (!content || busy) return;
    const history: ChatMessage[] = [...base.filter((m) => !m.error), { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamEvents<CoachEvent>(
        "/api/ai/coach",
        { messages: history.map(({ role, content }) => ({ role, content })), date: todayISO() },
        (event) => {
          if (event.type === "status") setLoadingNote(event.message);
          else if (event.type === "delta") {
            setLoadingNote(null);
            setMessages((list) => {
              const next = list.slice();
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, content: last.content + event.text };
              return next;
            });
          } else if (event.type === "error") throw new Error(event.message);
        },
        controller.signal,
      );
    } catch (err) {
      const stopped = controller.signal.aborted;
      setMessages((list) => {
        const next = list.slice();
        const last = next[next.length - 1];
        // keep a partial answer after Stop; only flag it when nothing came through
        if (!stopped || !last.content) next[next.length - 1] = { ...last, error: stopped ? "Stopped." : errorText(err) };
        return next;
      });
    } finally {
      abortRef.current = null;
      setBusy(false);
      setLoadingNote(null);
    }
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const name = state.profile?.name;

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Coach</h1>
          <p className="text-sm text-ink-2">
            {status?.textModel ? `Runs on ${status.textModel}, right on this computer.` : "Your AI nutrition coach."} It can see your food log and targets.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost min-h-9 shrink-0 px-3 text-sm"
            disabled={busy}
            onClick={() => {
              setMessages([]);
              writeLocal(STORAGE_KEY, []);
            }}
          >
            New chat
          </button>
        )}
      </div>

      <div role="log" aria-live="polite" aria-busy={busy} className="flex-1 space-y-5">
        {messages.length === 0 && (
          <div className="card p-5">
            <div className="mb-3 grid size-10 place-items-center rounded-full bg-brand/12 text-brand-strong">
              <SparkIcon />
            </div>
            <p className="font-semibold">Hi{name ? ` ${name}` : ""}! Ask me anything about your eating.</p>
            <p className="mt-1 text-sm text-ink-2">I know your targets and what you&apos;ve logged, so I can give specific suggestions.</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <li key={s}>
                  <button type="button" className="rounded-full border border-line px-3 py-1.5 text-left text-sm hover:bg-surface-2" onClick={() => void send(s)}>
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-md bg-brand-strong px-4 py-2.5 text-on-brand">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="flex gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand/12 text-brand-strong" aria-hidden="true">
                <SparkIcon size={16} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <span className="visually-hidden">Coach says:</span>
                {m.content ? (
                  <Markdown text={m.content} />
                ) : !m.error ? (
                  <p className="flex items-center gap-2 text-sm text-ink-2">
                    <span className="flex gap-1" aria-hidden="true">
                      <span className="typing-dot size-1.5 rounded-full bg-current" />
                      <span className="typing-dot size-1.5 rounded-full bg-current [animation-delay:0.2s]" />
                      <span className="typing-dot size-1.5 rounded-full bg-current [animation-delay:0.4s]" />
                    </span>
                    {i === messages.length - 1 && loadingNote ? loadingNote : "Thinking…"}
                  </p>
                ) : null}
                {m.error && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <AlertIcon size={16} className="text-critical" />
                    <span>{m.error}</span>
                    {i === messages.length - 1 && lastUser && (
                      <button
                        type="button"
                        className="font-medium underline underline-offset-2"
                        onClick={() => void send(lastUser.content, messages.slice(0, -2))}
                      >
                        Try again
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] -mx-4 mt-5 bg-page px-4 pb-3 pt-2 sm:bottom-0 sm:pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="card flex items-end gap-2 p-2 pl-4">
          <label htmlFor="coach-input" className="visually-hidden">
            Message the coach
          </label>
          <textarea
            id="coach-input"
            rows={1}
            className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 outline-none [field-sizing:content]"
            placeholder="Ask about meals, snacks, your progress…"
            value={input}
            maxLength={2000}
            enterKeyHint="send"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
          />
          {busy ? (
            <button type="button" className="icon-btn shrink-0 bg-surface-2" aria-label="Stop" onClick={() => abortRef.current?.abort()}>
              <StopIcon size={18} />
            </button>
          ) : (
            <button type="submit" className="icon-btn shrink-0 bg-brand-strong text-on-brand hover:bg-brand-strong hover:text-on-brand" aria-label="Send" disabled={!input.trim()}>
              <SendIcon size={18} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-center text-xs text-muted">AI suggestions can be wrong and aren&apos;t medical advice.</p>
      </form>
    </div>
  );
}
