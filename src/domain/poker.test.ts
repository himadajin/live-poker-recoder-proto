import { describe, expect, it } from "vitest";
import {
  appendEvent,
  applyEvents,
  createDefaultSession,
  createHand,
  exportHand,
  getLegalActions,
  undoEvent,
  validateExport,
  type HandEvent,
  type RecordedHand,
  type SeatId,
} from "./poker";

function event(type: string, extra: object): HandEvent {
  return { id: `${type}-${Math.random()}`, ...extra } as HandEvent;
}

function act(
  hand: RecordedHand,
  seat: SeatId,
  action: "fold" | "check" | "call" | "bet" | "raise" | "allIn",
  toAmount?: number,
) {
  return appendEvent(
    hand,
    event(action, { type: "playerAction", seat, action, toAmount }),
  );
}

describe("NLH hand recorder domain", () => {
  it("starts a hand from the session snapshot and exposes only legal preflop actions", () => {
    const session = createDefaultSession();
    const hand = createHand(session, new Date("2026-06-04T00:00:00.000Z"));
    const runtime = applyEvents(hand.snapshot, hand.events);
    const legal = getLegalActions(runtime);

    expect(hand.snapshot.seats[0].stack).toBe(750);
    expect(runtime.pot).toBe(7);
    expect(legal.seat).toBe(3);
    expect(legal.canCall).toBe(true);
    expect(legal.canCheck).toBe(false);
    expect(legal.minRaiseTo).toBe(10);
  });

  it("records raises as street total 'to X' amounts and advances streets", () => {
    let hand = createHand(
      createDefaultSession(),
      new Date("2026-06-04T00:00:00.000Z"),
    );
    hand = act(hand, 3, "raise", 20);
    hand = act(hand, 4, "fold");
    hand = act(hand, 5, "fold");
    hand = act(hand, 0, "fold");
    hand = act(hand, 1, "call");
    hand = act(hand, 2, "call");

    const runtime = applyEvents(hand.snapshot, hand.events);
    expect(runtime.street).toBe("flop");
    expect(runtime.pot).toBe(60);
    expect(runtime.seats[3].totalCommitted).toBe(20);
    expect(runtime.currentBet).toBe(0);
    expect(runtime.nextSeat).toBe(1);
  });

  it("records all-in as a fact distinct from ordinary numeric betting", () => {
    let session = createDefaultSession();
    session = {
      ...session,
      seats: session.seats.map((seat) =>
        seat.id === 3 ? { ...seat, stack: 18, stackKind: "estimated" } : seat,
      ),
    };
    let hand = createHand(session, new Date("2026-06-04T00:00:00.000Z"));
    hand = act(hand, 3, "allIn");

    const runtime = applyEvents(hand.snapshot, hand.events);
    expect(runtime.seats[3].allIn).toBe(true);
    expect(runtime.seats[3].totalCommitted).toBe(18);
    expect(runtime.currentBet).toBe(18);
    expect(hand.events.at(-1)).toMatchObject({
      type: "playerAction",
      action: "allIn",
    });
  });

  it("undo removes the most recent structured event", () => {
    let hand = createHand(
      createDefaultSession(),
      new Date("2026-06-04T00:00:00.000Z"),
    );
    const before = hand.events.length;
    hand = act(hand, 3, "call");
    hand = undoEvent(hand);

    expect(hand.events).toHaveLength(before);
    expect(applyEvents(hand.snapshot, hand.events).nextSeat).toBe(3);
  });

  it("validates and exports one hand with explicit review issues", () => {
    let hand = createHand(
      createDefaultSession(),
      new Date("2026-06-04T00:00:00.000Z"),
    );
    hand = act(hand, 3, "call");
    hand = act(hand, 4, "fold");
    hand = act(hand, 5, "fold");
    hand = act(hand, 0, "fold");
    hand = act(hand, 1, "call");
    hand = act(hand, 2, "check");
    hand = appendEvent(
      hand,
      event("flop", {
        type: "dealBoard",
        street: "flop",
        cards: ["As", "7d", "2c"],
      }),
    );
    hand = act(hand, 1, "check");
    hand = act(hand, 2, "check");
    hand = act(hand, 3, "check");
    hand = appendEvent(
      hand,
      event("turn", { type: "dealBoard", street: "turn", cards: ["Jh"] }),
    );
    hand = act(hand, 1, "check");
    hand = act(hand, 2, "check");
    hand = act(hand, 3, "check");
    hand = appendEvent(
      hand,
      event("river", { type: "dealBoard", street: "river", cards: ["4s"] }),
    );
    hand = act(hand, 1, "check");
    hand = act(hand, 2, "check");
    hand = act(hand, 3, "check");
    hand = appendEvent(
      hand,
      event("show", {
        type: "revealCards",
        seat: 1,
        cards: ["unknown", "unknown"],
      }),
    );
    hand = appendEvent(
      hand,
      event("award", { type: "awardPot", winners: [1] }),
    );

    const validation = validateExport(hand);
    const output = exportHand(hand);
    expect(validation.status).toBe("needsReview");
    expect(validation.issues).toContain(
      "Observed showdown cards include unknown values.",
    );
    expect(output).toContain("Board: As 7d 2c Jh 4s");
    expect(output).toContain("Seat 2 posts smallBlind $2");
  });
});
