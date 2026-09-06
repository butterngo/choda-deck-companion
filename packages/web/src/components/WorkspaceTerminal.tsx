// TASK-1879 — the terminal you can actually type in.
//
// The socket is proven by TASK-1877 and the shell by TASK-1878, so anything
// wrong here is this file.
//
// Every keystroke goes down as its own `in` frame. That is the whole reason a
// PTY was chosen over a command runner: a line-buffered box cannot run a pager,
// an editor, or anything that reads a single key.
//
// The fit addon measures the pane and those numbers go back as a `size` frame.
// A terminal that renders but never reports its size is one where every
// full-screen program draws wrapped — which is why AC-2 asserts the NUMBERS in
// the frame, not that a frame was sent.

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

/** Where the socket lives, behind the same /api prefix everything else uses. */
export const TERMINAL_URL = (): string => {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/terminal`;
};

type Phase = "connecting" | "ready" | "exited" | "failed";

export interface WorkspaceTerminalProps {
  cwd: string;
  label: string;
  /** Injected by tests. Production uses the global. */
  socketFactory?: (url: string) => WebSocket;
}

export function WorkspaceTerminal({
  cwd,
  label,
  socketFactory,
}: WorkspaceTerminalProps): React.JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const ws = useRef<WebSocket | null>(null);
  // Keystrokes typed before the socket is open. Held, not dropped: the first
  // characters vanishing reads as a broken keyboard, not as a slow connection.
  const pending = useRef<string[]>([]);
  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>("connecting");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    const t = new Terminal({
      fontSize: 12,
      fontFamily:
        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      cursorBlink: true,
      convertEol: false,
      theme: { background: "#18181b", foreground: "#e4e4e7", cursor: "#a1a1aa" },
    });
    const f = new FitAddon();
    t.loadAddon(f);
    t.open(el);
    f.fit();
    term.current = t;
    fit.current = f;

    const url = TERMINAL_URL();
    const socket = socketFactory ? socketFactory(url) : new WebSocket(url);
    ws.current = socket;
    started.current = false;

    const send = (frame: Record<string, unknown>): void => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
    };

    socket.onopen = () => {
      // The measured size, never a fixed 80x24 — the terminal must not lie
      // about how wide it is.
      const dims = f.proposeDimensions();
      send({
        t: "start",
        cwd,
        cols: dims?.cols ?? t.cols,
        rows: dims?.rows ?? t.rows,
      });
      started.current = true;
      // Whatever was typed while connecting, in order, now that there is
      // somewhere for it to go.
      for (const d of pending.current.splice(0)) send({ t: "in", d });
    };

    socket.onmessage = (ev: MessageEvent) => {
      let frame: { t?: string; d?: string; code?: number; error?: string };
      try {
        frame = JSON.parse(String(ev.data)) as typeof frame;
      } catch {
        return;
      }
      if (frame.t === "out") t.write(String(frame.d ?? ""));
      else if (frame.t === "ready") setPhase("ready");
      else if (frame.t === "exit") {
        setExitCode(frame.code ?? 0);
        setPhase("exited");
      } else if (frame.t === "error") {
        t.write(`\r\n\x1b[31m${String(frame.error)}\x1b[0m\r\n`);
        setPhase("failed");
      }
    };

    // A dead socket and a shell that has printed nothing look identical inside
    // a black rectangle, so the failure is stated outside the terminal.
    socket.onerror = () => setPhase((p) => (p === "exited" ? p : "failed"));
    socket.onclose = () => setPhase((p) => (p === "exited" ? p : "failed"));

    const onData = t.onData((d: string) => {
      // One frame per keystroke. Buffering by line is what breaks every
      // interactive program.
      if (started.current && socket.readyState === WebSocket.OPEN) send({ t: "in", d });
      else pending.current.push(d);
    });

    const onResize = (): void => {
      f.fit();
      const dims = f.proposeDimensions();
      if (dims) send({ t: "size", cols: dims.cols, rows: dims.rows });
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      onData.dispose();
      // Closed on the way out. A socket that outlives the view leaves a shell
      // process behind — TASK-1878 AC-3 kills the PTY when the socket closes,
      // and this is the half that makes that fire.
      socket.close();
      t.dispose();
      term.current = null;
      ws.current = null;
    };
  }, [cwd, socketFactory, attempt]);

  // Typing into a dead shell must not look like typing into a live one.
  useEffect(() => {
    if (term.current) term.current.options.disableStdin = phase === "exited" || phase === "failed";
  }, [phase]);

  return (
    <section data-testid="workspace-terminal" className="mt-2 flex min-h-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Terminal
        </span>
        <code className="font-mono text-[11.5px] text-zinc-500">{label}</code>
        {phase === "connecting" && (
          <span data-testid="term-connecting" className="text-[11px] text-zinc-500">
            Connecting…
          </span>
        )}
        {phase === "exited" && (
          <span data-testid="term-exited" className="text-[11px] text-zinc-500">
            The shell exited (code {exitCode}).
          </span>
        )}
        {(phase === "exited" || phase === "failed") && (
          <button
            type="button"
            data-testid="term-restart"
            onClick={() => {
              setExitCode(null);
              setPhase("connecting");
              setAttempt((a) => a + 1);
            }}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-300"
          >
            Start again
          </button>
        )}
      </div>

      {phase === "failed" && (
        // Said in words, outside the terminal. An empty black rectangle is not
        // an error message.
        <p data-testid="term-failed" className="text-[11.5px] text-zinc-500">
          Could not reach the shell. The adapter may not be running.
        </p>
      )}

      <div
        ref={host}
        data-testid="term-host"
        className="min-h-[18rem] overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800"
      />
    </section>
  );
}
