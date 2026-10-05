import assert from "node:assert/strict"
import test from "node:test"

import { formatSavedAt } from "./archive.ts"

test("datum arhiva je zapisan po slovensko", () => {
  const label = formatSavedAt("2026-10-05T10:47:00.000Z")
  assert.match(label, /2026/)
  assert.match(label, /10/)
  assert.match(label, /5/)
})
