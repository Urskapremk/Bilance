import assert from "node:assert/strict"
import test from "node:test"

import { DEFAULT_SIGNATORY, signatoryById } from "./signatories.ts"

test("podpis je eden od treh, neznan pa pade na računovodjo", () => {
  assert.equal(signatoryById("matic")?.name, "Matic Premk")
  assert.equal(signatoryById("urska")?.name, "Urška Premk")
  assert.equal(signatoryById("urska")?.role, "računovodja")
  assert.equal(signatoryById("matic")?.role, "")
  assert.equal(signatoryById("nejc")?.role, "računovodja")
  assert.equal(signatoryById(undefined)?.id, DEFAULT_SIGNATORY)
  assert.equal(signatoryById("nekdo")?.name, "Nejc Zupanc")
})
