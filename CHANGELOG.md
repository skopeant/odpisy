## 1.0.1 (2026-11-24)

- Tisk Úbytkového seznamu: úbytkové číslo výrazně vlevo bez popisku; přírůstkové číslo vpravo menším písmem s popiskem „Přírůstkové číslo“. CSV a kontrolní tisk beze změny.
- Při `post_maybe_sent` bez instance jobu lze po ručním ověření v Monitor Jobs a opsání přesného názvu setu ukončit pouze uložený stav aplikace.
- Uvolněný pokus se zaznamená do uživatelské diagnostiky `abandonedOperations` (max. 50), bez opakování API POST a bez změny setů či jednotek.
- Původní autorizační chyba Jobs API dosud není vysvětlena; tato verze opravuje následné zaseknutí uživatelského workflow. Ověřit v PSB.

## 1.0.0 RC4 (2026-11-19)

- Opraveny CZ/EN úvodní texty záložky Odepsání: pouze hromadný job, ne Scan-in.
- Stav cílového oddělení se zobrazuje až po výběru knihovny a původní sbírky.
- Pokud není pro vybranou knihovnu oddělení nastaveno, zobrazí se konkrétní upozornění.
- Žádná změna API volání, bezpečnostních kontrol nebo zápisových jobů.

## 1.0.0 – publikační dokumentace (2026-11-19)

- Přepracována README (CZ/EN), doplněny role do manifestu a nápověda.
- Připraven text do App Center a kontrolní seznam vydání.
- Starší vývojové poznámky archivovány pod docs/development-history.
- Beze změny zápisových API volání, jobů a bezpečnostních kontrol.

## 1.0.0 RC3 (2026-11-19)
- První záložka Úbytkování: úvod, knihovna, sbírka a Načíst jsou sjednoceny do stejného orámovaného panelu jako Odepsání a Přesun. Žádná změna API ani workflow.

## 1.0.0 (2026-11-19)

- Oprava přetékání dlouhých názvů knihoven, lokací a oddělení v hlavním rozhraní a konfiguraci; responzivní šířka prvků.
- Čtyři záložky: Úbytkování, Odepsání, Přesun, Historie.
- Ponechány bezpečnostní kontroly fyzických jednotek, etapové joby, metadata setů a historie.
- Volitelné dodatečné čtení PO Line pro způsob nabytí; ve výchozím stavu vypnuto.
- Návrh vydání; publikování až po testu v PSB a úspěšném `eca build`.

## 0.2.0-beta.18 (2026-11-19)

- Průběh zpracování nyní barevně zvýrazňuje výsledek operace.
- Při stavu complete bez chyb je panel zelený.
- Při stavu failed nebo při chybě uložené v monitoru je panel červený.
- Rozpracovaný job zůstává bez barevného zvýraznění.

## 0.2.0-beta.17 (2026-11-19)
- Historie: datum odpisu z metadat setu, fallback na datum vytvoření setu v názvu. Bez čtení jednotlivých jednotek pro datumový filtr.
- Datum z názvu je v UI výslovně označeno jako náhradní.

## 0.2.0-beta.10 (2026-11-18)
- Source set selection verified by Alma Set ID and persisted source metadata; historical report reset on selection and linked to exact Set ID.
- Compatible with completed 16-unit PSB batch without repeating first M18.

## 0.2.0-beta.5 – Alma Sets API místo SRU (PSB test pending)
- Všechny tři načítací operace nyní používají pomocný LOGICAL ITEM set: `permanentPhysicalLocation`, `statisticsNote2 NOT_EMPTY`, `inProcessType`.
- Dříve ověřený dotaz v PowerShellu v12: 18/18 shodných item PID v PSB DKD/55130/WdrWO.
- Členství pomocného setu se načítá stránkovaně; každé item PID se ověří vůči REST item a platnému důvodu, až pak lze vytvořit ITEMIZED set po důvodech pro M18.
- Pomocný logický set se po načtení pokusí odstranit; neúspěch úklidu blokuje výběr a uvádí Set ID k ručnímu prověření.
- SRU odstraněno z kódu, konfigurace, importu/exportu i UI. Starší konfigurace se importují bez historických SRU tajemství.
- Počet knihoven zůstává dynamický, úbytkové řady dle knihoven a oddělení M18 v mapování.
- Neověřeno: běh nové implementace v Cloud App/PSB; zápisy zatím nepovolovat.

## 0.2.0-beta.1 – 16. 11. 2026 (testovací sestavení)

