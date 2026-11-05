import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

import { isScreenshotFile, screenshotReadError } from "./ocr-engine.ts"

test("png iz odložišča brez vrste datoteke je posnetek, besedilo pa ne", async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/dobavitelji-starost.png"))
  assert.equal(isScreenshotFile(png, "", "blob"), true)
  assert.equal(isScreenshotFile(png, "application/octet-stream", "image.png"), true)
  assert.equal(isScreenshotFile(new Uint8Array([1, 2, 3]), "text/plain", "opomba.txt"), false)
})

test("manjkajoča knjižnica pove svoj razlog, ne samo da slike ni bilo mogoče prebrati", () => {
  const missing = screenshotReadError(new Error("Cannot find module 'bmp-js'"), "Slike ni bilo mogoče prebrati.")
  assert.equal(missing, "Na strežniku manjka bralnik besedila.")
  assert.equal(missing.includes("Slike ni bilo mogoče prebrati"), false)
  assert.match(
    screenshotReadError(new Error("Na sliki ne vidim tabele."), "Slike ni bilo mogoče prebrati."),
    /tabele/,
  )
  assert.equal(
    screenshotReadError(new Error("Error attempting to read image."), "Slike ni bilo mogoče prebrati."),
    "Posnetka ni bilo mogoče odpreti.",
  )
})
