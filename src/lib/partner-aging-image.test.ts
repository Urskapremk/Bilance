import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import path from "node:path"
import test, { describe } from "node:test"

import sharp from "sharp"

import { findBankCell } from "./bank-form.ts"
import { agingSheetCells, agingTotalCents, parseAgingGrid } from "./partner-aging.ts"
import { POST as postStarost } from "../app/api/starost/route.ts"
import { finishAgingOcr, ocrWordsToGrid, parseAgingImage, type OcrWord } from "./partner-aging-image.ts"

const HEADERS = [
  "zap.",
  "Kupec",
  "davčna",
  "terjatve",
  "Stanje",
  "nezapadlo",
  "zapadlo",
  "do 30",
  "30-60",
  "61-90",
  "91-150",
  "nad 150",
  "nerazporejeno",
]

/** Posnetek zaslona: 11 vrstic in SKUPAJ. Prazne celice ostanejo prazne. */
const ROWS: string[][] = [
  ["1", "Telemach d.o.o.", "66863627", "", "43.923,32", "43.923,32", "", "", "", "", "", "", ""],
  ["2", "Zavarovalnica Triglav d.d.", "80040306", "", "27.718,40", "27.718,40", "", "", "", "", "", "", ""],
  ["3", "Triglav med d.o.o.", "95307320", "", "27.718,40", "27.718,40", "", "", "", "", "", "", ""],
  ["4", "SŽ Express d.o.o.", "20643691", "", "8.285,02", "", "8.285,02", "", "", "", "", "8.285,02", ""],
  ["5", "Planeta d.o.o.", "74697706", "", "5.709,60", "5.709,60", "", "", "", "", "", "", ""],
  ["6", "Lienela d.o.o.", "76531384", "", "5.600,00", "5.600,00", "", "", "", "", "", "", ""],
  ["7", "Lienelia d.o.o.", "78073642", "", "2.400,00", "2.400,00", "", "", "", "", "", "", ""],
  ["8", "PBGW3 d.o.o.", "84088982", "", "1.880,94", "1.880,94", "", "", "", "", "", "", ""],
  ["9", "Ayvens Slovenija d.o.o.", "26485141", "", "1.625,50", "", "1.625,50", "1.625,50", "", "", "", "", ""],
  ["10", "Pivovarna Laško d.o.o.", "90355580", "", "243,37", "", "243,37", "", "", "", "", "243,37", ""],
  ["11", "ostali", "", "", "52,11", "", "52,11", "", "", "", "", "52,11", ""],
  ["", "SKUPAJ", "", "", "125.156,66", "", "", "", "", "", "", "", ""],
]

test("posnetek z 11 kupci in vrstico SKUPAJ ne izmisli praznih celic", () => {
  const parties = parseAgingGrid(ocrWordsToGrid(screenWords()), "kupci")
  assert.equal(parties.length, 11)
  assert.equal(parties.some((row) => row.name.toLowerCase() === "skupaj"), false)
  assert.equal(parties[0]?.name, "Telemach d.o.o.")
  assert.equal(parties[0]?.terjatve, 0)
  assert.equal(parties[0]?.stanje, 4_392_332)
  assert.equal(parties[0]?.nezapadlo, 4_392_332)
  assert.equal(parties[0]?.zapadlo, 0)
  assert.equal(parties[3]?.name, "SŽ Express d.o.o.")
  assert.equal(parties[3]?.d150, 0)
  assert.equal(parties[3]?.nad150, 828_502)
  assert.equal(parties[8]?.do30, 162_550)
  assert.equal(parties[8]?.nezapadlo, 0)
  assert.equal(parties[10]?.name, "ostali")
  assert.equal(parties[10]?.taxNumber, "")
  assert.equal(parties[10]?.nezapadlo, 0)
  assert.equal(parties[10]?.nad150, 5_211)
  assert.equal(agingTotalCents(parties), 12_515_666)
})

const SUPPLIER_HEADERS = [
  "zap.",
  "Dobavitelj",
  "Davčna",
  "Stanje",
  "Nezapadlo",
  "Zapadlo",
  "do 30",
  "31-60",
  "61-90",
  "91-150",
  "nad 150",
]

