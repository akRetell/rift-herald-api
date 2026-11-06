import assert from "node:assert/strict";
import test from "node:test";
import { candidateKeys, findArticle, normalizePatchKey, parseTitlePatch, type ArticleCard } from "./patch-match";
import { classifyChange, parsePatchNotes } from "./patch-parse";

test("normalizes Data Dragon builds and public patch ids", () => {
  assert.equal(normalizePatchKey("16.22.1"), "16.22");
  assert.equal(normalizePatchKey("v26.22"), "26.22");
  assert.equal(normalizePatchKey("Patch 25.09"), "25.9");
  assert.equal(normalizePatchKey("25.S1.1"), "25.s1.1");
  assert.equal(normalizePatchKey("2025.S1.3"), "25.s1.3");
  assert.equal(normalizePatchKey("13.1B"), "13.1b");
  assert.equal(normalizePatchKey("hello"), null);
});

test("maps Data Dragon 16.22 onto the public 26.22 article before other aliases", () => {
  assert.deepEqual(candidateKeys("16.22.1"), ["16.22", "26.22"]);
  assert.deepEqual(candidateKeys("26.22"), ["26.22"]);
  assert.deepEqual(candidateKeys("15.1"), ["15.1", "25.s1.1", "25.1"]);
  assert.deepEqual(candidateKeys("15.4"), ["15.4", "25.4"]);
  assert.deepEqual(candidateKeys("14.22"), ["14.22"]);
});

test("finds the article whose title key matches, preferring the first alias that exists", () => {
  const cards: ArticleCard[] = [
    card("Patch 25.04 Notes", "25.4", "2025-02-19"),
    card("Patch 25.S1.1 Notes", "25.s1.1", "2025-01-07"),
    card("League of Legends Patch 26.22 Notes", "26.22", "2026-11-03"),
    card("Patch 13.1 notes", "13.1", "2023-01-10"),
    card("Patch 13.1B notes", "13.1b", "2023-01-24"),
  ];
  assert.equal(findArticle(cards, "16.22.1")?.display, "26.22");
  assert.equal(findArticle(cards, "15.1")?.key, "25.s1.1");
  assert.equal(findArticle(cards, "15.4")?.key, "25.4");
  assert.equal(findArticle(cards, "13.1")?.key, "13.1");
  assert.equal(findArticle(cards, "13.1b")?.key, "13.1b");
  assert.equal(findArticle(cards, "99.1"), null);
});

test("parses champion buffs, nerfs, adjustments, and item changes", () => {
  const html = `
    <blockquote><p>The intro calls out a Corki buff and a Yasuo nerf.</p></blockquote>
    <h2 id="patch-champions">Champions</h2>
    <h3 class="change-title"><a href="/corki">Corki</a></h3>
    <blockquote><p>He has some more space to be better.</p></blockquote>
    <h4 class="ability-title">R - Missile Barrage</h4>
    <ul><li><strong>Damage</strong>: 90 / 170 / 250 ⇒ <strong>100 / 190 / 280</strong></li></ul>
    <h3 class="change-title">Yasuo</h3>
    <blockquote><p>Yasuo would also need a nerf.</p></blockquote>
    <h4>Q - Steel Tempest</h4>
    <ul><li>Damage: 20 / 45 / 70 / 95 / 120 (+105% total AD) &rArr; 20 / 45 / 70 / 95 / 120 (+100% total AD)</li></ul>
    <h3 class="change-title">Mel</h3>
    <blockquote><p>Mel is getting a midscope adjustment. Power moved from early game to scaling.</p></blockquote>
    <h4>Q - Radiant Volley</h4>
    <ul><li>Cooldown: 8s ⇒ 7s</li></ul>
    <h3 class="change-title">Sion</h3>
    <blockquote><p>Sion is getting a small bump to his wave clear.</p></blockquote>
    <h2 id="patch-items">Items</h2>
    <h3 class="change-title">Doran's Bow</h3>
    <blockquote><p>We're nerfing Doran's Bow.</p></blockquote>
    <ul><li>Attack Damage: 8 ⇒ 7</li></ul>
    <h2>ARAM: Mayhem</h2>
    <blockquote><p>Augments were retuned for the music event.</p></blockquote>
    <h2>Upcoming Skins &amp; Chromas</h2>
    <p>Fancy skins should not be spoken.</p>
  `;
  const summary = parsePatchNotes(html, "Corki buff and Yasuo nerf");
  assert.equal(summary.champion_buffs[0]?.startsWith("Corki:"), true);
  assert.ok(summary.champion_buffs.some((line) => line.startsWith("Sion")));
  assert.equal(summary.champion_nerfs.length, 1);
  assert.match(summary.champion_nerfs[0], /Yasuo: Q - Steel Tempest/);
  assert.match(summary.champion_nerfs[0], /105% total AD to 100% total AD/);
  assert.ok(summary.system_changes.some((line) => line.startsWith("Mel:")));
  assert.ok(summary.system_changes.some((line) => line.includes("Doran's Bow")));
  assert.ok(summary.system_changes.some((line) => line.startsWith("ARAM: Mayhem:")));
  assert.equal(summary.system_changes.some((line) => /skins/i.test(line)), false);
});

test("classifies designer blurbs", () => {
  assert.equal(classifyChange("We're giving her a buff."), "buff");
  assert.equal(classifyChange("he's clearly too strong"), "nerf");
  assert.equal(classifyChange("Mel is getting a midscope adjustment."), "adjust");
});

test("reads a patch token from a title", () => {
  assert.deepEqual(parseTitlePatch("League of Legends Patch 26.22 Notes"), {
    key: "26.22",
    display: "26.22",
  });
  assert.equal(parseTitlePatch("Game Updates")?.key ?? null, null);
});

function card(title: string, key: string, publishedAt: string): ArticleCard {
  const parsed = parseTitlePatch(title);
  return {
    title,
    url: "/en-us/news/game-updates/example",
    description: "",
    publishedAt,
    key,
    display: parsed?.display ?? key,
  };
}
