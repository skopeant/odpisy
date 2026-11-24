# Alma Odpisy – Weeding

**Česky** | [English](README.md)

**Aktuální verze: 1.0.1 (24. 11. 2026).**

Cloud App pro řízené úbytkování fyzických jednotek v Ex Libris Alma. Podporuje více knihoven, samostatné mapování sbírek a úbytkových řad, pevné sety, historii jobů, tisk a CSV.

## Čtyři záložky

1. **Úbytkování** – knihovna a původní sbírka; vyhledání jednotek ve `WdrWO` s vyplněnou Statistickou poznámkou 2. Kontrola povoleného důvodu, prázdného úbytkového čísla a data. Pro každý důvod se vytvoří pevný `ITEMIZED` set a hromadným jobem se přidělí číslo a datum.
2. **Odepsání** – hromadný job na původním setu převede work order `WdrWO` → `DlWO` s použitím nakonfigurovaného oddělení.
3. **Přesun** – samostatný job mění pouze trvalou lokaci, nikoli úbytkové číslo a datum.
4. **Historie** – stavy jednotlivých fází, chyby, filtrování podle knihovny, sbírky, důvodu a data odpisu, tisk a CSV.

Aplikace kontroluje členství setu a stav jednotek před zápisem i po něm. **Neopakuje automaticky job**, jehož výsledek není jistý. Úspěch a chyby v monitoru rozlišuje zelený a červený podklad.

## Novinky ve verzi 1.0.1

- **Tisk Úbytkového seznamu:** úbytkové číslo je hlavním údajem vlevo, větším písmem a bez popisku. Přírůstkové číslo je vpravo, menším písmem a s popiskem „Přírůstkové číslo“.
- **Oprava neúspěšného spuštění jobu:** při uloženém stavu `post_maybe_sent` bez ID instance lze po nezávislém ověření v Alma Monitor Jobs a opsání přesného názvu setu ukončit pouze nedokončený stav aplikace. Diagnostika se uchová v uživatelském záznamu; žádný job se neopakuje a jednotky ani sety se nemění.
- **Pozor:** potvrzení názvu setu nenahrazuje kontrolu v Alma Monitor Jobs. Pokud nelze bezpečně ověřit, že job nevznikl nebo neběží, pokus neukončujte. Původní příčina autorizační chyby nebyla dosud potvrzena.

## Role a oprávnění

Cloud App využívá oprávnění aktuálně přihlášeného uživatele Almy, ne vlastní osobní API klíč.

- **Konfigurace:** přístup ke konfigurační stránce má `General System Administrator`.
- **Job Change Physical Items Information:** Ex Libris uvádí `Repository Manager`, `Repository Administrator`, `Physical Inventory Operator` nebo `Physical Inventory Operator - Limited` s institucionálním rozsahem. **Nejde o potvrzenou minimální kombinaci pro celou aplikaci**: práce se sety a jejich metadaty může vyžadovat další oprávnění.
- **Volitelné akviziční údaje:** při zapnutí způsobu nabytí z objednávkového řádku mohou být nutná akviziční oprávnění. Ve výchozím stavu je tato funkce vypnutá.

Minimální kombinace rolí není definitivně potvrzena. V PSB byly úspěšné i neúspěšné uživatelské testy; konkrétní příčina odmítnutého spuštění jobu zůstává otevřená.

## Nastavení a použití

Nastavují se konkrétní knihovny, sbírky, cílové lokace, úbytkové řady, příslušná oddělení a povolené důvody. Počet knihoven není napevno omezen.

Datum odpisu v Historii pochází z metadat setu; pokud tam není, použije se datum vytvoření setu. Filtrování historie nevyžaduje čtení detailů jednotek.

Lokální příkazy po inicializaci Ex Libris CLI:

```sh
eca init
eca start
eca build
```

U staršího RC3 správce potvrdil úspěšné `eca build` i `eca start`. Verze 1.0.1 vyžaduje vlastní sestavení a provozní ověření v PSB.

[Vydání 1.0.1 a kontrolní postup](RELEASE-1.0.1.md) · [Seznam změn](CHANGELOG.md)

Podpora a hlášení chyb: https://github.com/skopeant/odpisy/issues

Licence MIT.