const SUPPLIER_ROWS: string[][] = [
  ["1", "Medikospot d.o.o.", "44322895", "19.764,00", "", "19.764,00", "19.764,00", "", "", "", ""],
  ["2", "Top Relax srl", "IT 03865270262", "9.564,03", "", "9.564,03", "", "", "", "", "9.564,03"],
  ["3", "MF4L D.O.O.", "63557932", "8.900,00", "8.900,00", "", "", "", "", "", ""],
  ["4", "Uroš Dimnik s.p.", "43672540", "7.200,00", "7.200,00", "", "", "", "", "", ""],
  ["5", "Klemen Janežič s.p.", "45155682", "4.600,00", "4.600,00", "", "", "", "", "", ""],
  ["6", "Studio C6 LTD", "GB", "4.550,00", "4.550,00", "", "", "", "", "", ""],
  ["7", "VENKS d.n.o.", "69427968", "1.952,00", "1.952,00", "", "", "", "", "", ""],
  ["8", "Zavarovalnica Sava d.d.", "44814631", "1.404,16", "1.404,16", "", "", "", "", "", ""],
  ["9", "Bitnet d.o.o.", "55681140", "1.320,04", "1.320,04", "", "", "", "", "", ""],
  ["10", "Hnatura d.o.o.", "31141544", "603,05", "603,05", "", "", "", "", "", ""],
  ["11", "ostali", "", "1.737,22", "936,56", "800,66", "136,00", "", "", "126,36", "538,30"],
  ["", "SKUPAJ", "", "61.594,50", "31.465,81", "30.128,69", "", "", "", "", ""],
]

test("posnetek z 11 dobavitelji napolni vrstice brez izmišljenih razredov", () => {
  const parties = parseAgingGrid(ocrWordsToGrid(supplierWords()), "dobavitelji")
  assert.equal(parties.length, 11)
  assert.equal(parties[0]?.name, "Medikospot d.o.o.")
  assert.equal(parties[0]?.do30, 1_976_400)
  assert.equal(parties[0]?.nezapadlo, 0)
  assert.equal(parties[0]?.d60, 0)
  assert.equal(parties[1]?.taxNumber, "IT03865270262")
  assert.equal(parties[1]?.nad150, 956_403)
  assert.equal(parties[1]?.do30, 0)
  assert.equal(parties[5]?.taxNumber, "GB")
  assert.equal(parties[5]?.nezapadlo, 455_000)
  assert.equal(parties[10]?.name, "ostali")
  assert.equal(parties[10]?.nezapadlo, 93_656)
  assert.equal(parties[10]?.do30, 13_600)
  assert.equal(parties[10]?.d150, 12_636)
  assert.equal(parties[10]?.nad150, 53_830)
  assert.equal(parties[10]?.d60, 0)
  assert.equal(parties[10]?.d90, 0)
  assert.equal(agingTotalCents(parties), 6_159_450)
})

const KUPCI = "050 Krat.ter.kupci"
const DOBAVITELJI = "093 Krat.obvez.dobav."

