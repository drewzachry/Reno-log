import { describe, expect, it } from "vitest";
import { proposalSchema } from "./proposals";

const id = "3f1c2a54-9a0b-4c5e-8d7f-0a1b2c3d4e5f";

describe("proposal validation", () => {
  it("accepts a status change and a milestone move", () => {
    expect(
      proposalSchema.safeParse({ type: "update_decision", decision_id: id, status: "decided" })
        .success,
    ).toBe(true);
    expect(
      proposalSchema.safeParse({
        type: "move_milestone",
        project_id: id,
        milestone_key: "rough_in",
        date: "2026-11-24",
      }).success,
    ).toBe(true);
  });

  it("accepts adding and removing an account", () => {
    expect(
      proposalSchema.safeParse({
        type: "save_funding_source",
        project_id: id,
        id: null,
        name: "Savings",
        amount_cents: 9000000,
      }).success,
    ).toBe(true);
    expect(
      proposalSchema.safeParse({ type: "remove_funding_source", project_id: id, id }).success,
    ).toBe(true);
  });

  it("rejects what a model might make up", () => {
    for (const bad of [
      { type: "update_decision", decision_id: id, status: "done" },
      { type: "update_decision", decision_id: "tub", status: "decided" },
      { type: "update_decision", decision_id: id, cost_cents: 12.5 },
      { type: "update_decision", decision_id: id, cost_cents: -100 },
      { type: "move_milestone", project_id: id, milestone_key: "rough_in", date: "Nov 24" },
      {
        type: "move_milestone",
        project_id: id,
        milestone_key: "Rough-in; drop table",
        date: "2026-11-24",
      },
      { type: "save_funding_source", project_id: id, id: null, name: " ", amount_cents: 100 },
      { type: "save_funding_source", project_id: id, id: null, name: "Savings", amount_cents: -5 },
      { type: "delete_everything" },
    ]) {
      expect(proposalSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});
