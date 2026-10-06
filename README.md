# Bilance

Vhod je landing [Hnatura](https://hnatura.app). **Bilance** so v razdelku Računovodski servis in peljejo na [bilance.hnatura.app](https://bilance.hnatura.app).

Bilanca stanja in izkaz poslovnega izida sta v istem vizualnem jeziku: belo ozadje, mornarsko modra, zlata in serifni naslovi.

Prvi prikaz je **GRAFAM d.o.o.** za obdobje 1. 1. 2026–31. 8. 2026. Bilanca stanja in izkaz poslovnega izida kažeta samo tekoče leto. Obrazec je vedno poleg izvorne bruto bilance. Vsaka stranka dobi svojo bazo v brskalniku. Vanjo se zapišejo naziv, zadnja bruto bilanca, formule kontov in shranjena obdobja, zato ostanejo tudi po posodobitvi programa. Z **Dodaj PDF** naložite nov izpis bruto bilance (konti in osem stolpcev zneskov) za izbrano stranko. Po branju program vpraša, v kateri AOP gre vsak konto z zneskom. Predlog je že izpolnjen; spremenite izjeme, na primer konto 9831 na AOP 090. Popravek se takoj pokaže na bilanci stanja in izkazu poslovnega izida. Znesek tekočega leta lahko popravite tudi neposredno v vrstici obrazca; seštevki se osvežijo takoj. **Zapomni si za stranko** shrani formule te stranke. Naslednja bruto bilanca iste stranke vpraša samo za konte, ki jih še ni v formulah. **Formule** odpre shranjeni zemljevid. **Nova stranka** je na istem mestu: vpišete naziv in dodate njeno bruto bilanco, iz katere se sestavi nova bilanca. Ta izpis postane osnova za bilanco stanja in izkaz poslovnega izida po poenotenem obrazcu AJPES. Najprej pregledate bilanco. Ko je v redu, **Shrani** vpraša, ali se obdobje zapiše. Shrani se izvorni PDF ter bilanca stanja in izkaz poslovnega izida, pod stranko, za katero je bilanca. Zneski so v evrih, s centi.

**Natisni** odpre sistemsko okno za tisk. **Kreiraj PDF** prenese datoteko istega obrazca: mornarsko modra glava, zlati AOP, serifni naslovi. Zaslon, tisk in PDF so isti obrazec na pokončnem A4. Izpis ohrani razmake z zaslona in se razporedi na več strani.

## Zagon

```bash
npm install
npm run dev
```

Aplikacija posluša na [http://127.0.0.1:43123](http://127.0.0.1:43123) in na `localhost`, na IPv4 in IPv6.

Preverjanje seštevkov:

```bash
npm test
```
