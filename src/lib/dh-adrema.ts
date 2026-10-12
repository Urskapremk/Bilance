/**
 * Podatki iz lanskega obrazca ADREMA FRP za Delavsko hranilnico, stanje 31. 7. 2025.
 * Zneski bilance in izkaza so v centih. Število zaposlenih in meseci niso zneski.
 * Tekoči stolpec tega obrazca gre v novem obrazcu v stolpec Prejšnje obdobje.
 */

export type DhCompany = {
  name: string
  seat: string
  registration: string
  taxNumber: string
  director: string
  kind: string
  size: number
  accounting: number
  place: string
  accountant: string
  contact: string
  phone: string
  email: string
}

export const ADREMA_DH_COMPANY: DhCompany = {
  name: "ADREMA D.O.O.",
  seat: "MIKLOŠIČEVA CESTA 28, 1000 LJUBLJANA",
  registration: "2305682000",
  taxNumber: "85127035",
  director: "KAMENKO KESAR",
  kind: "GD",
  size: 1,
  accounting: 2,
  place: "LJUBLJANA",
  accountant: "HNATURA D.O.O.",
  contact: "URŠKA PREMK",
  phone: "040 350 388",
  email: "INFO@HNATURA.COM",
}

/** Pojasnilo načina vrednotenja dolgoročnih naložb, kot je bilo vpisano 31. 7. 2025. */
export const ADREMA_NALOZBE_POJASNILO = "Pripojitev po pošteni vrednosti na dan pripojitve."

export type DhColumn = {
  balance: Record<string, number>
  income: Record<string, number>
}

/** Tekoče obdobje 1. 1. 2025–31. 7. 2025. */
export const ADREMA_31_07_2025_TEKOCE: DhColumn = {
  balance: {
    "008": 196478,
    "014": 286043,
    "021": 28095000,
    "038": 2295434,
    "047": 6810549,
    "050": 2391587,
    "051": 2122286,
    "052": 193036,
    "058": 750000,
    "062": 75000,
    "066": 100000,
    "068": 37682679,
    "070": 667951,
    "089": 794709,
    "090": 43368,
    "093": 752429,
    "094": 1524277,
  },
  income: {
    "112": 6943659,
    "133": 8965,
    "135": 171854,
    "136": 318000,
    "137": 1065028,
    "138": 1086493,
    "140": 2757327,
    "141": 211863,
    "142": 173554,
    "143": 342121,
    "145": 140610,
    "180": 157,
    "181": 50,
  },
}

/** Prejšnje obdobje na istem obrazcu (primerjalni stolpec ob 31. 7. 2025). */
export const ADREMA_31_07_2025_PREJSNJE: DhColumn = {
  balance: {
    "008": 214027,
    "014": 409104,
    "021": 28095000,
    "038": 1634531,
    "047": 6810549,
    "050": 2637691,
    "051": 2097786,
    "052": 9762,
    "058": 750000,
    "062": 75000,
    "066": 100000,
    "068": 37631731,
    "070": 50948,
    "089": 1482920,
    "090": 73468,
    "093": 1132723,
    "094": 611660,
  },
  income: {
    "112": 11389932,
    "116": 110000,
    "119": 4194,
    "125": 701125,
    "133": 303006,
    "135": 394241,
    "136": 478000,
    "137": 2628642,
    "138": 3062303,
    "140": 4456994,
    "141": 359040,
    "142": 294132,
    "143": 477291,
    "145": 302476,
    "150": 33738,
    "162": 732956,
    "171": 58702,
    "180": 204,
    "181": 2430,
    "184": 36468,
  },
}

export const ADREMA_31_07_2025_PREJSNJI_ZAPOSLENI = 2
export const ADREMA_31_07_2025_PREJSNJI_MESECI = 12
