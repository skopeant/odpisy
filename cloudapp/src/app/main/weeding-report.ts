/** Read-only control-list exports for Alma physical items. No Alma writes. */
export type PrintOrientation = 'portrait' | 'landscape';
export interface ReportItem {
  mmsId: string;
  barcode: string;
  inventoryNumber: string;
  title: string;
  locationCode: string;
  processType: string;
  reason: string;
  valid: boolean;
  itemPid?: string;
  holdingId?: string;
  weedingNumber?: string;
  weedingDate?: string;
  author?: string;
  publicationYear?: string;
  acquisitionMethod?: string;
  callNumber?: string;
  enumeration?: string;
  inventoryDate?: string;
  inventoryPrice?: string;
  internalNote2?: string;
  isbn?: string;
  publisher?: string;
  publicationDate?: string;
  poLine?: string;
}

export interface ReportMetadata {
  documentTitle: string;
  libraryName: string;
  locationName: string;
  selectedReason: string;
  createdAt: string;
  locale: string;
}

export interface ReportLabels {
  library: string;
  location: string;
  reason: string;
  allReasons: string;
  generated: string;
  total: string;
  okCount: string;
  errCount: string;
  status: string;
  inventory: string;
  barcode: string;
  mmsId: string;
  title: string;
  workOrder: string;
  printButton: string;
}

