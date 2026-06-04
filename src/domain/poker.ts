export type SeatId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type Street =
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown"
  | "ended";

export type StackKind = "exact" | "estimated";

export type PlayerAction =
  | "fold"
  | "check"
  | "call"
  | "bet"
  | "raise"
  | "allIn";

export type Card = string;

export interface GamePreset {
  id: string;
  name: string;
  room: string;
  stakes: string;
  currency: string;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  straddle: number;
  chipUnit: number;
}

export interface SeatConfig {
  id: SeatId;
  enabled: boolean;
  playerName: string;
  stack: number;
  stackKind: StackKind;
  isHero: boolean;
}

export interface SessionState {
  preset: GamePreset;
  presets: GamePreset[];
  seats: SeatConfig[];
  buttonSeat: SeatId;
  completedHands: RecordedHand[];
  skippedHands: number;
}

export interface HandSnapshot {
  preset: GamePreset;
  seats: SeatConfig[];
  buttonSeat: SeatId;
  startedAt: string;
}

export type HandEvent =
  | {
      id: string;
      type: "forcedBet";
      seat: SeatId;
      label: "ante" | "smallBlind" | "bigBlind" | "straddle";
      amount: number;
    }
  | {
      id: string;
      type: "playerAction";
      seat: SeatId;
      action: PlayerAction;
      toAmount?: number;
    }
  | {
      id: string;
      type: "dealBoard";
      street: "flop" | "turn" | "river";
      cards: Card[];
    }
  | { id: string; type: "revealCards"; seat: SeatId; cards: Card[] }
  | { id: string; type: "awardPot"; winners: SeatId[]; note?: string }
  | {
      id: string;
      type: "stackCorrection";
      seat: SeatId;
      stack: number;
      stackKind: StackKind;
    };

export interface RecordedHand {
  id: string;
  snapshot: HandSnapshot;
  events: HandEvent[];
}

export interface RuntimeSeat {
  id: SeatId;
  enabled: boolean;
  playerName: string;
  stack: number;
  stackKind: StackKind;
  isHero: boolean;
  folded: boolean;
  allIn: boolean;
  streetCommitted: number;
  totalCommitted: number;
  holeCards?: Card[];
}

export interface HandRuntime {
  preset: GamePreset;
  buttonSeat: SeatId;
  street: Street;
  seats: RuntimeSeat[];
  board: Card[];
  pot: number;
  currentBet: number;
  minRaiseTo: number;
  nextSeat: SeatId | null;
  acted: Set<SeatId>;
  events: HandEvent[];
  warnings: string[];
}

export interface LegalActions {
  seat: SeatId | null;
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  canAllIn: boolean;
  callAmount: number;
  minBetTo: number;
  minRaiseTo: number;
  maxTo: number;
}

export interface ExportValidation {
  status: "exportable" | "needsReview";
  issues: string[];
}

const seatIds = [0, 1, 2, 3, 4, 5, 6, 7, 8] as SeatId[];

export const defaultPreset: GamePreset = {
  id: "aria-2-5",
  name: "Default 2/5 NLH",
  room: "Local Room",
  stakes: "2/5",
  currency: "$",
  smallBlind: 2,
  bigBlind: 5,
  ante: 0,
  straddle: 0,
  chipUnit: 1,
};

export function createDefaultSession(): SessionState {
  return {
    preset: defaultPreset,
    presets: [defaultPreset],
    buttonSeat: 0,
    completedHands: [],
    skippedHands: 0,
    seats: seatIds.map((id) => ({
      id,
      enabled: id < 6,
      playerName: id === 0 ? "Hero" : `P${id + 1}`,
      stack: id === 0 ? 750 : 500,
      stackKind: id === 0 ? "exact" : "estimated",
      isHero: id === 0,
    })),
  };
}

export function createHand(
  session: SessionState,
  now = new Date(),
): RecordedHand {
  const snapshot = cloneSnapshot({
    preset: session.preset,
    buttonSeat: session.buttonSeat,
    seats: session.seats,
    startedAt: now.toISOString(),
  });
  return {
    id: `hand-${now.getTime()}`,
    snapshot,
    events: createForcedBets(snapshot),
  };
}

