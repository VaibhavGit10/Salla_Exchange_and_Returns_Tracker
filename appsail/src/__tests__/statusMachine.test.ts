import "./setupEnv";
import { assertTransition, isTerminalStatus, nextStates } from "../lib/statusMachine";
import { AppError } from "../lib/errors";

describe("statusMachine", () => {
  it("allows valid transitions", () => {
    expect(() => assertTransition("requested", "approved")).not.toThrow();
    expect(() => assertTransition("approved", "in_transit")).not.toThrow();
    expect(() => assertTransition("received", "resolved")).not.toThrow();
  });

  it("rejects invalid transitions", () => {
    expect(() => assertTransition("resolved", "approved")).toThrow(AppError);
    expect(() => assertTransition("requested", "resolved")).toThrow(AppError);
    expect(() => assertTransition("rejected", "approved")).toThrow(AppError);
  });

  it("identifies terminal states", () => {
    expect(isTerminalStatus("resolved")).toBe(true);
    expect(isTerminalStatus("rejected")).toBe(true);
    expect(isTerminalStatus("cancelled")).toBe(true);
    expect(isTerminalStatus("requested")).toBe(false);
  });

  it("returns next states", () => {
    expect(nextStates("requested")).toEqual(expect.arrayContaining(["approved", "rejected", "cancelled"]));
    expect(nextStates("resolved")).toEqual([]);
  });
});