/** Prefix spreadsheet formulas even when a leading whitespace/control character hides the formula. */
function escapeCsvCell(value: unknown): string {
  let text = String(value ?? '').replace(/\r\n?/g, '\n');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvLine(values: unknown[]): string {
  return values.map(escapeCsvCell).join(';');
}

/** UTF-8 BOM and semicolon delimiter are convenient for Czech Excel. */
export function createReportCsv(items: ReportItem[], info: ReportMetadata, labels: ReportLabels): string {
  const columns = [labels.status, labels.inventory, labels.barcode, labels.mmsId, labels.title,
    labels.reason, labels.workOrder, labels.library, labels.location];
  const rows = items.map(item => csvLine([
    item.valid ? 'OK' : 'ERR', item.inventoryNumber, item.barcode, item.mmsId,
    item.title, item.reason, item.processType, info.libraryName, info.locationName
  ]));
  return '\uFEFF' + [csvLine(columns), ...rows].join('\r\n') + '\r\n';
}

function html(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function createReportPrintHtml(items: ReportItem[], info: ReportMetadata, labels: ReportLabels, orientation: PrintOrientation = 'portrait'): string {
  const pageOrientation: PrintOrientation = orientation === 'landscape' ? 'landscape' : 'portrait';
  const ok = items.filter(x => x.valid).length;
  const err = items.length - ok;
  const rows = items.map(item => `<tr class="${item.valid ? '' : 'bad'}">
<td class="status">${item.valid ? 'OK' : 'ERR'}</td>
<td>${html(item.inventoryNumber)}</td><td>${html(item.barcode)}</td>
<td>${html(item.mmsId)}</td><td>${html(item.title)}</td><td>${html(item.reason || '—')}</td>
</tr>`).join('\n');
  return `<!doctype html><html lang="${html(info.locale)}"><head><meta charset="utf-8">
<title>${html(`odpisy-kontrola-${safeFilePart(info.libraryName.match(/\(([^)]+)\)\s*$/)?.[1]||info.libraryName)}-${safeFilePart(info.locationName.match(/\(([^)]+)\)\s*$/)?.[1]||info.locationName)}-${safeFilePart(info.selectedReason||'vsechny-duvody')}-${new Date().toISOString().slice(0,10)}`)}</title>
<style>
@page { size: A4 ${pageOrientation}; margin: 10mm; }
body { margin: 0; color: #141414; font-family: Arial, Helvetica, sans-serif; font-size: ${pageOrientation === 'portrait' ? '8pt' : '9pt'}; }
h1 { font-size: 16pt; margin: 0 0 4mm; }
.meta { margin-bottom: 3mm; font-size: 9pt; line-height: 1.5; }
.summary { margin: 3mm 0 5mm; font-weight: bold; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
thead { display: table-header-group; }
th { text-align: left; background: #eeeeee; font-size: 8pt; }
th, td { border: 1px solid #888; padding: 1.2mm 1.3mm; overflow-wrap: anywhere; vertical-align: top; }
tr { page-break-inside: avoid; break-inside: avoid; }
.bad td:first-child { font-weight: bold; }
.status { font-weight: bold; white-space: nowrap; }
th:nth-child(1) { width: 6%; } th:nth-child(2) { width: 14%; }
th:nth-child(3) { width: 16%; } th:nth-child(4) { width: 18%; }
th:nth-child(5) { width: 30%; } th:nth-child(6) { width: 16%; }
/* Same separate-window print preview pattern as Physical Items List. */
.screen-only { position: sticky; top: 0; z-index: 10; margin: 0 0 6mm;
  text-align: right; background: white; padding: 4mm; }
.screen-only button { font: inherit; font-size: 10pt; padding: 7px 18px;
  border: 1px solid #777; border-radius: 4px; background: #f5f5f5; cursor: pointer; }
.screen-only button:hover { background: #e9e9e9; }
@media screen { body { padding: 16px; } }
@media print { .screen-only { display: none !important; } }
</style></head><body>
<div class="screen-only"><button id="print-button" type="button">${html(labels.printButton)}</button></div>
<h1>${html(info.documentTitle)}</h1>
<div class="meta"><b>${html(labels.library)}:</b> ${html(info.libraryName)} &nbsp; | &nbsp; <b>${html(labels.location)}:</b> ${html(info.locationName)}<br>
<b>${html(labels.reason)}:</b> ${html(info.selectedReason || labels.allReasons)} &nbsp; | &nbsp; <b>${html(labels.generated)}:</b> ${html(info.createdAt)}</div>
<div class="summary">${html(labels.total)}: ${items.length} &nbsp; | &nbsp; ${html(labels.okCount)}: ${ok} &nbsp; | &nbsp; ${html(labels.errCount)}: ${err}</div>
<table><thead><tr><th>${html(labels.status)}</th><th>${html(labels.inventory)}</th><th>${html(labels.barcode)}</th>
<th>${html(labels.mmsId)}</th><th>${html(labels.title)}</th><th>${html(labels.reason)}</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;
}

export function safeFilePart(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'all';
}

/** Stable natural-number ordering for historical weeding reports. Job allocation order is not changed. */
export type WithdrawalSort = 'weeding' | 'inventory';
export function sortWithdrawalItems(items:ReportItem[],sort:WithdrawalSort='weeding'):ReportItem[]{
  const field=(x:ReportItem)=>sort==='inventory'?x.inventoryNumber:x.weedingNumber;
  return [...items].sort((a,b)=>String(field(a)||'').localeCompare(String(field(b)||''),'cs',{numeric:true,sensitivity:'base'})
    ||String(a.itemPid||'').localeCompare(String(b.itemPid||'')));
}
/** Final list is intentionally separate from the control report. */
export function createWithdrawalCsv(items: ReportItem[], sort:WithdrawalSort='weeding'): string {
  const header = ['Úbytkové číslo / Weeding no.', 'Datum odpisu / Date', 'Důvod / Reason',
    'Přírůstkové číslo / Inventory', 'MMS ID', 'Způsob nabytí / Acquisition', 'Autor / Author',
    'Název / Title', 'Rok / Year', 'Čárový kód / Barcode', 'Signatura / Call no.', 'Svazek / Enumeration',
    'Datum přírůstku / Inventory date', 'Cena / Price', 'ISBN', 'Nakladatel / Publisher', 'Objednávka / PO line'];
  const rows = sortWithdrawalItems(items,sort).map(x => csvLine([x.weedingNumber, x.weedingDate, x.reason, x.inventoryNumber,
    x.mmsId, x.acquisitionMethod, x.author, x.title, x.publicationYear, x.barcode, x.callNumber, x.enumeration,
    x.inventoryDate, x.inventoryPrice, x.isbn, x.publisher, x.poLine]));
  return '\uFEFF' + [csvLine(header), ...rows].join('\r\n') + '\r\n';
}

/** Historical withdrawal report in the same compact per-item layout as the accession list.
 * No item data is invented: absent API values are shown as a dash.
 * The print title is also used by Edge when offering Save as PDF.
 */
export function createWithdrawalPrintHtml(items: ReportItem[], info: ReportMetadata, orientation: PrintOrientation, sort:WithdrawalSort='weeding'): string {
  const ordered=sortWithdrawalItems(items,sort);
  const display=(value:unknown)=>html(String(value??'').trim()||'—');
  const date=(value:unknown)=>{
    const input=String(value??'').trim();
    const match=input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match?`${match[3]}.${match[2]}.${match[1]}`:input;
  };
  const shortDate=(value:unknown)=>display(date(value));
  const pageTitle=`ubytkovy-seznam-${safeFilePart(info.libraryName.match(/\(([^)]+)\)\s*$/)?.[1]||info.libraryName)}-${safeFilePart(info.locationName.match(/\(([^)]+)\)\s*$/)?.[1]||info.locationName)}-${safeFilePart(info.selectedReason||'vsechny-duvody')}-${new Date().toISOString().slice(0,10)}`;
  const first=ordered[0]?.weedingNumber||ordered[0]?.inventoryNumber||'';
  const last=ordered[ordered.length-1]?.weedingNumber||ordered[ordered.length-1]?.inventoryNumber||'';
  const entries=ordered.map(item=>`<article class="entry">