export function nextSeat(
  from: SeatId,
  seats: Pick<SeatConfig, "id" | "enabled" | "stack">[],
): SeatId {
  for (let offset = 1; offset <= 9; offset += 1) {
    const id = ((from + offset) % 9) as SeatId;
    const seat = seats.find((candidate) => candidate.id === id);
    if (seat?.enabled && seat.stack > 0) return id;
  }
  return from;
}

export function advanceButton(session: SessionState): SessionState {
  return {
    ...session,
    buttonSeat: nextSeat(session.buttonSeat, session.seats),
  };
}

export function skipHand(session: SessionState): SessionState {
  return { ...advanceButton(session), skippedHands: session.skippedHands + 1 };
}

export function cloneSnapshot(snapshot: HandSnapshot): HandSnapshot {
  return {
    ...snapshot,
    preset: { ...snapshot.preset },
    seats: snapshot.seats.map((seat) => ({ ...seat })),
  };
}

export function appendEvent(
  hand: RecordedHand,
  event: HandEvent,
): RecordedHand {
  const runtime = applyEvents(hand.snapshot, hand.events);
  const issues = validateEvent(runtime, event);
  if (issues.length > 0) {
    throw new Error(issues.join("; "));
  }
  return { ...hand, events: [...hand.events, event] };
}

export function undoEvent(hand: RecordedHand): RecordedHand {
  if (hand.events.length === 0) return hand;
  return { ...hand, events: hand.events.slice(0, -1) };
}

export function applyEvents(
  snapshot: HandSnapshot,
  events: HandEvent[],
): HandRuntime {
  const runtime = createInitialRuntime(snapshot, events);
  for (const event of events) {
    applyKnownEvent(runtime, event);
  }
  return runtime;
}

export function getLegalActions(runtime: HandRuntime): LegalActions {
  const seat = runtime.nextSeat;
  if (
    seat === null ||
    runtime.street === "ended" ||
    runtime.street === "showdown"
  ) {
    return emptyLegalActions(seat);
  }
  const player = runtime.seats[seat];
  const callAmount = Math.max(0, runtime.currentBet - player.streetCommitted);
  const maxTo = player.streetCommitted + player.stack;
  return {
    seat,
    canFold: true,
    canCheck: callAmount === 0,
    canCall: callAmount > 0 && player.stack > 0,
    canBet: runtime.currentBet === 0 && player.stack > 0,
    canRaise: runtime.currentBet > 0 && maxTo > runtime.currentBet,
    canAllIn: player.stack > 0,
    callAmount: Math.min(callAmount, player.stack),
    minBetTo: Math.min(snapshotBigBlind(runtime), maxTo),
    minRaiseTo: Math.min(runtime.minRaiseTo, maxTo),
    maxTo,
  };
}

export function validateExport(hand: RecordedHand): ExportValidation {
  const runtime = applyEvents(hand.snapshot, hand.events);
  const issues: string[] = [];
  const activePlayers = runtime.seats.filter(
    (seat) => seat.enabled && seat.stack + seat.totalCommitted > 0,
  );
  if (activePlayers.length < 2)
    issues.push("At least two active seats are required.");
  if (runtime.board.length < 5 && runtime.street !== "ended")
    issues.push("Board is incomplete or hand has not ended.");
  if (!hand.events.some((event) => event.type === "awardPot"))
    issues.push("Winner has not been selected.");
  if (
    runtime.seats.some((seat) => seat.enabled && seat.stackKind === "estimated")
  ) {
    issues.push("One or more villain stacks are still estimated.");
  }
  const unknownShowdown = hand.events.filter(
    (event) =>
      event.type === "revealCards" &&
      event.cards.some((card) => card === "unknown"),
  );
  if (unknownShowdown.length > 0)
    issues.push("Observed showdown cards include unknown values.");
  return { status: issues.length === 0 ? "exportable" : "needsReview", issues };
}

