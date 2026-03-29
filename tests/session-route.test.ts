import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { routeFromOriginMetadata } from "../src/session-route";

describe("session-route", () => {
  it("defaults bare numeric discord targets to channel routes", () => {
    const route = routeFromOriginMetadata("discord|1481874223294054540");
    assert.deepEqual(route, {
      provider: "discord",
      accountId: undefined,
      target: "channel:1481874223294054540",
      threadId: undefined,
      sessionKey: undefined,
    });
  });

  it("keeps discord dm session keys normalized to user routes", () => {
    const route = routeFromOriginMetadata(
      "discord|1481874223294054540",
      undefined,
      "agent:main:discord:dm:1481874223294054540",
    );
    assert.deepEqual(route, {
      provider: "discord",
      accountId: undefined,
      target: "user:1481874223294054540",
      threadId: undefined,
      sessionKey: "agent:main:discord:dm:1481874223294054540",
    });
  });

  it("maps discord group session keys to channel routes", () => {
    const route = routeFromOriginMetadata(
      "discord|1481874223294054540",
      undefined,
      "agent:main:discord:group:1481874223294054540",
    );
    assert.deepEqual(route, {
      provider: "discord",
      accountId: undefined,
      target: "channel:1481874223294054540",
      threadId: undefined,
      sessionKey: "agent:main:discord:group:1481874223294054540",
    });
  });
});