describe("posnetki zaslona", { concurrency: 1 }, () => {
test("posnetek kupcev prebere vseh 11 vrstic in skupaj 125.156,66", { timeout: 120_000 }, async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/kupci-terjatve.png"))
  const images = [
    png,
    await sharp(png).jpeg({ quality: 90 }).toBuffer(),
    await sharp(png).webp({ quality: 90 }).toBuffer(),
  ]
  try {
    for (const image of images) {
      const parties = await parseAgingImage(image, "kupci")
      assert.equal(parties.length, 11)
      assert.equal(parties.some((row) => row.name.toLowerCase() === "skupaj"), false)
      assert.equal(parties[0]?.name, "Telemach d.o.o.")
      assert.equal(parties[0]?.taxNumber, "66863627")
      assert.equal(parties[0]?.stanje, 4_392_332)
      assert.equal(parties[0]?.nezapadlo, 4_392_332)
      assert.equal(parties[0]?.zapadlo, 0)
      assert.equal(parties[0]?.do30, 0)
      assert.equal(parties[3]?.name, "SŽ Express d.o.o.")
      assert.equal(parties[3]?.taxNumber, "20643691")
      assert.equal(parties[3]?.stanje, 828_502)
      assert.equal(parties[3]?.d150, 0)
      assert.equal(parties[3]?.nad150, 828_502)
      assert.equal(parties[8]?.name, "Ayvens Slovenija d.o.o.")
      assert.equal(parties[8]?.do30, 162_550)
      assert.equal(parties[8]?.nezapadlo, 0)
      assert.equal(parties[9]?.name, "Pivovarna Laško d.o.o.")
      assert.equal(parties[9]?.nad150, 24_337)
      assert.equal(parties[10]?.name, "ostali")
      assert.equal(parties[10]?.taxNumber, "")
      assert.equal(parties[10]?.nad150, 5_211)
      assert.equal(parties[10]?.nezapadlo, 0)
      assert.equal(agingTotalCents(parties), 12_515_666)
      const cells = agingSheetCells(KUPCI, "kupci", parties)
      assert.equal(findBankCell(cells, KUPCI, "B8")?.text, "Telemach d.o.o.")
      assert.equal(findBankCell(cells, KUPCI, "G8")?.euros, 4_392_332)
      assert.equal(findBankCell(cells, KUPCI, "I8"), undefined)
      assert.equal(findBankCell(cells, KUPCI, "L11"), undefined)
      assert.equal(findBankCell(cells, KUPCI, "M11")?.euros, 828_502)
      assert.equal(findBankCell(cells, KUPCI, "M18")?.euros, 5_211)
      const written = cells
        .filter((cell) => cell.sheet === KUPCI && cell.euros !== undefined && /^D\d+$/.test(cell.cell))
        .reduce((sum, cell) => sum + (cell.euros ?? 0), 0)
      assert.equal(written, 12_515_666)
    }
  } finally {
    await finishAgingOcr()
  }
})

test("posnetek dobaviteljev napolni zavihek 093 in skupaj je 61.594,50", { timeout: 120_000 }, async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/dobavitelji-starost.png"))
  const images = [
    png,
    await sharp(png).jpeg({ quality: 90 }).toBuffer(),
    await sharp(png).webp({ quality: 90 }).toBuffer(),
  ]
  try {
    for (const image of images) {
      await assert.rejects(parseAgingImage(image, "kupci"), /dobavitelji/)
      const parties = await parseAgingImage(image, "dobavitelji")
      assert.equal(parties.length, 11)
      assert.equal(parties.some((row) => row.name.toLowerCase() === "skupaj"), false)
      assert.equal(parties[0]?.name, "Medikospot d.o.o.")
      assert.equal(parties[0]?.taxNumber, "44322895")
      assert.equal(parties[0]?.stanje, 1_976_400)
      assert.equal(parties[0]?.nezapadlo, 0)
      assert.equal(parties[0]?.do30, 1_976_400)
      assert.equal(parties[0]?.d60, 0)
      assert.equal(parties[1]?.name, "Top Relax srl")
      assert.equal(parties[1]?.taxNumber, "IT03865270262")
      assert.equal(parties[1]?.stanje, 956_403)
      assert.equal(parties[1]?.nad150, 956_403)
      assert.equal(parties[1]?.do30, 0)
      assert.equal(parties[2]?.name, "MF4L D.O.O.")
      assert.equal(parties[2]?.taxNumber, "63557932")
      assert.equal(parties[2]?.nezapadlo, 890_000)
      assert.equal(parties[2]?.zapadlo, 0)
      assert.equal(parties[3]?.name, "Uroš Dimnik s.p.")
      assert.equal(parties[4]?.name, "Klemen Janežič s.p.")
      assert.equal(parties[4]?.taxNumber, "45155682")
      assert.equal(parties[5]?.name, "Studio C6 LTD")
      assert.equal(parties[5]?.taxNumber, "GB")
      assert.equal(parties[5]?.nezapadlo, 455_000)
      assert.equal(parties[6]?.taxNumber, "69427968")
      assert.equal(parties[7]?.name, "Zavarovalnica Sava d.d.")
      assert.equal(parties[7]?.stanje, 140_416)
      assert.equal(parties[8]?.name, "Bitnet d.o.o.")
      assert.equal(parties[8]?.taxNumber, "55681140")
      assert.equal(parties[8]?.stanje, 132_004)
      assert.equal(parties[8]?.nezapadlo, 132_004)
      assert.equal(parties[9]?.name, "Hnatura d.o.o.")
      assert.equal(parties[9]?.taxNumber, "31141544")
      assert.equal(parties[9]?.stanje, 60_305)
      assert.equal(parties[10]?.name, "ostali")
      assert.equal(parties[10]?.taxNumber, "")
      assert.equal(parties[10]?.stanje, 173_722)
      assert.equal(parties[10]?.nezapadlo, 93_656)
      assert.equal(parties[10]?.zapadlo, 80_066)
      assert.equal(parties[10]?.do30, 13_600)
      assert.equal(parties[10]?.d60, 0)
      assert.equal(parties[10]?.d90, 0)
      assert.equal(parties[10]?.d150, 12_636)
      assert.equal(parties[10]?.nad150, 53_830)
      for (const row of parties) {
        assert.equal(row.do30 + row.d60 + row.d90 + row.d150 + row.nad150, row.zapadlo)
        assert.equal(row.nezapadlo + row.zapadlo, row.stanje)
      }
      assert.equal(agingTotalCents(parties), 6_159_450)
      const cells = agingSheetCells(DOBAVITELJI, "dobavitelji", parties)
      assert.equal(findBankCell(cells, DOBAVITELJI, "B8")?.text, "Medikospot d.o.o.")
      assert.equal(findBankCell(cells, DOBAVITELJI, "C9")?.text, "IT03865270262")
      assert.equal(findBankCell(cells, DOBAVITELJI, "K9")?.euros, 956_403)
      assert.equal(findBankCell(cells, DOBAVITELJI, "C13")?.text, "GB")
      assert.equal(findBankCell(cells, DOBAVITELJI, "C16")?.text, "55681140")
      assert.equal(findBankCell(cells, DOBAVITELJI, "B18"), undefined)
      assert.equal(findBankCell(cells, DOBAVITELJI, "D18")?.euros, 173_722)
      assert.equal(findBankCell(cells, DOBAVITELJI, "K18")?.euros, 53_830)
      assert.equal(findBankCell(cells, DOBAVITELJI, "H18"), undefined)
      assert.equal(findBankCell(cells, DOBAVITELJI, "F8"), undefined)
      const written = cells
        .filter((cell) => cell.sheet === DOBAVITELJI && cell.euros !== undefined && /^D\d+$/.test(cell.cell))
        .reduce((sum, cell) => sum + (cell.euros ?? 0), 0)
      assert.equal(written, 6_159_450)
      assert.equal(cells.some((cell) => cell.sheet.startsWith("045")), false)
      assert.equal(cells.some((cell) => cell.sheet === KUPCI), false)
    }
  } finally {
    await finishAgingOcr()
  }
})