export function exportHand(hand: RecordedHand): string {
  const runtime = applyEvents(hand.snapshot, hand.events);
  const validation = validateExport(hand);
  const lines = [
    `Room: ${hand.snapshot.preset.room}`,
    `Stakes: ${hand.snapshot.preset.currency}${hand.snapshot.preset.smallBlind}/${hand.snapshot.preset.currency}${hand.snapshot.preset.bigBlind}`,
    `Button: Seat ${hand.snapshot.buttonSeat + 1}`,
    `Status: ${validation.status}`,
    "",
    "Seats:",
    ...hand.snapshot.seats
      .filter((seat) => seat.enabled)
      .map(
        (seat) =>
          `Seat ${seat.id + 1}: ${seat.playerName} ${hand.snapshot.preset.currency}${seat.stack} (${seat.stackKind}${seat.isHero ? ", hero" : ""})`,
      ),
    "",
    `Board: ${runtime.board.length > 0 ? runtime.board.join(" ") : "unknown"}`,
    `Pot: ${hand.snapshot.preset.currency}${runtime.pot}`,
    "",
    "Actions:",
    ...hand.events.map((event) =>
      describeEvent(event, hand.snapshot.preset.currency),
    ),
  ];
  if (validation.issues.length > 0) {
    lines.push(
      "",
      "Needs review:",
      ...validation.issues.map((issue) => `- ${issue}`),
    );
  }
  return lines.join("\n");
}

export function completeHand(
  session: SessionState,
  hand: RecordedHand,
): SessionState {
  const runtime = applyEvents(hand.snapshot, hand.events);
  const seats = session.seats.map((seat) => {
    const runtimeSeat = runtime.seats[seat.id];
    return {
      ...seat,
      stack: runtimeSeat.stack,
      stackKind: runtimeSeat.stackKind,
    };
  });
  return {
    ...advanceButton({ ...session, seats }),
    completedHands: [...session.completedHands, hand],
  };
}

function createInitialRuntime(
  snapshot: HandSnapshot,
  events: HandEvent[],
): HandRuntime {
  return {
    street: "preflop",
    seats: snapshot.seats.map((seat) => ({
      ...seat,
      folded: !seat.enabled,
      allIn: false,
      streetCommitted: 0,
      totalCommitted: 0,
    })),
    board: [],
    pot: 0,
    currentBet: 0,
    minRaiseTo: snapshot.preset.bigBlind * 2,
    nextSeat: openingSeat(snapshot),
    acted: new Set(),
    events,
    warnings: [],
    preset: snapshot.preset,
    buttonSeat: snapshot.buttonSeat,
  };
}

function createForcedBets(snapshot: HandSnapshot): HandEvent[] {
  const events: HandEvent[] = [];
  const active = snapshot.seats.filter(
    (seat) => seat.enabled && seat.stack > 0,
  );
  for (const seat of active) {
    if (snapshot.preset.ante > 0) {
      events.push(forcedBet(seat.id, "ante", snapshot.preset.ante));
    }
  }
  const smallBlindSeat = nextSeat(snapshot.buttonSeat, snapshot.seats);
  const bigBlindSeat = nextSeat(smallBlindSeat, snapshot.seats);
  events.push(
    forcedBet(smallBlindSeat, "smallBlind", snapshot.preset.smallBlind),
  );
  events.push(forcedBet(bigBlindSeat, "bigBlind", snapshot.preset.bigBlind));
  if (snapshot.preset.straddle > 0) {
    events.push(
      forcedBet(
        nextSeat(bigBlindSeat, snapshot.seats),
        "straddle",
        snapshot.preset.straddle,
      ),
    );
  }
  return events;
}

function forcedBet(
  seat: SeatId,
  label: "ante" | "smallBlind" | "bigBlind" | "straddle",
  amount: number,
): HandEvent {
  return {
    id: `${label}-${seat}-${amount}`,
    type: "forcedBet",
    seat,
    label,
    amount,
  };
}

function openingSeat(snapshot: HandSnapshot): SeatId {
  const smallBlindSeat = nextSeat(snapshot.buttonSeat, snapshot.seats);
  const bigBlindSeat = nextSeat(smallBlindSeat, snapshot.seats);
  const lastBlind =
    snapshot.preset.straddle > 0
      ? nextSeat(bigBlindSeat, snapshot.seats)
      : bigBlindSeat;
  return nextSeat(lastBlind, snapshot.seats);
}

