import assert from "node:assert/strict";
import test from "node:test";
import { getChampionBuild, ROSTER } from "./builds";
import { NotFoundError } from "./errors";

test("resolves roster aliases and rejects unknown champions", () => {
  assert.equal(ROSTER.length, 10);
  assert.equal(getChampionBuild("kaisa").champion, "Kai'Sa");
  assert.equal(getChampionBuild("LeeSin").champion, "Lee Sin");
  assert.equal(getChampionBuild("  ahri ").champion, "Ahri");
  assert.ok(getChampionBuild("Ornn").core_items.length >= 2);
  assert.throws(() => getChampionBuild("Teemo"), NotFoundError);
});
