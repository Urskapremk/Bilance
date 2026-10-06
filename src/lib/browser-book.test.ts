import assert from "node:assert/strict"
import test from "node:test"

import { clientDatabaseName, REGISTRY_DATABASE } from "./browser-book.ts"

test("vsaka stranka dobi svojo bazo", () => {
  assert.equal(clientDatabaseName("Adrema d.o.o."), clientDatabaseName("ADREMA d.o.o."))
  assert.notEqual(clientDatabaseName("ADREMA d.o.o."), clientDatabaseName("BLIŠČ d.o.o."))
  assert.equal(REGISTRY_DATABASE, "bilance-stranke")
  assert.match(clientDatabaseName("BLIŠČ d.o.o."), /^bilance-blišč d\.o\.o\.$/u)
})