function applyKnownEvent(runtime: HandRuntime, event: HandEvent): void {
  switch (event.type) {
    case "forcedBet":
      commit(runtime, event.seat, event.amount, false);
      runtime.currentBet = Math.max(
        runtime.currentBet,
        runtime.seats[event.seat].streetCommitted,
      );
      runtime.minRaiseTo = Math.max(
        runtime.minRaiseTo,
        runtime.currentBet + snapshotBigBlind(runtime),
      );
      break;
    case "playerAction":
      applyPlayerAction(runtime, event);
      progressAfterAction(runtime);
      break;
    case "dealBoard":
      runtime.board.push(...event.cards);
      runtime.street =
        event.street === "flop"
          ? "flop"
          : event.street === "turn"
            ? "turn"
            : "river";
      break;
    case "revealCards":
      runtime.seats[event.seat].holeCards = event.cards;
      break;
    case "awardPot":
      awardPot(runtime, event.winners);
      runtime.street = "ended";
      runtime.nextSeat = null;
      break;
    case "stackCorrection":
      runtime.seats[event.seat].stack = event.stack;
      runtime.seats[event.seat].stackKind = event.stackKind;
      break;
  }
}

function applyPlayerAction(
  runtime: HandRuntime,
  event: Extract<HandEvent, { type: "playerAction" }>,
): void {
  const seat = runtime.seats[event.seat];
  switch (event.action) {
    case "fold":
      seat.folded = true;
      runtime.acted.add(event.seat);
      break;
    case "check":
      runtime.acted.add(event.seat);
      break;
    case "call":
      commit(runtime, event.seat, runtime.currentBet);
      runtime.acted.add(event.seat);
      break;
    case "bet":
    case "raise":
      if (event.toAmount === undefined)
        throw new Error("Bet or raise requires a to amount.");
      {
        const priorBet = runtime.currentBet;
        const raiseSize = event.toAmount - priorBet;
        commit(runtime, event.seat, event.toAmount);
        runtime.currentBet = event.toAmount;
        runtime.minRaiseTo =
          event.toAmount + Math.max(snapshotBigBlind(runtime), raiseSize);
      }
      runtime.acted = new Set([event.seat]);
      break;
    case "allIn": {
      const toAmount = event.toAmount ?? seat.streetCommitted + seat.stack;
      commit(runtime, event.seat, toAmount, true);
      if (toAmount > runtime.currentBet) {
        const raiseSize = toAmount - runtime.currentBet;
        runtime.currentBet = toAmount;
        if (raiseSize >= snapshotBigBlind(runtime))
          runtime.minRaiseTo = toAmount + raiseSize;
        runtime.acted = new Set([event.seat]);
      } else {
        runtime.acted.add(event.seat);
      }
      break;
    }
  }
}

function commit(
  runtime: HandRuntime,
  seatId: SeatId,
  targetStreetAmount: number,
  forceAllIn = false,
): void {
  const seat = runtime.seats[seatId];
  const delta = Math.max(0, targetStreetAmount - seat.streetCommitted);
  const paid = Math.min(delta, seat.stack);
  seat.streetCommitted += paid;
  seat.totalCommitted += paid;
  seat.stack -= paid;
  runtime.pot += paid;
  if (forceAllIn || seat.stack === 0) seat.allIn = true;
}

function progressAfterAction(runtime: HandRuntime): void {
  const live = runtime.seats.filter((seat) => seat.enabled && !seat.folded);
  if (live.length <= 1) {
    runtime.street = "ended";
    runtime.nextSeat = null;
    return;
  }
  if (isRoundComplete(runtime)) {
    if (runtime.street === "river") {
      runtime.street = "showdown";
      runtime.nextSeat = null;
      return;
    }
    advanceStreet(runtime);
    return;
  }
  runtime.nextSeat = nextActionSeat(runtime, runtime.nextSeat);
}