<div class="entry-left">
  <div class="entry-heading"><strong>${display(item.weedingNumber)}</strong><span>${display(info.locationName)}</span></div>
  <div class="bibliography">${display(item.title)}${item.author?` / ${display(item.author)}`:''}${item.publisher?` – ${display(item.publisher)}`:''}${item.publicationDate||item.publicationYear?` (${display(item.publicationDate||item.publicationYear)})`:''}${item.isbn?` – ISBN ${display(item.isbn)}`:''}</div>
  <div class="item-line"><b>Čárový kód:</b> ${display(item.barcode)}${item.callNumber?` &nbsp; <b>Signatura:</b> ${display(item.callNumber)}`:''}${item.enumeration?` &nbsp; <b>Svazek:</b> ${display(item.enumeration)}`:''}</div>
</div>
<div class="entry-right">
  <div><b>Přírůstkové číslo:</b> ${display(item.inventoryNumber)}</div>
  <div><b>Datum odpisu:</b> ${shortDate(item.weedingDate)}</div>
  <div><b>Důvod odpisu:</b> ${display(item.reason)}</div>
  <div><b>MMS ID:</b> ${display(item.mmsId)}</div>
  <div><b>Datum přírůstku:</b> ${shortDate(item.inventoryDate)}</div>
  <div><b>Způsob nabytí:</b> ${display(item.acquisitionMethod)}</div>
  <div><b>Cena:</b> ${display(item.inventoryPrice)}</div>
  ${item.poLine?`<div><b>Objednávka:</b> ${display(item.poLine)}</div>`:''}
</div>
</article>`).join('');
  return `<!doctype html><html lang="${html(info.locale)}"><head><meta charset="utf-8"><title>${html(pageTitle)}</title>
<style>
@page{size:A4 ${orientation};margin:12mm 13mm}
*{box-sizing:border-box}
body{font:9pt Arial,Helvetica,sans-serif;color:#111;margin:0}
header{border-bottom:1px solid #555;padding-bottom:3mm;margin-bottom:2mm}
.header-line{display:flex;align-items:flex-start;justify-content:space-between;gap:15px}
h1{font-size:18pt;margin:0 0 1.5mm;line-height:1.1}
.subtitle{font-size:9pt}
.range{text-align:right;font-size:8pt;white-space:nowrap}
.meta{font-size:8pt;margin:2.5mm 0 4mm;line-height:1.45}
.entry{display:grid;grid-template-columns:minmax(0,65%) minmax(0,35%);column-gap:6mm;border-bottom:1px solid #aaa;padding:3mm 0;break-inside:avoid;page-break-inside:avoid}
.entry-left,.entry-right{min-width:0}
.entry-heading{display:flex;gap:4mm;align-items:baseline;justify-content:space-between;font-size:13pt;margin-bottom:1mm;overflow-wrap:anywhere}
.entry-heading span{font-size:7.3pt;text-align:right;font-weight:600}
.bibliography{line-height:1.35;overflow-wrap:break-word}
.item-line{font-size:8pt;margin-top:1.7mm;line-height:1.35;overflow-wrap:break-word}
.entry-right{font-size:7.8pt;line-height:1.4;overflow-wrap:anywhere}
.entry-right b{font-weight:600}
.toolbar{margin-bottom:8mm;text-align:right}
.toolbar button{padding:8px 20px;border:1px solid #666;background:#f4f4f4;cursor:pointer}
@media screen{body{max-width:1100px;padding:15px;margin:auto}}
@media print{.toolbar{display:none}}
</style></head><body><div class="toolbar"><button id="print-button" type="button">Tisk / Print</button></div>
<header><div class="header-line"><div><h1>Úbytkový seznam</h1><div class="subtitle">${display(info.libraryName)}</div></div><div class="range">${display(first)}${last&&last!==first?' – '+display(last):''}<br>${ordered.length} jednotek</div></div></header>
<div class="meta"><b>Původní sbírka:</b> ${display(info.locationName)} &nbsp; | &nbsp; <b>Důvod odpisu:</b> ${display(info.selectedReason||'všechny')} &nbsp; | &nbsp; <b>Vygenerováno:</b> ${display(info.createdAt)}</div>
<main>${entries}</main></body></html>`;
}
