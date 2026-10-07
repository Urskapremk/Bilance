# Bilance

Vhod je landing [Hnatura](https://hnatura.app). **Bilance** so v razdelku Računovodski servis in peljejo na [bilance.hnatura.app](https://bilance.hnatura.app).

Bilanca stanja in izkaz poslovnega izida sta v istem vizualnem jeziku: belo ozadje, mornarsko modra, zlata in serifni naslovi.

Prvi prikaz je **GRAFAM d.o.o.** za obdobje 1. 1. 2026–31. 8. 2026. Bilanca stanja in izkaz poslovnega izida kažeta samo tekoče leto. Obrazec je vedno poleg izvorne bruto bilance. Vsaka stranka dobi svojo bazo v brskalniku. Vanjo se zapišejo naziv, zadnja bruto bilanca, formule kontov in shranjena obdobja, zato ostanejo tudi po posodobitvi programa. Z **Dodaj PDF** naložite nov izpis bruto bilance (konti in osem stolpcev zneskov) za izbrano stranko. Ob osvežitvi strani se odpre zadnja bilanca, ki je bila odprta. Bilanca stanja vedno pokaže, ali so sredstva in obveznosti do virov usklajeni. Ob postavki lahko date kljukico za lastno kontrolo. Kljukica ostane tudi po osvežitvi. Po branju se najprej pokaže bilanca. Pravila za konte določite sami z gumbom **Pravila**, ko obrazec vidite. Predlog je že vpisan; spremenite izjeme, na primer konto 9831 na AOP 090. Ko spremenite formulo, program vpraša, ali jo upošteva v tekoči bilanci. Po potrditvi se pravilo vpiše v obrazec. Znesek tekočega leta lahko popravite tudi neposredno v vrstici obrazca; seštevki se osvežijo takoj. Enako velja za shranjeno obdobje: popravek se zapiše v to obdobje in ostane po osvežitvi. Obdobje bilance vpišete v polji Od in Do, tudi ko PDF zajema daljše obdobje. Gumb Shrani je pri odprti bilanci stranke in zapiše obrazec, takšen kot je na zaslonu. **Zapomni si za stranko** shrani pravila te stranke. Naslednja bruto bilanca iste stranke uporabi shranjena pravila. **Pravila** odpre okno »Kam gre konto?«. Naslov primete in okno premaknete, da spodaj vidite bilanco. **Nova stranka** je na istem mestu: vpišete naziv, izberete pravno obliko in dodate njeno bruto bilanco. Oblika je d.o.o., društvo, zavod ali samostojni podjetnik. Pri samostojnem podjetniku je kapital podjetnikov: začetni kapital, prenosi stvarnega premoženja, pritoki in odtoki ter podjetnikov dohodek. Društvo ima društveni sklad, zavod lastne vire. d.o.o. ostane na obrazcu gospodarske družbe. Ime z oznako d.o.o., društvo, zavod ali s.p. predlaga obliko; pri osebnem imenu jo izberete sami. Izbrana oblika ostane pri stranki. Na odprti bilanci jo lahko zamenjate, pa se postavke znova razporedijo. Pri samostojnem podjetniku gumb **Kartica eDavkov** prebere knjigovodsko kartico eDavkov in sestavi obračune prispevkov po kontih za vseh dvanajst mesecev leta. Seštevek se vpiše na AOP 148a, Prispevki za socialno varnost podjetnika. Gumb **Obračun davka** prebere obračun dohodnine normiranca: prihodki na izkazu so enaki obračunu, davčno priznani stroški so 80 % prihodkov. Sestavljeni so iz prispevkov s kartice, 20 % preostanka so stroški materiala, ostanek so drugi stroški storitev. Ta izpis postane osnova za bilanco stanja in izkaz poslovnega izida po obrazcu AJPES za izbrano obliko. Najprej pregledate bilanco. Ko je v redu, **Shrani** vpraša, ali se obdobje zapiše. Shrani se izvorni PDF ter bilanca stanja in izkaz poslovnega izida, pod stranko, za katero je bilanca. Zneski so v evrih, s centi.

Pod naslovom izberete **Presečni izkazi**, **Izkazi** ali vpišete svoj napis. Izbrani napis je na zaslonu, na izpisu in v PDF. **Natisni** odpre sistemsko okno za tisk. **Kreiraj PDF** prenese datoteko istega obrazca: mornarsko modra glava, zlati AOP in postavke tekočega leta. Izpis se razporedi na več strani. Spodaj izberete podpis: Nejc Zupanc, računovodja, Matic Premk ali Urška Premk. Izbrani podpis je na izpisu in v PDF-ju.

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
