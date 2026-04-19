import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAlertMessage,
  extractListingFromCardText,
  findNewMatches,
  isExactNameMatch
} from "../src/check-pudding.mjs";

test("exact name matching is case insensitive but not substring based", () => {
  assert.equal(isExactNameMatch("Pudding"), true);
  assert.equal(isExactNameMatch("PUDDING"), true);
  assert.equal(isExactNameMatch("pUdDiNg"), true);
  assert.equal(isExactNameMatch("Pudding Pop"), false);
  assert.equal(isExactNameMatch("Mr. Pudding"), false);
  assert.equal(isExactNameMatch("Banana Pudding"), false);
});

test("listing text parsing extracts a name and animal ID", () => {
  const listing = extractListingFromCardText(
    `
      *KELLY R
      A196458
      Domestic Shorthair
      Brn Tabby & White
      Female
    `,
    "https://animalshelter.adcogov.org/example"
  );

  assert.deepEqual(listing, {
    animalId: "A196458",
    detailUrl: "https://animalshelter.adcogov.org/example",
    name: "KELLY R"
  });
});

test("dedupe only alerts for unseen animal IDs", () => {
  const { newMatches, updatedSeenAnimalIds } = findNewMatches(
    [
      { animalId: "A196467", detailUrl: null, name: "Pudding" },
      { animalId: "A196468", detailUrl: null, name: "Pudding" }
    ],
    ["A196467"]
  );

  assert.deepEqual(newMatches, [{ animalId: "A196468", detailUrl: null, name: "Pudding" }]);
  assert.deepEqual(updatedSeenAnimalIds, ["A196467", "A196468"]);
});

test("alert message includes the first-seen note and listing details", () => {
  const message = buildAlertMessage(
    [{ animalId: "A196467", detailUrl: "https://animalshelter.adcogov.org/example", name: "Pudding" }],
    {
      targetUrl: "https://animalshelter.adcogov.org/animal-adoption",
      timeZone: "America/Denver"
    },
    new Date("2026-04-19T12:00:00Z")
  );

  assert.match(message.subject, /Pudding found/);
  assert.match(message.text, /A196467/);
  assert.match(message.text, /first time each animal ID is seen/);
  assert.match(message.html, /View listing/);
});
