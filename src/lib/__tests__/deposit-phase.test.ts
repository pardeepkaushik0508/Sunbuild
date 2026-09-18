import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DepositTriggerType, ScheduleStatus } from "@prisma/client";
import { computeDepositDue, dueDatesDiffer } from "../deposits/due";
import { pickNextDeposit } from "../deposits/next-deposit";

describe("phase-dependent deposits", () => {
  it("does not mark a phase-triggered deposit overdue while the phase is incomplete", () => {
    const result = computeDepositDue(
      {
        triggerType: DepositTriggerType.PHASE_COMPLETION_PLUS_OFFSET,
        plannedDueDate: "2026-10-02T00:00:00.000Z",
        currentDueDate: "2026-10-02T00:00:00.000Z",
        offsetDays: 1,
        linkedPhase: {
          title: "Flooring",
          status: ScheduleStatus.IN_PROGRESS,
          baselineEnd: "2026-10-01T00:00:00.000Z",
          currentEnd: "2026-10-05T00:00:00.000Z",
        },
      },
      new Date("2026-10-08T12:00:00.000Z")
    );
    assert.equal(result.triggerArmed, false);
    assert.equal(result.isOverdue, false);
    assert.equal(result.currentDueDate?.toISOString().slice(0, 10), "2026-10-06");
    assert.match(result.reason ?? "", /Flooring/);
  });

  it("finalizes against actual completion and keeps planned date", () => {
    const result = computeDepositDue({
      triggerType: DepositTriggerType.PHASE_COMPLETION_PLUS_OFFSET,
      plannedDueDate: "2026-10-02T00:00:00.000Z",
      offsetDays: 1,
      linkedPhase: {
        title: "Flooring",
        status: ScheduleStatus.COMPLETED,
        baselineEnd: "2026-10-01T00:00:00.000Z",
        currentEnd: "2026-10-05T00:00:00.000Z",
        actualEnd: "2026-10-08T00:00:00.000Z",
      },
    });
    assert.equal(result.plannedDueDate?.toISOString().slice(0, 10), "2026-10-02");
    assert.equal(result.currentDueDate?.toISOString().slice(0, 10), "2026-10-09");
    assert.equal(result.triggerArmed, true);
  });

  it("applies a 7-day offset after phase completion", () => {
    const result = computeDepositDue({
      triggerType: DepositTriggerType.PHASE_COMPLETION_PLUS_OFFSET,
      plannedDueDate: "2026-10-08T00:00:00.000Z",
      offsetDays: 7,
      linkedPhase: {
        title: "Flooring",
        status: ScheduleStatus.COMPLETED,
        baselineEnd: "2026-10-01T00:00:00.000Z",
        actualEnd: "2026-10-01T00:00:00.000Z",
      },
    });
    assert.equal(result.currentDueDate?.toISOString().slice(0, 10), "2026-10-08");
    assert.equal(result.isOverdue, false);
  });

  it("date-based deposits overdue normally; paid/cancelled stay settled", () => {
    const overdue = computeDepositDue(
      {
        triggerType: DepositTriggerType.DATE_BASED,
        plannedDueDate: "2026-10-02T00:00:00.000Z",
        currentDueDate: "2026-10-02T00:00:00.000Z",
      },
      new Date("2026-10-08T00:00:00.000Z")
    );
    assert.equal(overdue.isOverdue, true);
    assert.equal(dueDatesDiffer("2026-10-02", "2026-10-06"), true);
    assert.equal(dueDatesDiffer("2026-10-06T00:00:00Z", "2026-10-06T23:00:00Z"), false);
  });

  it("picks the next unpaid deposit and ignores received ones", () => {
    const next = pickNextDeposit(
      [
        {
          id: "paid",
          label: "First",
          amount: 10000,
          status: "RECEIVED",
          dueDate: "2026-03-02",
        },
        {
          id: "open",
          label: "Further deposit, by date",
          amount: 20000,
          status: "PENDING",
          dueDate: "2026-10-06",
          plannedDueDate: "2026-10-02",
        },
        {
          id: "later",
          label: "Balance",
          amount: 400000,
          status: "PENDING",
          dueDate: "2027-01-15",
        },
      ],
      new Date("2026-09-18T00:00:00Z")
    );
    assert.equal(next?.id, "open");
    assert.equal(next?.amount, 20000);
  });

  it("returns null when there is no next deposit", () => {
    assert.equal(pickNextDeposit([]), null);
    assert.equal(
      pickNextDeposit([
        { id: "a", label: "Paid", amount: 1, status: "RECEIVED", dueDate: "2026-01-01" },
      ]),
      null
    );
  });
});
