import React, { useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  AlertTriangle,
  BadgeDollarSign,
  CircleDot,
  Download,
  RotateCcw,
  Save,
  SkipForward,
  Trash2,
  Undo2,
  Users,
} from "lucide-react";
import "./styles.css";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  appendEvent,
  applyEvents,
  completeHand,
  createDefaultSession,
  createHand,
  exportHand,
  getLegalActions,
  skipHand,
  undoEvent,
  validateExport,
  type Card,
  type HandEvent,
  type RecordedHand,
  type SeatConfig,
  type SeatId,
  type SessionState,
  type StackKind,
} from "./domain/poker";
import { cn } from "./lib/utils";

const storageKey = "live-poker-recorder-v1";
const seatPositions = [
  "left-[50%] top-[3%] -translate-x-1/2",
  "right-[5%] top-[12%]",
  "right-[1%] top-[34%]",
  "right-[8%] bottom-[13%]",
  "left-[50%] bottom-[3%] -translate-x-1/2",
  "left-[8%] bottom-[13%]",
  "left-[1%] top-[34%]",
  "left-[5%] top-[12%]",
  "left-[50%] top-[25%] -translate-x-1/2",
];

function loadSession(): SessionState {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return createDefaultSession();
  try {
    const session = JSON.parse(raw) as SessionState;
    return {
      ...session,
      presets: session.presets?.length ? session.presets : [session.preset],
    };
  } catch {
    return createDefaultSession();
  }
}

function persist(session: SessionState) {
  localStorage.setItem(storageKey, JSON.stringify(session));
}

