import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRequest, signRetellBody } from "./auth";
import { UnauthorizedError } from "./errors";
import { unwrapArgs } from "./args";
import { maskPhone } from "./phone";

test("masks every digit except the last four", () => {
  assert.equal(maskPhone("+1 (415) 555-1234"), "*******1234");
  assert.equal(maskPhone("1234"), "****");
  assert.equal(maskPhone(""), "(none)");
  assert.equal(maskPhone(undefined), "(none)");
});

test("accepts nested Retell args and a flat args-only body", () => {
  assert.equal(
    unwrapArgs({ name: "get_patch_notes", args: { patch: "16.22" }, call: { call_id: "abc" } }).patch,
    "16.22",
  );
  assert.equal(unwrapArgs({ patch: "26.22" }).patch, "26.22");
  assert.equal(
    unwrapArgs({ args: "{\"champion\":\"Ahri\"}" }).champion,
    "Ahri",
  );
});

test("requires the shared secret when it is configured", () => {
  const headers = new Headers({ "x-api-key": "secret" });
  assert.doesNotThrow(() => authorizeRequest(headers, "", { sharedSecret: "secret" }));
  assert.throws(
    () => authorizeRequest(new Headers(), "", { sharedSecret: "secret" }),
    UnauthorizedError,
  );
  assert.doesNotThrow(() => authorizeRequest(new Headers(), "", {}));
});

test("verifies an x-retell-signature when one is sent", () => {
  const raw = JSON.stringify({ args: { patch: "16.22.1" } });
  const timestamp = Date.now();
  const signature = signRetellBody(raw, "api-key", timestamp);
  const headers = new Headers({ "x-retell-signature": signature });
  assert.doesNotThrow(() => authorizeRequest(headers, raw, { apiKey: "api-key" }, timestamp));
  assert.throws(
    () => authorizeRequest(headers, raw, { apiKey: "other-key" }, timestamp),
    UnauthorizedError,
  );
  assert.throws(
    () => authorizeRequest(headers, raw, { apiKey: "api-key" }, timestamp + 10 * 60 * 1000),
    UnauthorizedError,
  );
});
