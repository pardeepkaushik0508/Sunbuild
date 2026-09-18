import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateScheduleVariance,
  calendarDaysUtc,
  establishBaselineDates,
  formatVarianceDays,
  resolveWorkingEnd,
} from "../schedule/variance";
import { resolveGanttScale } from "../schedule/gantt-scale";
import { buildGanttTree, tasksToScheduleRows } from "../dashboard/gantt-tree";

describe("Gantt variance helper", () => {
  it("counts late, early, and on-time in UTC calendar days", () => {
    const late = calculateScheduleVariance({
      baselineEnd: "2026-10-20T00:00:00.000Z",
      currentEnd: "2026-10-25T00:00:00.000Z",
      status: "IN_PROGRESS",
    });
    assert.equal(late.days, 5);
    assert.equal(late.kind, "late");
    assert.equal(late.signedLabel, "+5 days");
    assert.equal(late.isForecast, true);

    const early = calculateScheduleVariance({
      baselineEnd: "2026-10-20T00:00:00.000Z",
      actualEnd: "2026-10-18T00:00:00.000Z",
      status: "COMPLETED",
    });
    assert.equal(early.days, -2);
    assert.equal(early.signedLabel, "−2 days");
    assert.equal(early.isForecast, false);

    const onTime = calculateScheduleVariance({
      baselineEnd: "2026-10-20T00:00:00.000Z",
      actualEnd: "2026-10-20T12:00:00.000Z",
      status: "COMPLETED",
    });
    assert.equal(onTime.days, 0);
    assert.equal(formatVarianceDays(0), "On time");
  });

  it("does not let delays rewrite an established baseline", () => {
    const frozen = establishBaselineDates({
      existingBaselineStart: "2026-10-01T00:00:00.000Z",
      existingBaselineEnd: "2026-10-20T00:00:00.000Z",
      start: "2026-10-01T00:00:00.000Z",
      end: "2026-10-25T00:00:00.000Z",
    });
    assert.equal(frozen.baselineEnd?.toISOString().slice(0, 10), "2026-10-20");
  });

  it("uses actual end once completed instead of stale forecast", () => {
    const end = resolveWorkingEnd({
      status: "COMPLETED",
      currentEnd: "2026-10-25T00:00:00.000Z",
      actualEnd: "2026-10-18T00:00:00.000Z",
    });
    assert.equal(end?.toISOString().slice(0, 10), "2026-10-18");
  });

  it("handles missing actual end and timezone-stable day counts", () => {
    assert.equal(calendarDaysUtc("2026-10-01T23:00:00.000Z", "2026-10-02T01:00:00.000Z"), 1);
    const missing = calculateScheduleVariance({
      baselineEnd: null,
      currentEnd: "2026-10-25T00:00:00.000Z",
    });
    assert.equal(missing.kind, "unknown");
  });
});

describe("Gantt adaptive scale", () => {
  it("uses daily/weekly for short ranges and monthly for 2–5 months", () => {
    const twoMonths = resolveGanttScale(
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-11-30T00:00:00Z")
    );
    assert.equal(twoMonths.primary, "month");
    const fiveMonths = resolveGanttScale(
      new Date("2026-10-01T00:00:00Z"),
      new Date("2027-02-28T00:00:00Z")
    );
    assert.equal(fiveMonths.primary, "month");
    const short = resolveGanttScale(
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-10T00:00:00Z")
    );
    assert.equal(short.primary, "day");
  });
});

describe("Gantt tree — one row per task, parallel overlap preserved", () => {
  it("renders Flooring once with baseline + working dates (no duplicate row)", () => {
    const tree = buildGanttTree([
      {
        id: "flooring",
        title: "Flooring",
        trade: "Flooring",
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-25T00:00:00Z"),
        status: "IN_PROGRESS",
        dependsOnId: null,
        assigneeName: null,
        baselineStartDate: new Date("2026-10-01T00:00:00Z"),
        baselineEndDate: new Date("2026-10-20T00:00:00Z"),
      },
    ]);
    const rows = tree.filter((t) => t.title === "Flooring");
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.varianceDays, 5);
    assert.equal(rows[0]?.baselineEndDate?.toString().includes("2026"), true);
  });

  it("keeps overlapping parallel tasks without sequential shifting", () => {
    const tree = buildGanttTree([
      {
        id: "a",
        title: "Flooring",
        trade: "Interior",
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-15T00:00:00Z"),
        status: "PLANNED",
        dependsOnId: null,
        assigneeName: null,
      },
      {
        id: "b",
        title: "Plumbing",
        trade: "Interior",
        startDate: new Date("2026-10-05T00:00:00Z"),
        endDate: new Date("2026-10-12T00:00:00Z"),
        status: "PLANNED",
        dependsOnId: null,
        assigneeName: null,
      },
      {
        id: "c",
        title: "Painting",
        trade: "Interior",
        startDate: new Date("2026-10-08T00:00:00Z"),
        endDate: new Date("2026-10-20T00:00:00Z"),
        status: "PLANNED",
        dependsOnId: null,
        assigneeName: null,
      },
    ]);
    const titles = tree.filter((t) => !t.isPhase).map((t) => t.title);
    assert.deepEqual(titles, ["Flooring", "Plumbing", "Painting"]);
    const flooring = tree.find((t) => t.title === "Flooring");
    const plumbing = tree.find((t) => t.title === "Plumbing");
    assert.ok(flooring && plumbing);
    assert.equal(new Date(plumbing.startDate) < new Date(flooring.endDate), true);
  });

  it("handles 0 tasks and 100 task rows without throwing", () => {
    assert.deepEqual(buildGanttTree([]), []);
    const many = Array.from({ length: 100 }, (_, i) => ({
      id: `t${i}`,
      title: `Task ${i}`,
      trade: "Tasks",
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-03T00:00:00Z"),
      status: "PLANNED",
      dependsOnId: null,
      assigneeName: null,
    }));
    const tree = buildGanttTree(many);
    assert.equal(tree.filter((t) => !t.isPhase).length, 100);
  });

  it("maps a completed-early task without a second row", () => {
    const rows = tasksToScheduleRows([
      {
        id: "1",
        title: "Flooring",
        status: "DONE",
        startDate: new Date("2026-10-01T00:00:00Z"),
        dueDate: new Date("2026-10-25T00:00:00Z"),
        baselineEndDate: new Date("2026-10-20T00:00:00Z"),
        completedAt: new Date("2026-10-18T00:00:00Z"),
      },
    ]);
    assert.equal(rows.length, 1);
    const tree = buildGanttTree(rows);
    const flooring = tree.find((t) => t.title === "Flooring");
    assert.equal(flooring?.varianceDays, -2);
  });
});