function eventId(type: string) {
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseCards(value: string): Card[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function App() {
  const [session, setSessionState] = useState<SessionState>(() =>
    loadSession(),
  );
  const [hand, setHand] = useState<RecordedHand | null>(null);
  const [amount, setAmount] = useState("");
  const [boardInput, setBoardInput] = useState("");
  const [showCards, setShowCards] = useState("");
  const [exportText, setExportText] = useState("");
  const [error, setError] = useState("");

  const runtime = useMemo(
    () => (hand ? applyEvents(hand.snapshot, hand.events) : null),
    [hand],
  );
  const legal = useMemo(
    () => (runtime ? getLegalActions(runtime) : null),
    [runtime],
  );
  const validation = useMemo(
    () => (hand ? validateExport(hand) : null),
    [hand],
  );

  function setSession(next: SessionState) {
    setSessionState(next);
    persist(next);
  }

  function safeAppend(event: HandEvent) {
    if (!hand) return;
    try {
      setHand(appendEvent(hand, event));
      setError("");
      setAmount("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invalid action");
    }
  }

  function updateSeat(id: SeatId, patch: Partial<SeatConfig>) {
    setSession({
      ...session,
      seats: session.seats.map((seat) =>
        seat.id === id ? { ...seat, ...patch } : seat,
      ),
    });
  }

  function updatePreset(patch: Partial<SessionState["preset"]>) {
    setSession({ ...session, preset: { ...session.preset, ...patch } });
  }

  function savePreset() {
    const preset = {
      ...session.preset,
      id: `${session.preset.room}-${session.preset.stakes}`
        .toLowerCase()
        .replace(/\s+/g, "-"),
    };
    setSession({
      ...session,
      preset,
      presets: [
        ...session.presets.filter((candidate) => candidate.id !== preset.id),
        preset,
      ],
    });
  }

  function newPreset() {
    const preset = {
      ...session.preset,
      id: `preset-${Date.now()}`,
      name: "New preset",
      room: "New Room",
      stakes: "1/2",
    };
    setSession({ ...session, preset, presets: [...session.presets, preset] });
  }

  function selectPreset(id: string) {
    const preset = session.presets.find((candidate) => candidate.id === id);
    if (preset) setSession({ ...session, preset });
  }

  function startHand() {
    setHand(createHand(session));
    setExportText("");
    setError("");
  }

  function finishHand() {
    if (!hand) return;
    const next = completeHand(session, hand);
    setSession(next);
    setExportText(exportHand(hand));
    setHand(null);
  }

  function action(action: "fold" | "check" | "call") {
    if (!legal || legal.seat === null) return;
    safeAppend({
      id: eventId(action),
      type: "playerAction",
      seat: legal.seat,
      action,
    });
  }

  function amountAction(actionName: "bet" | "raise" | "allIn") {
    if (!legal || legal.seat === null) return;
    const toAmount =
      actionName === "allIn" && amount === "" ? legal.maxTo : Number(amount);
    safeAppend({
      id: eventId(actionName),
      type: "playerAction",
      seat: legal.seat,
      action: actionName,
      toAmount,
    });
  }

  function dealBoard() {
    if (!runtime) return;
    const cards = parseCards(boardInput);
    const street =
      runtime.street === "flop"
        ? "flop"
        : runtime.street === "turn"
          ? "turn"
          : "river";
    safeAppend({ id: eventId("board"), type: "dealBoard", street, cards });
    setBoardInput("");
  }

  function reveal(seat: SeatId) {
    safeAppend({
      id: eventId("reveal"),
      type: "revealCards",
      seat,
      cards: parseCards(showCards),
    });
    setShowCards("");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-[480px] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Live Poker Recorder</h1>
            <p className="text-xs text-muted-foreground">
              {session.preset.room} {session.preset.stakes} · Button{" "}
              {session.buttonSeat + 1}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-9 w-9 px-0"
              title="Save session"
              onClick={() => persist(session)}
            >
              <Save className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-9 w-9 px-0"
              title="Reset local data"
              onClick={() => setSession(createDefaultSession())}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <section className="px-4 py-3">
        <PokerTable session={session} runtime={runtime} />
      </section>

      {hand ? (
        <section className="space-y-3 px-4 pb-5">
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" onClick={() => setHand(undoEvent(hand))}>
              <Undo2 className="h-4 w-4" />
              Undo
            </Button>
            <Button variant="destructive" onClick={() => setHand(null)}>
              <Trash2 className="h-4 w-4" />
              Discard
            </Button>
            <Button onClick={finishHand}>
              <Download className="h-4 w-4" />
              Export
            </Button>
          </div>

          <StatusPanel runtime={runtime} validation={validation} />

          {legal && legal.seat !== null && (
            <div className="space-y-2 rounded-md border bg-card p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">
                  Seat {legal.seat + 1} to act
                </div>
                <div className="text-xs text-muted-foreground">
                  Call {session.preset.currency}
                  {legal.callAmount} · Min raise to {session.preset.currency}
                  {legal.minRaiseTo}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant="outline"
                  disabled={!legal.canFold}
                  onClick={() => action("fold")}
                >
                  Fold
                </Button>
                <Button
                  variant="outline"
                  disabled={!legal.canCheck}
                  onClick={() => action("check")}
                >
                  Check
                </Button>
                <Button
                  variant="outline"
                  disabled={!legal.canCall}
                  onClick={() => action("call")}
                >
                  Call
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  placeholder={`to ${legal.canBet ? legal.minBetTo : legal.minRaiseTo}`}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
                <Button
                  disabled={!legal.canBet}
                  onClick={() => amountAction("bet")}
                >
                  Bet
                </Button>
                <Button
                  disabled={!legal.canRaise}
                  onClick={() => amountAction("raise")}
                >
                  Raise
                </Button>
                <Button
                  variant="secondary"
                  disabled={!legal.canAllIn}
                  onClick={() => amountAction("allIn")}
                >
                  All-in
                </Button>
              </div>
            </div>
          )}

          <BoardPanel
            runtime={runtime}
            boardInput={boardInput}
            setBoardInput={setBoardInput}
            dealBoard={dealBoard}
          />

          <div className="rounded-md border bg-card p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" />
              Showdown / Winner
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Ah Kh or unknown unknown"
                value={showCards}
                onChange={(event) => setShowCards(event.target.value)}
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {session.seats
                .filter((seat) => seat.enabled)
                .map((seat) => (
                  <Button
                    key={seat.id}
                    variant="outline"
                    onClick={() => reveal(seat.id)}
                  >
                    Show {seat.id + 1}
                  </Button>
                ))}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {session.seats
                .filter((seat) => seat.enabled)
                .map((seat) => (
                  <Button
                    key={seat.id}
                    variant="secondary"
                    onClick={() =>
                      safeAppend({
                        id: eventId("award"),
                        type: "awardPot",
                        winners: [seat.id],
                      })
                    }
                  >
                    Win {seat.id + 1}
                  </Button>
                ))}
            </div>
          </div>

          <EventLog hand={hand} />
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3 px-4 pb-5">
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={startHand}>
              <CircleDot className="h-4 w-4" />
              Record hand
            </Button>
            <Button
              variant="outline"
              onClick={() => setSession(skipHand(session))}
            >
              <SkipForward className="h-4 w-4" />
              Skip hand
            </Button>
          </div>
          <PresetPanel
            session={session}
            updatePreset={updatePreset}
            savePreset={savePreset}
            newPreset={newPreset}
            selectPreset={selectPreset}
          />
          <SeatPanel session={session} updateSeat={updateSeat} />
          {exportText && <ExportPanel text={exportText} />}
        </section>
      )}
    </main>
  );
}

function PokerTable({
  session,
  runtime,
}: {
  session: SessionState;
  runtime: ReturnType<typeof applyEvents> | null;
}) {
  return (
    <div className="relative h-[420px] rounded-md border bg-[radial-gradient(ellipse_at_center,_#1f7a54_0%,_#176244_48%,_#0f3f31_100%)] shadow-inner">
      <div className="absolute left-1/2 top-1/2 flex h-[156px] w-[250px] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-[50%] border border-white/20 bg-black/15 text-white">
        <div className="text-xs uppercase tracking-wide text-white/70">
          {runtime?.street ?? "between hands"}
        </div>
        <div className="text-2xl font-semibold">
          {session.preset.currency}
          {runtime?.pot ?? 0}
        </div>
        <div className="mt-2 flex min-h-8 gap-1">
          {(runtime?.board ?? []).map((card, index) => (
            <span
              key={`${card}-${index}`}
              className="rounded bg-white px-1.5 py-1 text-xs font-semibold text-slate-950"
            >
              {card}
            </span>
          ))}
        </div>
      </div>
      {session.seats.map((seat) => {
        const runtimeSeat = runtime?.seats[seat.id];
        const isButton = session.buttonSeat === seat.id;
        const isNext = runtime?.nextSeat === seat.id;
        return (
          <div
            key={seat.id}
            className={cn(
              "absolute w-[96px] rounded-md border bg-card/95 p-2 text-xs shadow",
              seatPositions[seat.id],
              !seat.enabled && "opacity-40",
              isNext && "ring-2 ring-primary",
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate font-semibold">
                {seat.playerName || `Seat ${seat.id + 1}`}
              </span>
              {isButton && (
                <span className="rounded-full bg-white px-1.5 text-[10px] font-bold text-slate-950">
                  D
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-1 text-muted-foreground">
              <BadgeDollarSign className="h-3 w-3" />
              {session.preset.currency}
              {runtimeSeat?.stack ?? seat.stack}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>{seat.stackKind}</span>
              <span>
                {runtimeSeat?.folded
                  ? "folded"
                  : runtimeSeat?.allIn
                    ? "all-in"
                    : runtimeSeat?.streetCommitted
                      ? `in ${runtimeSeat.streetCommitted}`
                      : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StatusPanel({
  runtime,
  validation,
}: {
  runtime: ReturnType<typeof applyEvents> | null;
  validation: ReturnType<typeof validateExport> | null;
}) {
  if (!runtime || !validation) return null;
  return (
    <div className="rounded-md border bg-card p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold">Hand status</span>
        <span
          className={cn(
            "rounded px-2 py-1 text-xs",
            validation.status === "exportable"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-900",
          )}
        >
          {validation.status === "exportable" ? "Exportable" : "Needs review"}
        </span>
      </div>
      {validation.issues.length > 0 && (
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {validation.issues.map((issue) => (
            <div key={issue} className="flex gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {issue}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardPanel({
  runtime,
  boardInput,
  setBoardInput,
  dealBoard,
}: {
  runtime: ReturnType<typeof applyEvents> | null;
  boardInput: string;
  setBoardInput: (value: string) => void;
  dealBoard: () => void;
}) {
  if (
    !runtime ||
    runtime.street === "preflop" ||
    runtime.street === "showdown" ||
    runtime.street === "ended"
  )
    return null;
  const placeholder = runtime.street === "flop" ? "As 7d 2c" : "Jh";
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">Board cards</div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={boardInput}
          onChange={(event) => setBoardInput(event.target.value)}
        />
        <Button onClick={dealBoard}>Deal</Button>
      </div>
    </div>
  );
}

function PresetPanel({
  session,
  updatePreset,
  savePreset,
  newPreset,
  selectPreset,
}: {
  session: SessionState;
  updatePreset: (patch: Partial<SessionState["preset"]>) => void;
  savePreset: () => void;
  newPreset: () => void;
  selectPreset: (id: string) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">Game preset</div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-8" onClick={newPreset}>
            New
          </Button>
          <Button variant="secondary" className="h-8" onClick={savePreset}>
            Save
          </Button>
        </div>
      </div>
      <select
        className="mb-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={session.preset.id}
        onChange={(event) => selectPreset(event.target.value)}
      >
        {session.presets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.room} {preset.stakes}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={session.preset.name}
          onChange={(event) => updatePreset({ name: event.target.value })}
        />
        <Input
          value={session.preset.room}
          onChange={(event) => updatePreset({ room: event.target.value })}
        />
        <Input
          value={session.preset.stakes}
          onChange={(event) => updatePreset({ stakes: event.target.value })}
        />
        <Input
          inputMode="numeric"
          value={session.preset.smallBlind}
          onChange={(event) =>
            updatePreset({ smallBlind: Number(event.target.value) })
          }
        />
        <Input
          inputMode="numeric"
          value={session.preset.bigBlind}
          onChange={(event) =>
            updatePreset({ bigBlind: Number(event.target.value) })
          }
        />
        <Input
          inputMode="numeric"
          value={session.preset.ante}
          onChange={(event) =>
            updatePreset({ ante: Number(event.target.value) })
          }
        />
        <Input
          inputMode="numeric"
          value={session.preset.straddle}
          onChange={(event) =>
            updatePreset({ straddle: Number(event.target.value) })
          }
        />
        <Input
          inputMode="numeric"
          value={session.preset.chipUnit}
          onChange={(event) =>
            updatePreset({ chipUnit: Number(event.target.value) })
          }
        />
        <Input
          value={session.preset.currency}
          onChange={(event) => updatePreset({ currency: event.target.value })}
        />
      </div>
    </div>
  );
}

function SeatPanel({
  session,
  updateSeat,
}: {
  session: SessionState;
  updateSeat: (id: SeatId, patch: Partial<SeatConfig>) => void;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">Table state</div>
      <div className="space-y-2">
        {session.seats.map((seat) => (
          <div
            key={seat.id}
            className="grid grid-cols-[42px_1fr_72px_82px] gap-2"
          >
            <Button
              variant={seat.enabled ? "secondary" : "outline"}
              className="h-10 px-0"
              onClick={() => updateSeat(seat.id, { enabled: !seat.enabled })}
            >
              {seat.id + 1}
            </Button>
            <Input
              value={seat.playerName}
              onChange={(event) =>
                updateSeat(seat.id, { playerName: event.target.value })
              }
            />
            <Input
              inputMode="numeric"
              value={seat.stack}
              onChange={(event) =>
                updateSeat(seat.id, { stack: Number(event.target.value) })
              }
            />
            <Button
              variant="outline"
              onClick={() =>
                updateSeat(seat.id, {
                  stackKind: (seat.stackKind === "exact"
                    ? "estimated"
                    : "exact") as StackKind,
                })
              }
            >
              {seat.stackKind}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventLog({ hand }: { hand: RecordedHand }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">Event log</div>
      <div className="max-h-44 space-y-1 overflow-auto text-xs text-muted-foreground">
        {hand.events.map((event) => (
          <div key={event.id}>{JSON.stringify(event)}</div>
        ))}
      </div>
    </div>
  );
}

function ExportPanel({ text }: { text: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-2 text-sm font-semibold">Last hand export</div>
      <textarea
        className="min-h-60 w-full rounded-md border bg-background p-2 font-mono text-xs"
        readOnly
        value={text}
      />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