test("prilepljen png dobaviteljev brez vrste datoteke vrne Medikospot in 61.594,50", { timeout: 60_000 }, async () => {
  const png = await readFile(path.join(process.cwd(), "src/lib/fixtures/dobavitelji-starost.png"))
  const form = new FormData()
  form.set("file", new File([png], "blob", { type: "" }))
  form.set("kind", "dobavitelji")
  try {
    const response = await postStarost(new Request("http://bilance.local/api/starost", { method: "POST", body: form }))
    assert.equal(response.status, 200)
    const data = (await response.json()) as { rows: Array<{ name: string; stanje: number }> }
    assert.equal(data.rows.length, 11)
    assert.equal(data.rows[0]?.name, "Medikospot d.o.o.")
    assert.equal(
      data.rows.reduce((sum, row) => sum + row.stanje, 0),
      6_159_450,
    )
  } finally {
    await finishAgingOcr()
  }
})
})

test("slika dobaviteljev ne gre med kupce", () => {
  const words = screenWords().map((word) =>
    word.text === "Kupec" ? { ...word, text: "Dobavitelj" } : word,
  )
  assert.throws(() => parseAgingGrid(ocrWordsToGrid(words), "kupci"), /dobavitelji/)
})

function supplierWords(): OcrWord[] {
  const words: OcrWord[] = []
  const columns = [20, 80, 300, 480, 600, 720, 840, 960, 1080, 1200, 1320]
  place(words, SUPPLIER_HEADERS, 0, columns)
  SUPPLIER_ROWS.forEach((row, index) => place(words, row, 40 + index * 28, columns))
  return words
}

function screenWords(): OcrWord[] {
  const words: OcrWord[] = []
  const columns = [20, 80, 280, 460, 560, 680, 800, 900, 1000, 1100, 1200, 1300, 1420]
  place(words, HEADERS, 0, columns)
  ROWS.forEach((row, index) => place(words, row, 40 + index * 28, columns))
  return words
}

function place(words: OcrWord[], cells: string[], y: number, columns: number[]) {
  cells.forEach((cell, index) => {
    if (!cell) return
    const pieces = cell === "do 30" || cell === "nad 150" ? cell.split(" ") : [cell]
    pieces.forEach((piece, pieceIndex) => {
      const x0 = (columns[index] ?? 0) + pieceIndex * 36
      words.push({ text: piece, x0, y0: y, x1: x0 + 70, y1: y + 16 })
    })
  })
}