function isRoundComplete(runtime: HandRuntime): boolean {
  const actors = runtime.seats.filter(
    (seat) => seat.enabled && !seat.folded && !seat.allIn,
  );
  if (actors.length === 0) return true;
  return actors.every(
    (seat) =>
      runtime.acted.has(seat.id) && seat.streetCommitted === runtime.currentBet,
  );
}

function advanceStreet(runtime: HandRuntime): void {
  runtime.street =
    runtime.street === "preflop"
      ? "flop"
      : runtime.street === "flop"
        ? "turn"
        : "river";
  runtime.currentBet = 0;
  runtime.minRaiseTo = snapshotBigBlind(runtime);
  runtime.acted = new Set();
  runtime.seats.forEach((seat) => {
    seat.streetCommitted = 0;
  });
  runtime.nextSeat = firstPostflopSeat(runtime);
}

function nextActionSeat(
  runtime: HandRuntime,
  from: SeatId | null,
): SeatId | null {
  if (from === null) return null;
  for (let offset = 1; offset <= 9; offset += 1) {
    const seat = runtime.seats[((from + offset) % 9) as SeatId];
    if (seat.enabled && !seat.folded && !seat.allIn) return seat.id;
  }
  return null;
}

function firstPostflopSeat(runtime: HandRuntime): SeatId | null {
  for (let offset = 1; offset <= 9; offset += 1) {
    const seat = runtime.seats[((runtime.buttonSeat + offset) % 9) as SeatId];
    if (seat.enabled && !seat.folded && !seat.allIn) return seat.id;
  }
  return null;
}

function awardPot(runtime: HandRuntime, winners: SeatId[]): void {
  const share = Math.floor(runtime.pot / Math.max(1, winners.length));
  winners.forEach((winner) => {
    runtime.seats[winner].stack += share;
  });
}

function validateEvent(runtime: HandRuntime, event: HandEvent): string[] {
  if (event.type !== "playerAction") return [];
  const legal = getLegalActions(runtime);
  if (runtime.nextSeat !== event.seat)
    return [`Seat ${event.seat + 1} is not next to act.`];
  if (event.action === "check" && !legal.canCheck)
    return ["Check is not legal while facing a bet."];
  if (event.action === "call" && !legal.canCall)
    return ["Call is not legal without a bet to call."];
  if (
    event.action === "bet" &&
    (!legal.canBet || (event.toAmount ?? 0) < legal.minBetTo)
  ) {
    return [`Bet must be at least ${legal.minBetTo}.`];
  }
  if (
    event.action === "raise" &&
    (!legal.canRaise || (event.toAmount ?? 0) < legal.minRaiseTo)
  ) {
    return [`Raise must be at least to ${legal.minRaiseTo}.`];
  }
  if (event.toAmount !== undefined && event.toAmount > legal.maxTo)
    return ["Action amount exceeds available stack."];
  return [];
}

function emptyLegalActions(seat: SeatId | null): LegalActions {
  return {
    seat,
    canFold: false,
    canCheck: false,
    canCall: false,
    canBet: false,
    canRaise: false,
    canAllIn: false,
    callAmount: 0,
    minBetTo: 0,
    minRaiseTo: 0,
    maxTo: 0,
  };
}

function snapshotBigBlind(runtime: HandRuntime): number {
  return runtime.preset.bigBlind;
}

function describeEvent(event: HandEvent, currency: string): string {
  switch (event.type) {
    case "forcedBet":
      return `Seat ${event.seat + 1} posts ${event.label} ${currency}${event.amount}`;
    case "playerAction":
      return `Seat ${event.seat + 1} ${event.action}${event.toAmount ? ` to ${currency}${event.toAmount}` : ""}`;
    case "dealBoard":
      return `${event.street}: ${event.cards.join(" ")}`;
    case "revealCards":
      return `Seat ${event.seat + 1} shows ${event.cards.join(" ")}`;
    case "awardPot":
      return `Award pot to ${event.winners.map((seat) => `Seat ${seat + 1}`).join(", ")}`;
    case "stackCorrection":
      return `Seat ${event.seat + 1} stack correction ${currency}${event.stack} (${event.stackKind})`;
  }
}
