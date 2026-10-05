/**
 * GRAFAM d.o.o., bruto bilanca 1. 1. 2026–31. 8. 2026.
 * Zneski so v centih. Stanje 31. 8. 2026 je zaključni saldo,
 * stanje 31. 12. 2025 je otvoritveni saldo.
 * Čisti dobiček obdobja še ni zaprt v razred 9, zato je v bilanci na AOP 070.
 */

export const grafam = {
  company: "GRAFAM d.o.o.",
  period: "1. 1. 2026–31. 8. 2026",
  currentDate: "31. 8. 2026",
  previousDate: "31. 12. 2025",
  balance: {
    current: {
      "014": 9_633_155,
      "050": 2_478_776,
      "051": 1_150_714,
      "052": 4_235_881,
      "053": 1_849_805,
      "058": 852_400,
      "062": 85_240,
      "068": 6_101_985,
      "070": 975_862,
      "088": 5_500_000,
      "093": 1_101_594,
      "094": 4_731_250,
    },
    previous: {
      "014": 7_733_338,
      "050": 4_157_587,
      "051": 1_253_091,
      "052": 3_540_469,
      "053": 1_849_805,
      "058": 852_400,
      "062": 85_240,
      "068": 6_101_985,
      "088": 5_500_000,
      "093": 1_199_686,
      "094": 4_794_979,
    },
  },
  income: {
    "112": 29_112_327,
    "124": 1_420_475,
    "131": 6_581_262,
    "132": 1_436_284,
    "135": 145_000,
    "136": 35_400,
    "137": 99_716,
    "138": 3_648_655,
    "140": 12_817_003,
    "141": 1_152_059,
    "142": 1_073_950,
    "143": 2_068_050,
    "145": 430_183,
    "150": 25_510,
    "167": 1_580,
    "171": 43_731,
    "173": 57,
    "176": 449,
    "180": 369,
  },
} as const

export const mappingNotes = [
  "Oprema (040) in druga opredmetena osnovna sredstva (045), zmanjšana za popravek vrednosti (050), sta na AOP 014.",
  "Posojili lastnikov na kontu 270 sta na AOP 088, ker sta v kontnem načrtu vodeni kot posojili družb v skupini.",
  "Debetni saldo konta 275 (73,50 €) je med terjatvami na AOP 051. Enako odprti debetni saldo konta 221 (72,00 €) na dan 31. 12. 2025.",
  "Izguba na kontu 933 je pokrita s prenesnim dobičkom na kontih 930 in 932. AOP 068 je zato neto znesek.",
  "Zamudne obresti do dobaviteljev (konto 450) so finančni odhodek AOP 176.",
  "Delodajalčevi prispevki 8,85 % so na AOP 141, preostanek na AOP 142.",
  "Davek iz dobička za to obdobje ni knjižen. Obveznost na kontu 264 je ostanek preteklih let in je med drugimi kratkoročnimi obveznostmi.",
  "Primerjalnega izkaza poslovnega izida bruto bilanca nima: razreda 4 in 7 sta bila na začetku leta zaprta.",
  "Čisti dobiček osmih mesecev še ni zaprt v razred 9. V bilanci stanja je na AOP 070, da se stranici ujemata.",
]