- Doplňuje M18 přidělení úbytkového čísla a data, Scan-in WdrWO → DlWO, M18 přesun pouze permanentní lokace.
- Oddělené šablony M18 odvozené z ověřených průvodců Almy (174 vs. 173 parametrů); přesun nemění úbytková čísla, data ani další pole.
- Dynamický počet knihoven; institučně editovatelné názvy řad, cílové sbírky a pulty/oddělení; migrace JSON v1/v2 → v3.
- Bezpečnost: zápisy defaultně vypnuté, potvrzování, ověření prostředí, stav jobu, kontrola jednotek, ochrana proti opakování nejistého POST.
- Úbytkový seznam CSV/tisk z historické sady, per-user evidence právě probíhající operace.
- Staticky otestováno; plný ECA build a živý běh Cloud App v PSB zatím neověřen.

## 0.1.13 TEST – 2026-11-14
- Fixed NG8002 Angular template compilation failure on print orientation selector: use `[attr.aria-label]` instead of interpolated `aria-label`.
- No changes to read-only operations, SRU/REST retrieval, configuration, print layout, or CSV export.

## 0.1.12 TEST – 2026-11-14
- Printing uses the established separate-window preview with explicit Print button (from 0.1.11).
- A4 **portrait is the default**; users can switch to A4 landscape in the Cloud App before opening the print preview.
- Compact portrait column sizing for large control lists (tested with generated 2,000 rows).
- Labels explicitly distinguish the pre-weeding **control list** from the future **final weeding register** produced after assigning actual Weeding Numbers and dates.
- No changes to read-only validation, CSV data, REST/SRU retrieval, or configuration. No Alma writes.

## 0.1.11 TEST – 2026-11-14
- Replaced hidden-iframe automatic printing with the **proven print-preview window** from our Physical Items List and Accession List Cloud Apps.
- The print preview opens from the user click, shows a dedicated Print button, and allows printing or Save as PDF through the browser.
- The A4 landscape report still includes the entire selected scope (not just the current 50-item preview page), with repeatable table headings and OK/ERR markers.
- Added CS/EN messages for blocked popups and successful preview opening.
- No change to CSV export, Alma REST/SRU retrieval, settings or data mutation: this version is still read-only.

## 0.1.10 TEST – 2026-11-14
- Read-only review shows compact **OK / ERR** statuses and total, OK and ERR counts.
- Paginated narrow-panel item preview (50 per page); changing a reason resets the page.
- Export a UTF-8 BOM, Excel-friendly semicolon CSV for the complete current selection (not merely the page).
- Print a complete A4 landscape control list through a hidden iframe; all records are included even if the batch is blocked.
- Control list includes inventory number, barcode, MMS ID, title, reason and state.
- Added REST item pagination (`limit=100&offset=...`); Alma API supports it. Up to four MMS requests proceed concurrently.
- Incomplete REST responses or API errors invalidate the batch and block exporting partial data.
- Reset stale results when changing library or location.
- CS/EN strings for all new controls; no PUT, POST, Scan Items or job execution.

# 0.1.9 TEST

- Fixed Work Order detection: Alma exposes `process_type=WORK_ORDER_DEPARTMENT` and the institution-specific Work Order code in `work_order_type.value`.
- Weeding filter now matches `work_order_type.value=WdrWO`; display uses `work_order_type.desc`.

## 0.1.8-test

- Work Order filtering now uses stable Alma `process_type.value` codes only, not translated descriptions.
- Default codes: `WdrWO` = Vyřazování / Weeding, `DlWO` = Odepsáno / Written off.
- Legacy saved values `Vyřazování` and `Odepsáno` are migrated automatically when configuration is loaded or imported.
- Configuration labels now explicitly ask for Work Order codes.

# Changelog

## 0.1.7-test
- Oprava SRU generic proxy podle funkčního Přírůstkového seznamu: `X-Proxy-Host` používá `target.host` (bez schématu).
- Při chybě proxy/SRU se nyní zobrazí i text odpovědi serveru, pokud je k dispozici.

## 0.1.6 TEST
- Fixed packaging error: removed stale package-lock.json from SDK 2.0.2.
- ECA dependencies pinned to 2.1.0.
- Added npm override `piscina=4.9.4` to avoid the critical advisory affecting older 4.x versions.
- Keep local `config.json` when replacing the test package.

## 0.1.5 - 2026-11-13
- Oprava generic proxy pro autentizované SRU: `X-Proxy-Host` nyní používá celý origin (`https://host`) místo samotného hostname.
- Beze změny read-only režimu odpisu.

# Changelog

## 0.1.4 TEST
- Opraveno autentizované SRU podle referenční aplikace Přírůstkový seznam: SRU URL, uživatel a heslo, Ex Libris generic Cloud App proxy.
- SRU přihlašovací údaje jsou součástí institucionální konfigurace a importu/exportu (configVersion 2; import verze 1 zůstává podporován).
- Opraven název aplikace na „Odpisy – Weeding“ v obou manifestech.
- Nové logo OS místo převzatého PS.

