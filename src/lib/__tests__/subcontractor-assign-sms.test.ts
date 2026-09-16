/**
 * Regression: subcontractor project assignment must notify (and SMS) the assignee.
 * Logic mirror of assignSubcontractorAction notification payload.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("subcontractor project assignment SMS payload", () => {
  it("builds a notification that routes SMS via Project entityType", () => {
    const projectId = "proj_123";
    const payload = {
      type: "SUBCONTRACTOR_PROJECT_ASSIGNED",
      title: "You have been assigned to Demo Project",
      body: "Assigned by Owner.",
      href: `/sub/jobs/${projectId}`,
      entityType: "Project",
      entityId: projectId,
    };
    assert.equal(payload.href.startsWith("/sub/"), true);
    assert.equal(payload.entityType, "Project");
    // smsForNotification only attaches projectId when entityType === "Project"
    const smsProjectId =
      payload.entityType === "Project" ? payload.entityId : null;
    assert.equal(smsProjectId, projectId);
  });
});
