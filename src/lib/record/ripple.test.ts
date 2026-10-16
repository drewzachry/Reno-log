import { describe, expect, it } from "vitest";
import { rippleMessage } from "./ripple";

const T = "2026-10-17";
const d = (title: string, status: string, oldBy: string | null, newBy: string) => ({
  title,
  room: "Kitchen",
  status,
  old_decide_by: oldBy,
  new_decide_by: newBy,
});

describe("rippleMessage", () => {
  it("says how many moved, which way, and lists open ones soonest first", () => {
    const m = rippleMessage(
      "Rough-in",
      [
        d("Sink", "decided", "2026-10-20", "2026-10-13"),
        d("Hood", "not_started", "2026-10-27", "2026-10-20"),
        d("Outlets", "exploring", "2026-10-21", "2026-10-14"),
      ],
      T,
    );
    expect(m.headline).toBe("That moves 3 deadlines earlier. 2 still need deciding:");
    expect(m.lines).toEqual([
      "Outlets (Kitchen): was due Oct 14, 3d late",
      "Hood (Kitchen): decide by Oct 20",
    ]);
  });

  it("handles a first date and nothing tied to it", () => {
    expect(rippleMessage("Move-in", [], T).headline).toBe(
      "Move-in date saved. No deadlines depend on it yet.",
    );
    expect(rippleMessage("Rough-in", [d("Sink", "decided", null, "2026-11-01")], T).headline).toBe(
      "That moves 1 deadline.",
    );
  });

  it("caps the list at five", () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      d(`Item ${i}`, "not_started", "2026-11-01", "2026-11-15"),
    );
    const m = rippleMessage("Rough-in", many, T);
    expect(m.headline).toBe("That moves 8 deadlines later. 8 still need deciding:");
    expect(m.lines.at(-1)).toBe("and 3 more on the Decisions tab");
  });
});
