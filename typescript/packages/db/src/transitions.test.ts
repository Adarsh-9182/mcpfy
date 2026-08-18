import assert from "node:assert/strict";
import { test, describe } from "node:test";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  isInFlight,
  isTerminal,
  PIPELINE_STEPS,
  type DeploymentStatus,
} from "./transitions";

const ALL: DeploymentStatus[] = [
  "queued",
  "building",
  "deploying",
  "health_check",
  "live",
  "failed",
  "cancelled",
  "rolled_back",
];

describe("deployment state machine", () => {
  test("walks the happy path end to end", () => {
    for (let i = 0; i < PIPELINE_STEPS.length - 1; i++) {
      assert.ok(
        canTransition(PIPELINE_STEPS[i]!, PIPELINE_STEPS[i + 1]!),
        `${PIPELINE_STEPS[i]} -> ${PIPELINE_STEPS[i + 1]} should be legal`,
      );
    }
  });

  test("terminal states are dead ends", () => {
    for (const from of ALL.filter(isTerminal)) {
      for (const to of ALL) {
        assert.equal(
          canTransition(from, to),
          false,
          `${from} must not transition to ${to}`,
        );
      }
    }
  });

  test("a deployment cannot skip the health check", () => {
    assert.equal(canTransition("deploying", "live"), false);
    assert.equal(canTransition("building", "live"), false);
    assert.equal(canTransition("queued", "deploying"), false);
  });

  test("a deployment cannot go backwards", () => {
    assert.equal(canTransition("deploying", "building"), false);
    assert.equal(canTransition("live", "building"), false);
    assert.equal(canTransition("health_check", "deploying"), false);
  });

  test("live can only be left by rollback", () => {
    const allowed = ALL.filter((s) => canTransition("live", s));
    assert.deepEqual(allowed, ["rolled_back"]);
  });

  test("in-flight stages can all fail", () => {
    for (const s of ALL.filter(isInFlight)) {
      assert.ok(canTransition(s, "failed"), `${s} should be able to fail`);
    }
  });

  test("health_check cannot be cancelled once it has started", () => {
    // The instance is already receiving traffic checks; cancelling here would
    // leave the environment pointing at a half-promoted deployment.
    assert.equal(canTransition("health_check", "cancelled"), false);
  });

  test("assertTransition throws with both states named", () => {
    assert.throws(
      () => assertTransition("live", "building"),
      (e: unknown) => {
        assert.ok(e instanceof InvalidTransitionError);
        assert.equal(e.from, "live");
        assert.equal(e.to, "building");
        assert.match(e.message, /live to building/);
        return true;
      },
    );
  });

  test("no state is both terminal and in-flight", () => {
    for (const s of ALL) {
      assert.equal(isTerminal(s) && isInFlight(s), false, s);
    }
  });
});
