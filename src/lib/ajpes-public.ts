/**
 * Javna objava letnega poročila GRAFAM d.o.o. za leto 2025
 * (matična 6531482000), stanje 31. 12. 2025.
 * Zneski so v centih. Zapisane so postavke, ki jih objava izkaže;
 * podpostavk, ki jih objava ne razčleni, tukaj ni.
 */

export type PublicFiling = {
  year: number
  date: string
  registration: string
  source: string
  note: string
  amounts: Record<string, number>
}

const z = 0

export const grafamPublic2025: PublicFiling = {
  year: 2025,
  date: "31. 12. 2025",
  registration: "6531482000",
  source: "Javna objava AJPES, letno poročilo 2025",
  note: "Stolpec 31. 12. 2025 je javna objava letnega poročila AJPES za leto 2025, matična številka 6531482000. Črtica pomeni, da objava te postavke ne razčleni.",
  amounts: {
    "001": 18_519_740,
    "002": 7_733_338,
    "003": z,
    "004": z,
    "009": z,
    "010": 7_733_338,
    "018": z,
    "019": z,
    "020": z,
    "024": z,
    "027": z,
    "031": z,
    "032": 8_936_597,
    "033": z,
    "034": z,
    "040": z,
    "041": z,
    "045": z,
    "048": 5_396_128,
    "052": 3_540_469,
    "053": 1_849_805,
    "054": z,
    "055": 18_519_740,
    "056": 7_039_625,
    "057": 852_400,
    "058": 852_400,
    "059": z,
    "060": z,
    "061": 85_240,
    "067": z,
    "301": z,
    "068": 5_560_123,
    "069": z,
    "070": 541_862,
    "071": z,
    "072": z,
    "073": z,
    "074": z,
    "075": 5_485_300,
    "076": z,
    "080": 5_485_300,
    "084": z,
    "085": 5_994_815,
    "086": z,
    "087": 603_950,
    "091": 5_390_865,
    "095": z,
    "096": z,
  },
}

export function publicFilingFor(company: string, previousDate: string): PublicFiling | null {
  if (previousDate !== grafamPublic2025.date) return null
  if (!/grafam/i.test(company)) return null
  return grafamPublic2025
}

export function attachPublicFiling<T extends { company: string; previousDate: string; notes: string[] }>(
  statement: T,
): T & { publicPrevious?: PublicFiling } {
  const filing = publicFilingFor(statement.company, statement.previousDate)
  if (!filing) return statement
  if (statement.notes.includes(filing.note)) return { ...statement, publicPrevious: filing }
  return { ...statement, publicPrevious: filing, notes: [...statement.notes, filing.note] }
}