# 0.1.3 TEST

- Corrected DKD withdrawal location code from `8999` to `89999`.
- Added CTU default withdrawal-location mappings: `ARCH=A99`, `DKD=89999`, `UBMI=U99`, `FD=69999`, `FJFI=49999`.
- Kept all mappings editable in institutional configuration.

## 2.5.0

- Added a selectable source: **SRU** or **Alma Analytics**.
- **SRU is now the default source**, so institutions do not need to create a dedicated Analytics report.
- Added automatic discovery of the institution's Inventory Number SRU index via SRU Explain.
- Added authenticated SRU support through the Ex Libris generic Cloud App proxy using `X-Proxy-Auth`.
- SRU range searches use each complete requested inventory number with a trailing `*`, batched with `OR`.
- Exact requested inventory numbers are verified through the Alma REST API after SRU retrieval.
- Analytics remains available as an alternative and keeps the existing prompted-report workflow.
- Existing REST-based item, bibliographic and acquisition enrichment is retained.
- Browser print workflow remains unchanged.

## 2.4.1

- Changed the application title to the bilingual form **Přírůstkový seznam – Accession List**.
- Replaced generated/downloaded PDF output with a browser print preview using the standard **Print** button; the browser dialog can still save as PDF.
- Landscape/portrait selection and 10 records per page are preserved.

## [2.4.0] - 2026-09-09

### Added
- Added a PDF format selector with A4 landscape and A4 portrait output.
- Added a compact portrait layout inspired by the previous accession-list print format.

### Changed
- In the landscape table, moved `Popisné údaje` directly after `Přír. číslo`.
- Portrait output keeps all acquisition fields while using a compact record-by-record layout.
- PDF filenames now indicate whether the output is `na-sirku` or `na-vysku`.

### Notes
- In portrait PDF layout, widened the `Signatura` area so longer call numbers fit more reliably within the printable page width.
- Both landscape and portrait PDF layouts use 10 records per A4 page.
- Journal/serial descriptions continue to include the item description and ISSN from MARC 022 when available.
- Data retrieval, Analytics configuration, institution restriction and application language were not changed.

## [2.3.0] - 2026-09-09

### Changed
- Added English and Czech localized metadata for the Cloud App title, subtitle, and description.
- Standardized package name and package description.
- Added full English and Czech README documentation.
- Updated the documented application version to 2.3.0.
- Kept the application license consistently under MIT.

### Notes
- No functional changes were made to accession-list generation or PDF output.

## [2.2.0] - 2026-09-08

### Changed
- Restricted the Cloud App to Czech Technical University in Prague.
- Changed the Cloud App ID to `skopeant/prirustkovy-seznam`.
- Updated repository and license references.
- Updated package metadata to version 2.2.0.
- Added a `tar` 7.5.22 override for dependency security.
- Documented the Analytics Administrator requirement.

### Verified
- Production build verified with ECA.

## [2.1.0] - 2026-09-08

### Added
- Inventory number range search.
- Institution-configured Alma Analytics report.
- Bibliographic, item and acquisition data retrieval.
- PDF generation.
- Institution-wide configuration.

## 0.1.1
- Přidán export institucionální konfigurace do verzovaného JSON.
- Přidán import JSON s validací; importované hodnoty se uloží až po potvrzení tlačítkem Uložit nastavení.

## 0.1.2 TEST
- Bilingual application title is always shown as `Odpisy – Weeding`.
- Added a visible sticky Back to app button at the top of Settings.
- Replaced raw withdrawal-location text mapping with Alma library/location selectors.
- Added known default mapping `DKD=8999` (Odpisy DKD); no unknown library mappings are invented.
- Updated Ex Libris Cloud App dependencies in package.json to 2.1.0.

## 0.2.0-beta.7 (18. 11. 2026)
- Automatický zápis ověřených fází M18 (weeding/wo/move) do interní poznámky původního ITEMIZED setu; bezpečný retry pouze metadat.
- Čitelné zobrazení stavu 1/3–3/3 ve workflow a historii, s instancí M18 a počtem jednotek.
- Filtrování zdrojových setů podle původní knihovny a lokace.
- CSV závěrečné kontroly přesunu po validaci všech jednotek.
- Strukturovaná identita původní knihovny, lokace a důvodu v popisu nových setů; zpětná kompatibilita starších názvů.

## 0.2.0-beta.16 (2026-11-19)
- Historie filtrována podle skutečného data odpisu z Almy, ne podle časového razítka setu.
- Datum ověřeného úbytkování se uchovává v poznámce setu; fallback pro starší sety.
- Přísnější validace mapování úbytkové řady ke knihovně; skutečnou existenci řady veřejné API neumí ověřit.
