import { Component, OnDestroy } from '@angular/core';
import { CloudAppConfigService, CloudAppEventsService, CloudAppRestService, CloudAppSettingsService } from '@exlibris/exl-cloudapp-angular-lib';
import { TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { createReportCsv, createReportPrintHtml, createWithdrawalCsv, createWithdrawalPrintHtml, ReportItem, ReportLabels, ReportMetadata, PrintOrientation, WithdrawalSort, safeFilePart } from './weeding-report';
import { WeedingAlmaApi, OperationState, createNumberPayload, createMovePayload, createWoPayload } from './weeding-workflow';

interface Choice { value:string; desc:string; }
interface WithdrawalMapping { libraryCode:string; libraryDesc:string; locationCode:string; locationDesc:string;
  sequenceName:string; scanMode:'circ_desk'|'department'; scanCode:string; woDepartmentId:string; }
interface AppConfigExport { configVersion:number; app:string; exportedAt:string;
  institution:string; environment:string; settings:any; }

@Component({selector:'app-main',templateUrl:'./main.component.html',styleUrls:['./main.component.scss']})
export class MainComponent implements OnDestroy {
  tab:'weeding'|'done'|'move'|'history'='weeding'; loading=false; loaded=false; error=''; message=''; items:ReportItem[]=[];
  printOrientation:PrintOrientation='portrait'; withdrawalSort:WithdrawalSort='weeding';
  page=1; readonly pageSize=50; lastLoadedAt:Date|null=null; loadedLibrary=''; loadedLocation='';
  libraries:Choice[]=[]; locations:Choice[]=[]; library=''; location=''; selectedReason='';
  woWeeding='WdrWO'; woDone='DlWO'; allowedReasons=['Aktualizace fondu','Zchátralost','Ztráta','Nedostupnost'];
  withdrawalMappings=''; mappingEntries:WithdrawalMapping[]=[];
  // Additional read-only calls to acquisition PO lines are opt-in.
  includeAcquisitionMethod=false;
  configLibrary=''; configLocation=''; configLocations:Choice[]=[]; configLocationsLoading=false;
  configSequence=''; configScanMode:'circ_desk'|'department'='circ_desk'; configScanCode=''; configWoDepartmentId=''; doneMethod:'scan'|'m18'='m18';
  settingsReady=false; environment='unverified'; environmentError=''; allowWrites=false; importWarning=''; importReviewed=false;
  operationDate=this.localDate(); operation:OperationState|null=null; workflowBusy=false;
  flowLibrary=''; flowLocation=''; flowLocations:Choice[]=[]; flowItems:ReportItem[]=[];
  flowInvalid=0; flowSkipped=0; flowLoaded=false; flowProgress='';
  scanAttempts:{[pid:string]:string}={}; historicalSets:{id:string;name:string}[]=[];historicalItems:ReportItem[]=[];
  selectedHistoricalSet=''; historyLoading=false;historyLibrary='';historyLocation='';historyReason='';
  historyFilterLibrary='';historyFilterLocation='';historyFilterFrom='';historyFilterTo='';historyFilterText='';
  historyDates:{[setId:string]:string}={}; historyDateSources:{[setId:string]:'metadata'|'set'}={}; historyDateErrors:{[setId:string]:string}={}; historyDateScanned=false;
  workflowSourceSetId=''; workflowSourceSetName=''; workflowSourceReason=''; setDetail:any=null; metadataDescription=''; metadataNote='';
  private verifiedSourceSets:{id:string;name:string;library:string;location:string;reason:string}[]=[];
  historicalReportSetId='';
  departmentChoices:{id:string;code:string;name:string}[]=[]; departmentsLoading=false;
  private api:WeedingAlmaApi;
  jobPollingEnabled=false; jobPollingMessage='';
  phaseSaveMessage=''; phaseSaveError=''; sourcePhaseNote='';
  private jobTimer:ReturnType<typeof setInterval>|null=null;
  private pollingBusy=false;

  instCode='';
  constructor(private rest:CloudAppRestService, private config:CloudAppConfigService, private events:CloudAppEventsService, private settings:CloudAppSettingsService, public translate:TranslateService) { this.api=new WeedingAlmaApi(rest); }

  ngOnDestroy():void{this.stopJobPolling();}
  startJobPolling():void{
    if(!this.operation?.instanceId || this.operation.stage==='complete' || this.operation.stage==='failed')return;
    this.stopJobPolling();this.jobPollingEnabled=true;
    this.jobPollingMessage='Automatická kontrola každých 30 sekund; běh jobu v Almě pokračuje i po zavření aplikace.';
    this.jobTimer=setInterval(()=>{void this.pollJobOnce();},30000);
    void this.pollJobOnce();
  }
  stopJobPolling():void{
    if(this.jobTimer!==null){clearInterval(this.jobTimer);this.jobTimer=null;}
    this.jobPollingEnabled=false;
  }
  private async pollJobOnce():Promise<void>{
    if(this.pollingBusy || this.workflowBusy || !this.operation?.instanceId)return;
    this.pollingBusy=true;
    try{
      const op=this.operation;
      const status=await this.api.jobStatus(op.instanceId);
      this.jobPollingMessage=`Job ${op.instanceId}: ${status||'neznámý stav'} (${new Date().toLocaleTimeString()})`;
      if(status.startsWith('COMPLETED') || status==='FAILED' || status==='CANCELED' || status==='CANCELLED'){
        this.stopJobPolling();
        // A terminal status must be followed by checking every member, not just the API status.
        await this.checkOperation();
      }
    }catch(e:any){
      this.jobPollingMessage='Kontrola stavu selhala: '+String(e?.message||e)+'. Další pokus za 30 sekund.';
    }finally{this.pollingBusy=false;}
  }
  private localDate():string {
    const now=new Date();return [now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  }
  selectedLibraryLabel(code:string):string {const c=this.libraries.find(x=>x.value===code);return c?`${c.desc} (${c.value})`:code;}
  selectedLocationLabel(code:string,choices:Choice[]):string {const c=choices.find(x=>x.value===code);return c?`${c.desc} (${c.value})`:code;}
  get canWrite():boolean {return this.settingsReady && this.allowWrites && this.environment!=='unverified' && !this.environmentError && !this.importWarning;}
  get chosenConfig():WithdrawalMapping|undefined {return this.mappingEntries.find(x=>x.libraryCode===this.library);}
  get chosenFlowConfig():WithdrawalMapping|undefined {return this.mappingEntries.find(x=>x.libraryCode===this.flowLibrary);}
  get currentWorkflowItems():ReportItem[]{return this.flowItems;}
  /** Set ID is the identity; source library and location are taken from immutable
   * ODPISY_SOURCE_V1 metadata where available, not reconstructed from an item's
   * current location. Names are only a compatibility fallback for old sets. */
  get workflowSetsForLocation():{id:string;name:string}[]{
    if(!this.flowLibrary||!this.flowLocation)return [];
    return this.verifiedSourceSets
      .filter(x=>x.library===this.flowLibrary&&x.location===this.flowLocation)
      .map(x=>({id:x.id,name:x.name}));
  }
  get canUseLastWeedingSet():boolean {
    const op=this.operation;
    return !!(op?.kind==='weeding' && op.stage==='complete' && op.setId &&
      op.library===this.flowLibrary && op.location===this.flowLocation &&
      this.workflowSetsForLocation.some(x=>x.id===op.setId));
  }
  get lastWeedingSetName():string{return this.canUseLastWeedingSet?this.operation!.setName:'';}
  async useLastWeedingSet():Promise<void>{
    if(!this.canUseLastWeedingSet)return;
    this.workflowSourceSetId=this.operation!.setId;
    await this.selectWorkflowSourceSet();
  }
  private sourceMetadataFromSetName(name:string):{library:string;location:string;reason:string}|null{
    if(!name.startsWith('ODP-')||name.startsWith('ODP-DISCOVERY-'))return null;
    // Match the trailing known structure rather than the first arbitrary prefix.
    // Never use underscores vs diacritics to authenticate the reason: it is
    // persisted separately in the set's source metadata.
    const match=name.match(/-([A-Za-z0-9_]+)-([A-Za-z0-9_]+)-([^\s]+)$/);
    if(!match)return null;
    return {library:match[1],location:match[2],reason:match[3].replace(/_/g,' ')};
  }
  private sourceMetadataFromDetail(detail:any):{library:string;location:string;reason:string}|null{
    const desc=String(detail?.description||'');
    const match=desc.match(/\[ODPISY_SOURCE_V1\]([\s\S]*?)\[\/ODPISY_SOURCE_V1\]/);
    if(match){
      let stored:any;
      try{stored=JSON.parse(match[1]);}catch{throw new Error('Neplatná metadata ODPISY_SOURCE_V1 pro set '+String(detail?.id||''));}
      if(!stored?.library||!stored?.location||!stored?.reason)
        throw new Error('Neúplná metadata ODPISY_SOURCE_V1 pro set '+String(detail?.id||''));
      return {library:String(stored.library),location:String(stored.location),reason:String(stored.reason)};
    }
    return this.sourceMetadataFromSetName(String(detail?.name||''));
  }
  get pendingOperation():boolean{return !!this.operation && this.operation.stage!=='complete';}
  get operationPanelClass():string{
    const op=this.operation;
    if(!op)return '';
    if(op.stage==='failed' || !!op.error || !!this.phaseSaveError) return 'workflow-panel-error';
    if(op.stage==='complete') return 'workflow-panel-success';
    return 'workflow-panel-pending';
  }
  get alreadyWeededItems():ReportItem[]{return this.items.filter(x=>!!x.weedingNumber||!!x.weedingDate);}
  /** Normalize Alma date or datetime to YYYY-MM-DD. */
  private almaWeedingDay(value:string):string {
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m?m[1]+'-'+m[2]+'-'+m[3]:'';
  }
  get filteredHistoricalSets():{id:string;name:string}[]{
    const low=(v:string)=>v.toLocaleLowerCase('cs').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return this.historicalSets.filter(x=>{
      const name=x.name, normalized=low(name);
      if(this.historyFilterLibrary && !name.includes('-'+this.historyFilterLibrary+'-'))return false;
      if(this.historyFilterLocation && !name.includes('-'+this.historyFilterLocation.trim()+'-'))return false;
      if(this.historyFilterText && !normalized.includes(low(this.historyFilterText.trim()).replace(/\s+/g,'_')))return false;
      if(this.historyFilterFrom || this.historyFilterTo){
        const day=this.historyDates[x.id]||'';
        if(!day)return false; // Unknown date: never silently include the set.
        if(this.historyFilterFrom && day<this.historyFilterFrom)return false;
        if(this.historyFilterTo && day>this.historyFilterTo)return false;
      }
      return true;
    });
  }
  /** Set creation date in the app-controlled name ODP-<institution>-YYYYMMDD-HHMMSS-<library>-<location>-<reason>.
   * This compatibility fallback is never read from physical item details. */
  private historySetCreationDay(name:string):string {
    const match=String(name||'').match(/^ODP-(?!DISCOVERY-|MOVE-).+?-(\d{4})(\d{2})(\d{2})-\d{6}-/);
    if(!match)return '';
    const day=match[1]+'-'+match[2]+'-'+match[3];
    const date=new Date(day+'T00:00:00Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10)===day ? day : '';
  }
  /** Priority: set phase metadata (actual weeding date), then set creation date.
   * One set-detail GET at most; never scan set members or item details for history filters. */
  private async detectHistoricalWeedingDate(setId:string,setName:string):Promise<void>{
    if(this.historyDates[setId]||this.historyDateErrors[setId])return;
    try{
      const detail=await this.api.getSetDetail(setId);
      if(String(detail?.id||'')!==setId ||
         String(detail?.type?.value??detail?.type??'').toUpperCase()!=='ITEMIZED')
        throw new Error('Nepotvrzený historický set');
      const raw=String(detail?.note||'');
      const match=raw.match(/\[ODPISY_PHASES_V1\]([\s\S]*?)\[\/ODPISY_PHASES_V1\]/);
      if(match){
        let phases:any;
        try{phases=JSON.parse(match[1]);}
        catch{throw new Error('Poškozená metadata fází v poznámce setu '+setId);}
        const stored=this.almaWeedingDay(String(phases?.weeding?.weedingDate||''));
        if(stored){this.historyDates[setId]=stored;this.historyDateSources[setId]='metadata';return;}
      }
      const fallback=this.historySetCreationDay(String(detail?.name||setName));
      if(!fallback)throw new Error('Set nemá uložené datum odpisu ani rozpoznatelné datum vytvoření v názvu');
      this.historyDates[setId]=fallback;
      this.historyDateSources[setId]='set';
    }catch(e:any){this.historyDateErrors[setId]=String(e?.message||e);}
  }
  historyDateLabel(setId:string):string {
    const day=this.historyDates[setId];
    return day ? day+(this.historyDateSources[setId]==='set'?' (datum vytvoření setu)':' (datum odpisu)') : '';
  }
  get readyToWeed():boolean{return this.canWrite && this.loaded && this.invalidCount===0 && !!this.selectedReason && this.reportItems.length>0 && this.reportItems.every(x=>x.itemPid && !x.weedingNumber && !x.weedingDate) && !!this.chosenConfig?.sequenceName && !this.pendingOperation && !this.workflowBusy;}
  get readyToScan():boolean{return this.canWrite && !this.pendingOperation && this.flowLoaded && this.tab==='done' && this.flowInvalid===0 && this.flowItems.length>0 && !!this.chosenFlowConfig?.scanCode && !this.workflowBusy;}
  get readyToWoJob():boolean{return !!this.workflowSourceSetId && this.canWrite && !this.pendingOperation && this.flowLoaded && this.tab==='done' && this.flowInvalid===0 && this.flowItems.length>0 && /^\d{10,}$/.test(this.chosenFlowConfig?.woDepartmentId||'') && !this.workflowBusy;}
  get readyToMove():boolean{return !!this.workflowSourceSetId && this.canWrite && this.flowLoaded && this.tab==='move' && this.flowInvalid===0 && this.flowItems.length>0 && !!this.chosenFlowConfig?.locationCode && !this.pendingOperation && !this.workflowBusy;}
  async ngOnInit(){
    try {
      const init:any=await firstValueFrom(this.events.getInitData()); this.instCode=String(init?.instCode||'');
      const c:any=await firstValueFrom(this.config.get());
      this.woWeeding=this.normalizeLegacyWorkOrderCode(String(c?.woWeeding||this.woWeeding),'weeding'); this.woDone=this.normalizeLegacyWorkOrderCode(String(c?.woDone||this.woDone),'done');
      this.allowedReasons=Array.isArray(c?.allowedReasons)&&c.allowedReasons.length?c.allowedReasons:this.allowedReasons;
      this.withdrawalMappings=String(c?.withdrawalMappings ?? this.withdrawalMappings);
      this.allowWrites=c?.allowWrites===true;
      this.includeAcquisitionMethod=c?.includeAcquisitionMethod===true;
      await this.loadLibraries();
      this.parseWithdrawalMappings();
      if(Array.isArray(c?.librarySettings)) this.mappingEntries=this.parseLibrarySettings(c.librarySettings);
      try { const st:any=await firstValueFrom(this.settings.get());
        this.operation=st?.operation||null;this.scanAttempts=st?.scanAttempts||{};this.settingsReady=true;
      } catch(e:any) { this.error='Nepodařilo se načíst bezpečnostní stav operací: '+String(e?.message||e); }
      try {
        const general:any=await firstValueFrom(this.rest.call<any>('/almaws/v1/conf/general?format=json'));
        const raw=String(general?.environment_type?.value||general?.environment_type||'').toLowerCase();
        this.environment=raw.includes('sandbox')?'sandbox':raw.includes('production')?'production':'unverified';
        if(this.environment==='unverified')this.environmentError='API nevrátilo jednoznačně ověřené prostředí; zápisy jsou zakázané.';
      } catch(e:any){ this.environmentError='Prostředí nebylo ověřeno z Alma API; zápisy jsou zakázané.'; }
      if(c?.environment && c.environment!==this.environment) {
        this.allowWrites=false;this.importWarning='Uložené prostředí konfigurace je jiné. Před uložením prohlédněte všechna mapování a potvrďte kontrolu.';
      }
      if(c?.institution && c.institution!==this.instCode) {
        this.allowWrites=false;this.importWarning='Konfigurace patří jiné instituci. Projděte všechna mapování a potvrďte kontrolu.';
      }

    } catch(e:any){ this.error=e?.message||'Initialization failed'; }
  }
  get configMode(){return window.location.hash.toLowerCase().includes('/config');}
  get invalidCount(){return this.items.reduce((count,item)=>count+(item.valid?0:1),0);}
  get okCount(){return this.items.length-this.invalidCount;}
  /** Unknown or empty reasons are a hard stop for the entire source collection. */
  get invalidReasonItems(){return this.items.filter(x=>!this.allowedReasons.includes(x.reason));}
  get invalidReasonSummary(){
    const reasons=new Map<string,number>();
    for(const item of this.invalidReasonItems){
      const label=item.reason||'(prázdný důvod)';
      reasons.set(label,(reasons.get(label)||0)+1);
    }
    return [...reasons].map(([reason,count])=>({reason,count}));
  }
  get reportItems(){return this.selectedReason?this.items.filter(x=>x.reason===this.selectedReason):this.items;}
  get totalPages(){return Math.max(1,Math.ceil(this.reportItems.length/this.pageSize));}
  get visibleItems(){return this.reportItems.slice((this.page-1)*this.pageSize,this.page*this.pageSize);}
  get shownFrom(){return this.reportItems.length?(this.page-1)*this.pageSize+1:0;}
  get shownTo(){return Math.min(this.page*this.pageSize,this.reportItems.length);}
  get usedReasons(){return this.allowedReasons.map(reason=>({reason,count:this.items.filter(x=>x.reason===reason).length})).filter(x=>x.count>0);}
  chooseReason(reason:string){this.selectedReason=reason;this.page=1;}
  changePage(delta:number){this.page=Math.min(this.totalPages,Math.max(1,this.page+delta));}
  private resetLoadedItems(){this.items=[];this.loaded=false;this.selectedReason='';this.page=1;this.lastLoadedAt=null;}
  onLocationChange(){this.resetLoadedItems();}
  private reportMetadata():ReportMetadata{
    const useHistory=!!this.historicalItems.length;
    const reportLib=useHistory?this.historyLibrary:this.loadedLibrary;
    const reportLoc=useHistory?this.historyLocation:this.loadedLocation;
    const lib=this.libraries.find(x=>x.value===reportLib);
    const loc=this.locations.find(x=>x.value===reportLoc) || this.mappingEntries.filter(x=>x.libraryCode===reportLib).map(x=>({value:x.locationCode,desc:x.locationDesc})).find(x=>x.value===reportLoc);
    return {
      documentTitle:this.translate.instant('controlReport'),
      libraryName:`${lib?.desc||reportLib} (${reportLib})`,
      locationName:`${loc?.desc||reportLoc} (${reportLoc})`,
      selectedReason:useHistory?this.historyReason:this.selectedReason,
      createdAt:new Intl.DateTimeFormat(this.translate.currentLang==='en'?'en-GB':'cs-CZ',{dateStyle:'medium',timeStyle:'short'}).format(this.lastLoadedAt||new Date()),
      locale:this.translate.currentLang==='en'?'en':'cs'
    };
  }
  private reportLabels():ReportLabels{
    const t=(key:string)=>this.translate.instant(key);
    return {library:t('library'),location:t('location'),reason:t('reason'),allReasons:t('allReasons'),
      generated:t('generated'),total:t('totalItems'),okCount:t('okItems'),errCount:t('errItems'),
      status:t('status'),inventory:t('inventory'),barcode:t('barcode'),mmsId:'MMS ID',title:t('title'),workOrder:t('workOrder'),printButton:t('printButton')};
  }
  exportControlCsv(){
    if(!this.loaded||!this.reportItems.length)return;
    const info=this.reportMetadata(); const contents=createReportCsv(this.reportItems,info,this.reportLabels());
    const fileName=`odpisy-kontrola-${safeFilePart(this.loadedLibrary)}-${safeFilePart(this.loadedLocation)}-${safeFilePart(this.selectedReason||'all')}-${new Date().toISOString().slice(0,10)}.csv`;
    const blob=new Blob([contents],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const link=document.createElement('a');
    link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  printControlList(): void {
    if (!this.loaded || !this.reportItems.length) return;

    this.error = '';
    this.message = '';
    // Use the proven print-preview pattern from our Physical Items List and
    // Accession List Cloud Apps. Open synchronously from the user's click so
    // the Cloud App's popup sandbox permits it; do not print a hidden iframe.
    const printWindow = window.open('', '_blank', 'width=1200,height=900');
    if (!printWindow) {
      this.error = this.translate.instant('printPopupBlocked');
      return;
    }

    try {
      const markup = createReportPrintHtml(
        this.reportItems, this.reportMetadata(), this.reportLabels(), this.printOrientation
      );
      printWindow.document.open();
      printWindow.document.write(markup);
      printWindow.document.close();

      // An explicit button in the preview starts printing, allowing the user
      // to inspect even very large reports and choose Print / Save as PDF.
      const printButton = printWindow.document.getElementById('print-button');
      if (!printButton) throw new Error(this.translate.instant('printUnavailable'));
      printButton.addEventListener('click', () => {
        printWindow.focus();
        printWindow.print();
      });
      window.setTimeout(() => printWindow.focus(), 150);
      this.message = this.translate.instant('printPreviewReady');
    } catch (e: any) {
      printWindow.close();
      this.error = e?.message || this.translate.instant('printUnavailable');
    }
  }
  private downloadText(file:string,contents:string,type:string):void {
    const blob=new Blob([contents],{type}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url;a.download=file;a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  exportWithdrawalCsv(){
    if(!this.historicalItems.length)return;
    this.downloadText(`ubytkovy-seznam-${safeFilePart(this.selectedHistoricalSet)}.csv`,
      createWithdrawalCsv(this.historicalItems,this.withdrawalSort),'text/csv;charset=utf-8');
  }
  printWithdrawalList(){
    if(!this.historicalItems.length)return;
    const popup=window.open('','_blank','width=1200,height=900');
    if(!popup){this.error=this.translate.instant('printPopupBlocked');return;}
    popup.document.open();popup.document.write(createWithdrawalPrintHtml(this.historicalItems,this.reportMetadata(),this.printOrientation,this.withdrawalSort));popup.document.close();
    popup.document.getElementById('print-button')?.addEventListener('click',()=>{popup.focus();popup.print();});
  }
  private configurationObject(){
    this.withdrawalMappings=this.serializeWithdrawalMappings();
    return {configVersion:4,environment:this.environment,institution:this.instCode,
      woWeeding:this.woWeeding.trim(),woDone:this.woDone.trim(),
      allowedReasons:this.allowedReasons.map(x=>x.trim()).filter(Boolean),
      withdrawalMappings:this.withdrawalMappings.trim(),
      librarySettings:this.mappingEntries.map(x=>({libraryCode:x.libraryCode,locationCode:x.locationCode,
        sequenceName:x.sequenceName.trim(),scanMode:x.scanMode,scanCode:x.scanCode.trim(),woDepartmentId:x.woDepartmentId.trim()})),
      allowWrites:this.allowWrites,includeAcquisitionMethod:this.includeAcquisitionMethod};
  }
  private parseLibrarySettings(value:any[]):WithdrawalMapping[]{
    const seen=new Set<string>();const entries:WithdrawalMapping[]=[];
    for(const item of value){
      const libraryCode=String(item?.libraryCode||'').trim(),locationCode=String(item?.locationCode||'').trim();
      if(!libraryCode || seen.has(libraryCode))throw new Error('Duplicitní nebo prázdný kód knihovny');
      seen.add(libraryCode);
      const lib=this.libraries.find(x=>x.value===libraryCode);
      entries.push({libraryCode,libraryDesc:lib?.desc||libraryCode,locationCode,locationDesc:locationCode,
        sequenceName:String(item?.sequenceName||''),scanMode:item?.scanMode==='department'?'department':'circ_desk',scanCode:String(item?.scanCode||''),woDepartmentId:String(item?.woDepartmentId||'')});
    }
    return entries;
  }
  private validateConfiguration():void{
    if(!this.woWeeding.trim()||!this.woDone.trim()||!this.allowedReasons.length)throw new Error('Chybí globální kódy Work Order nebo důvody.');
    if(this.importWarning && !this.importReviewed)throw new Error('Nejdřív potvrďte kontrolu importu z jiného prostředí.');
    const known=new Set(this.libraries.map(x=>x.value));
    for(const x of this.mappingEntries){
      if(!known.has(x.libraryCode))throw new Error('Knihovna neexistuje v aktuální instituci: '+x.libraryCode);
      if(x.locationCode && !/^[A-Za-z0-9_-]+$/.test(x.locationCode))throw new Error('Neplatný kód lokace: '+x.locationCode);
      if(x.woDepartmentId && !/^\d{10,}$/.test(x.woDepartmentId))throw new Error('Neplatné interní ID oddělení M18: '+x.woDepartmentId);
      if(x.scanCode && !/^[A-Za-z0-9_-]+$/.test(x.scanCode))throw new Error('Neplatný kód pultu/oddělení: '+x.scanCode);
    }
    if(this.allowWrites && (this.environment==='unverified'||!!this.environmentError))throw new Error('Nelze povolit zápisy bez ověřeného prostředí.');
  }
  async saveConfiguration(){
    try {this.error='';this.validateConfiguration();
      for(const x of this.mappingEntries){
        if(x.locationCode){const places=await this.loadLocations(x.libraryCode);
          if(!places.some(p=>p.value===x.locationCode))throw new Error('Sbírka neexistuje v '+x.libraryCode+': '+x.locationCode);
        }
      }
      await firstValueFrom(this.config.set(this.configurationObject()));
      this.importWarning='';this.importReviewed=false;
      this.message=this.translate.instant('saved');
    } catch(e:any){this.error=e?.message||this.translate.instant('configError');}
  }
  setReasonsText(v:string){this.allowedReasons=v.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);}
  exportConfiguration(){
    this.error='';this.message='';
    const settings=this.configurationObject();
    const payload:AppConfigExport={configVersion:4,app:'alma-odpisy',exportedAt:new Date().toISOString(),institution:this.instCode,environment:this.environment,settings};
    this.downloadText(`alma-odpisy-config-v4-${safeFilePart(this.environment)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
    this.message=this.translate.instant('exported');
  }
  async importConfiguration(event:Event){
    this.error='';this.message='';
    const input=event.target as HTMLInputElement;const file=input.files?.[0];if(!file)return;
    try{
      const parsed:any=JSON.parse(await file.text());
      if(parsed?.app!=='alma-odpisy'||![1,2,3,4].includes(parsed?.configVersion)||!parsed?.settings)throw new Error(this.translate.instant('invalidConfigFile'));
      const x=parsed.settings;
      if(typeof x.woWeeding!=='string'||typeof x.woDone!=='string'||!Array.isArray(x.allowedReasons)||!x.allowedReasons.length)throw new Error(this.translate.instant('invalidConfigFile'));
      const entries=Array.isArray(x.librarySettings)?this.parseLibrarySettings(x.librarySettings):this.parseLegacyMappings(String(x.withdrawalMappings||''));
      const srcInst=String(parsed.institution||x.institution||''),srcEnv=String(parsed.environment||x.environment||'');
      this.importWarning=((srcInst&&srcInst!==this.instCode)||(srcEnv&&srcEnv!==this.environment))
        ?`Konfigurace pochází z ${srcInst}/${srcEnv}, ale právě jste v ${this.instCode}/${this.environment}. Zkontrolujte všechny řady, sbírky i pulty.`:'';
      this.importReviewed=false;
      this.woWeeding=this.normalizeLegacyWorkOrderCode(x.woWeeding,'weeding');this.woDone=this.normalizeLegacyWorkOrderCode(x.woDone,'done');
      this.allowedReasons=x.allowedReasons.map((v:string)=>v.trim()).filter(Boolean);this.mappingEntries=entries;
      this.withdrawalMappings=this.serializeWithdrawalMappings();
      this.includeAcquisitionMethod=x.includeAcquisitionMethod===true;
      // Never switch on write permission as a side effect of importing a file.
      this.allowWrites=false;
      this.message=this.translate.instant('importedNotSaved');
    }catch(e:any){this.error=e?.message||this.translate.instant('invalidConfigFile');}
    finally{input.value='';}
  }
  get reasonsText(){return this.allowedReasons.join('\n');}
  goMain(){window.location.hash='#/';}

  async loadWorkOrderDepartments():Promise<void>{
    this.departmentsLoading=true;this.error='';
    try {this.departmentChoices=await this.api.listWorkOrderDepartments();
      if(!this.departmentChoices.length)this.message='API nevrátilo interní ID oddělení. Lze ho vyplnit ručně podle exportu M18.';
    }catch(e:any){this.error='Načtení oddělení selhalo: '+String(e?.message||e);}
    finally{this.departmentsLoading=false;}
  }
  async inspectSet():Promise<void>{
    if(!this.selectedHistoricalSet)return;
    this.error='';this.setDetail=null;
    try {this.setDetail=await this.api.getSetDetail(this.selectedHistoricalSet);
      this.metadataDescription=String(this.setDetail?.description??'');
      this.metadataNote=String(this.setDetail?.note??'');
    }catch(e:any){this.error='Detail setu: '+String(e?.message||e);}
  }
  async saveSetMetadata():Promise<void>{
    this.error='';this.message='';
    try{
      this.assertWritable();
      if(this.environment!=='sandbox')throw new Error('Test úpravy metadat je zatím povolen pouze v ověřeném PSB.');
      if(!this.selectedHistoricalSet||!this.setDetail||String(this.setDetail.id)!==this.selectedHistoricalSet)throw new Error('Nejprve načtěte detail setu.');
      // Native confirm() is blocked in Alma Cloud App sandbox iframe; the explicit button is the user action.
      const name=String(this.setDetail.name??'');
      if(!name.startsWith('ODP-'))throw new Error('Lze upravit pouze sety Cloud App s prefixem ODP-.');
      this.workflowBusy=true;
      this.setDetail=await this.api.updateSetMetadata(this.selectedHistoricalSet,this.metadataDescription,this.metadataNote);
      this.message='Metadata setu uložena a členství znovu ověřeno v Almě.';
    }catch(e:any){this.error=String(e?.message||e);}
    finally{this.workflowBusy=false;}
  }
  private phaseSummary(note:string):string[]{
    const match=String(note).match(/\[ODPISY_PHASES_V1\]([\s\S]*?)\[\/ODPISY_PHASES_V1\]/);
    if(!match)return ['1 Odpis: bez záznamu', '2 WO: bez záznamu', '3 Přesun: bez záznamu'];
    try{
      const stages=JSON.parse(match[1]);
      return ['weeding','wo','move'].map((key,i)=>{
        const stage=stages[key];
        if(!stage)return `${i+1}/3 ${['Odpis','WO','Přesun'][i]}: nezahájeno`;
        const status=stage.stage==='complete'?'DOKONČENO':stage.stage==='failed'?'CHYBA':String(stage.stage);
        return `${i+1}/3 ${['Odpis','WO','Přesun'][i]}: ${status} · ${stage.count??'?'} jednotek · M18 ${stage.instanceId??'—'}${stage.error?' · '+stage.error:''}`;
      });
    }catch{return ['NEPLATNÁ STRUKTURA HISTORIE – zkontrolujte poznámku'];}
  }
  get setPhaseSummary():string[]{return this.phaseSummary(this.metadataNote);}
  get workflowPhaseSummary():string[]{return this.phaseSummary(this.sourcePhaseNote);}
  async recordCurrentJobInSet(automatic=false):Promise<void>{
    this.phaseSaveError='';this.phaseSaveMessage='';
    if(!automatic){this.error='';this.message='';}
    try{
      // The verified job is still protected by workflowBusy during automatic completion.
      // Only an automatic history write from checkOperation may run in this state.
      if(automatic){
        if(!this.canWrite)throw new Error('Zápis historie není povolen v aktuálním prostředí.');
        if(!this.workflowBusy)throw new Error('Automatický zápis historie mimo probíhající kontrolu jobu není povolen.');
      }else{this.assertWritable();}
      if(this.environment!=='sandbox')throw new Error('Zápis stavů je zatím určen pouze pro PSB.');
      const op=this.operation;
      if(!op?.setId||!op.instanceId)throw new Error('Není dostupný běh M18 s jednoznačným Set ID a instance ID');
      if(!['complete','failed'].includes(op.stage))throw new Error('Nejprve dokončete kontrolu výsledku jobu v Cloud App.');
      const detail=await this.api.getSetDetail(op.setId);
      if(!String(detail?.name??'').startsWith('ODP-'))throw new Error('Nejde o odpisový set Cloud App');
      const note=String(detail?.note??'');
      const marker=/\n?\[ODPISY_PHASES_V1\][\s\S]*?\[\/ODPISY_PHASES_V1\]/;
      const prior=note.match(marker);
      const current=prior?.[0].match(/\[ODPISY_PHASES_V1\]([\s\S]*?)\[\/ODPISY_PHASES_V1\]/);
      let phases:any={};
      if(current){try{phases=JSON.parse(current[1]);}catch{throw new Error('V poznámce jsou poškozená data fází – ručně zkontrolujte');}}
      const previous=phases[op.kind];
      if(previous?.instanceId && previous.instanceId!==op.instanceId)
        throw new Error('Pro tuto fázi je již evidovaná jiná instance. Změnu nejprve ručně posuďte.');
      phases[op.kind]={stage:op.stage,instanceId:op.instanceId,checkedAt:new Date().toISOString(),
        count:op.memberIds.length,weedingDate:op.kind==='weeding'&&op.stage==='complete'?op.weedingDate:undefined,failedCount:op.kind==='wo'?Object.values(op.resultByPid||{}).filter(x=>x!=='OK').length:undefined,error:(op.error||'').slice(0,500)};
      const prefix=note.replace(marker,'').trim();
      const nextNote=(prefix?prefix+'\n':'')+'[ODPISY_PHASES_V1]'+JSON.stringify(phases)+'[/ODPISY_PHASES_V1]';
      // Do not use window.confirm(): it is blocked by the Alma sandbox iframe.
      if(!automatic)this.workflowBusy=true;
      const verified=await this.api.updateSetMetadata(op.setId,String(detail?.description??''),nextNote);
      this.sourcePhaseNote=String(verified?.note??nextNote);
      delete this.historyDates[op.setId];delete this.historyDateSources[op.setId];delete this.historyDateErrors[op.setId];
      if(this.selectedHistoricalSet===op.setId){this.metadataNote=this.sourcePhaseNote;this.setDetail=verified;}
      this.phaseSaveMessage='Historie fáze '+op.kind+' uložena a znovu ověřena v Almě (set '+op.setId+').';
      if(!automatic)this.message=this.phaseSaveMessage;
    }catch(e:any){
      this.phaseSaveError='Historii fáze se nepodařilo uložit: '+String(e?.message||e)+'. M18 znovu nespouštějte; použijte opakování zápisu historie.';
      if(!automatic)this.error=this.phaseSaveError;
    }finally{if(!automatic)this.workflowBusy=false;}
  }
  async selectWorkflowSourceSet():Promise<void>{
    this.error='';this.workflowSourceSetName='';this.workflowSourceReason='';this.sourcePhaseNote='';
    if(!this.workflowSourceSetId)return;
    try{
      const chosenId=this.workflowSourceSetId;
      const detail=await this.api.getSetDetail(chosenId);
      if(String(detail?.id||'')!==chosenId)throw new Error('Alma vrátila jiný Set ID');
      if(!String(detail?.name??'').startsWith('ODP-'))throw new Error('Set nepochází z workflow Odpisy');
      if(String(detail?.type?.value??detail?.type??'').toUpperCase()!=='ITEMIZED')throw new Error('Zdrojový set musí být pevný ITEMIZED, nikoli logický.');
      const source=this.sourceMetadataFromDetail(detail);
      if(!source || source.library!==this.flowLibrary || source.location!==this.flowLocation)
        throw new Error('Set nepatří k vybrané knihovně a původní sbírce.');
      const members=await this.api.members(chosenId);
      if(!members.length)throw new Error('Set nemá členy');
      if(this.workflowSourceSetId!==chosenId)throw new Error('Výběr setu se během načítání změnil');
      this.workflowSourceSetName=String(detail.name);
      this.sourcePhaseNote=String(detail.note??'');
      this.workflowSourceReason=source.reason;
      this.message='Vybraný zdrojový set: '+this.workflowSourceSetName+' (ID '+chosenId+', '+members.length+' členů).';
      this.flowLoaded=false;this.flowItems=[];
    }catch(e:any){this.workflowSourceSetId='';this.error=String(e?.message||e);}
  }
  async loadLibraries(){
    const all:Choice[]=[];let offset=0;
    while(true){
      const r:any=await firstValueFrom(this.rest.call<any>(`/almaws/v1/conf/libraries?limit=100&offset=${offset}&format=json`));
      const page=Array.isArray(r?.library)?r.library:(r?.library?[r.library]:[]);
      all.push(...page.map((x:any)=>({value:String(x?.code||x?.value||''),desc:String(x?.name||x?.desc||x?.code||'')})).filter((x:Choice)=>x.value));
      offset+=page.length;
      const total=Number(r?.total_record_count);
      if((Number.isFinite(total)&&r?.total_record_count!==undefined&&offset>=total)||page.length<100)break;
      if(!page.length)throw new Error('Alma returned an incomplete library list');
    }
    this.libraries=all;
  }
  async onLibrary(){this.location='';this.locations=[];this.resetLoadedItems(); if(!this.library)return; this.locations=await this.loadLocations(this.library);}
  async onConfigLibrary(){
    this.configLocation=''; this.configLocations=[]; if(!this.configLibrary)return;
    this.configLocationsLoading=true;
    try { this.configLocations=await this.loadLocations(this.configLibrary);this.onConfigSelection(); }
    finally { this.configLocationsLoading=false; }
  }
  onFlowLocationChange():void{
    this.flowLoaded=false;this.flowItems=[];
    this.workflowSourceSetId='';this.workflowSourceSetName='';
    this.workflowSourceReason='';this.sourcePhaseNote='';
  }
  async onFlowLibrary(){
    this.flowLocation='';this.flowItems=[];this.flowLoaded=false;this.workflowSourceSetId='';this.workflowSourceSetName='';this.sourcePhaseNote='';
    this.flowLocations=this.flowLibrary?await this.loadLocations(this.flowLibrary):[];
  }
  private async loadLocations(libraryCode:string):Promise<Choice[]>{
    const result:Choice[]=[];let offset=0;
    while(true){
      const r:any=await firstValueFrom(this.rest.call<any>(`/almaws/v1/conf/libraries/${encodeURIComponent(libraryCode)}/locations?limit=100&offset=${offset}&format=json`));
      const page=Array.isArray(r?.location)?r.location:(r?.location?[r.location]:[]);
      result.push(...page.map((x:any)=>({value:String(x?.code||x?.value||''),desc:String(x?.name||x?.desc||x?.code||'')})).filter((x:Choice)=>x.value));
      offset+=page.length;const total=Number(r?.total_record_count);
      if((Number.isFinite(total)&&r?.total_record_count!==undefined&&offset>=total)||page.length<100)break;
      if(!page.length)throw new Error('Alma returned an incomplete locations list');
    }
    return result;
  }
  prefillCvut(){
    if(this.instCode!=='420CARDS_CVUT'){this.error='Předvyplnění ČVUT je dostupné jen v instituci ČVUT.';return;}
    const defaults=[
      {libraryCode:'DKD',locationCode:'89999',sequenceName:'Úbytkové číslo DKD',scanCode:'DEFAULT_CIRC_DESK',woDepartmentId:''},
      {libraryCode:'ARCH',locationCode:'A99',sequenceName:'Úbytkové číslo Archiv',scanCode:'',woDepartmentId:''},
      {libraryCode:'UBMI',locationCode:'U99',sequenceName:'Úbytkové číslo FBMI',scanCode:'',woDepartmentId:''},
      {libraryCode:'FD',locationCode:'69999',sequenceName:'Úbytkové číslo FD',scanCode:'',woDepartmentId:''},
      {libraryCode:'FJFI',locationCode:'49999',sequenceName:'Úbytkové číslo FJFI',scanCode:'',woDepartmentId:''}
    ];
    for(const x of defaults){
      const lib=this.libraries.find(l=>l.value===x.libraryCode);
      if(!lib)continue;
      const existing=this.mappingEntries.find(e=>e.libraryCode===x.libraryCode);
      if(existing){
        if(!existing.locationCode)existing.locationCode=x.locationCode;
        if(!existing.sequenceName)existing.sequenceName=x.sequenceName;
        if(!existing.scanCode)existing.scanCode=x.scanCode;
      }else this.mappingEntries.push({...x,libraryDesc:lib.desc,locationDesc:x.locationCode,scanMode:'circ_desk',woDepartmentId:''});
    }
    this.mappingEntries.sort((a,b)=>a.libraryCode.localeCompare(b.libraryCode));
    this.withdrawalMappings=this.serializeWithdrawalMappings();
    this.message='Načteny výchozí hodnoty ČVUT pro existující knihovny; ověřte a uložte je.';
  }
  onConfigSelection(){
    const found=this.mappingEntries.find(x=>x.libraryCode===this.configLibrary);
    this.configLocation=found?.locationCode||'';this.configSequence=found?.sequenceName||'';
    this.configScanMode=found?.scanMode||'circ_desk';this.configScanCode=found?.scanCode||'';this.configWoDepartmentId=found?.woDepartmentId||'';
  }
  addWithdrawalMapping(){
    this.error='';this.message='';
    if(!this.configLibrary)return;
    const lib=this.libraries.find(x=>x.value===this.configLibrary);
    const loc=this.configLocations.find(x=>x.value===this.configLocation);
    const entry:WithdrawalMapping={libraryCode:this.configLibrary,libraryDesc:lib?.desc||this.configLibrary,
      locationCode:this.configLocation,locationDesc:loc?.desc||this.configLocation,
      sequenceName:this.configSequence.trim(),scanMode:this.configScanMode,scanCode:this.configScanCode.trim(),woDepartmentId:this.configWoDepartmentId.trim()};
    const index=this.mappingEntries.findIndex(x=>x.libraryCode===entry.libraryCode);
    if(index>=0)this.mappingEntries[index]=entry;else this.mappingEntries.push(entry);
    this.mappingEntries.sort((a,b)=>a.libraryCode.localeCompare(b.libraryCode));
    this.withdrawalMappings=this.serializeWithdrawalMappings();
  }
  removeWithdrawalMapping(libraryCode:string){
    this.mappingEntries=this.mappingEntries.filter(x=>x.libraryCode!==libraryCode);
    this.withdrawalMappings=this.serializeWithdrawalMappings();
  }
  private parseLegacyMappings(text:string):WithdrawalMapping[]{
    const parsed:WithdrawalMapping[]=[];
    for(const line of text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
      const pos=line.indexOf('=');if(pos<=0)continue;
      const libraryCode=line.slice(0,pos).trim(),locationCode=line.slice(pos+1).trim();if(!libraryCode||!locationCode)continue;
      const lib=this.libraries.find(x=>x.value===libraryCode);
      const existing=parsed.find(x=>x.libraryCode===libraryCode);
      if(existing)existing.locationCode=locationCode;
      else parsed.push({libraryCode,libraryDesc:lib?.desc||libraryCode,locationCode,locationDesc:locationCode,
        sequenceName:'',scanMode:'circ_desk',scanCode:'',woDepartmentId:''});
    }
    return parsed;
  }
  private parseWithdrawalMappings(){this.mappingEntries=this.parseLegacyMappings(this.withdrawalMappings);}
  private serializeWithdrawalMappings(){return this.mappingEntries.filter(x=>x.locationCode).map(x=>`${x.libraryCode}=${x.locationCode}`).join('\n');}

  async load(preserveReason=false){
    const reasonToKeep=preserveReason?this.selectedReason:'';
    this.error='';this.message='';this.resetLoadedItems();
    if(!this.library||!this.location)return;
    this.loading=true;
    // Keep a snapshot so a failed request can never enable actions on partial data.
    const selectedLibrary=this.library, selectedLocation=this.location;
    const collected:ReportItem[]=[];
    try {
      collected.push(...await this.discoverItems(selectedLibrary,selectedLocation,this.woWeeding,(n,total)=>this.message=`${n}/${total}`));
      collected.sort((a,b)=>a.inventoryNumber.localeCompare(b.inventoryNumber,undefined,{numeric:true,sensitivity:'base'})
        || a.barcode.localeCompare(b.barcode));
      this.items=collected;this.loaded=true;this.loadedLibrary=selectedLibrary;this.loadedLocation=selectedLocation;
      if(reasonToKeep && collected.some(x=>x.reason===reasonToKeep))this.selectedReason=reasonToKeep;
      this.lastLoadedAt=new Date();this.message='';
    } catch(e:any){
      console.error(e);this.resetLoadedItems();this.message='';
      this.error=e?.message||String(e);
    } finally{this.loading=false;}
  }
  /** Discover by a server-side logical ITEM set; freeze item PIDs for further validation.
   * A failed GET or incomplete page blocks the workflow, never returns partial data.
   */
  private async discoverItems(libraryCode:string,locationCode:string,woCode:string,progress:(done:number,total:number)=>void):Promise<ReportItem[]>{
    const setId=await this.api.createDiscoverySet(libraryCode,locationCode,woCode);
    let members:string[]=[];
    let readCompleted=false;
    try{
      members=await this.api.discoveryMembers(setId);
      readCompleted=true;
    }finally{
      // Always attempt cleanup. An ambiguous cleanup failure is surfaced separately
      // after a successful read so it can be resolved by an operator.
      try{await this.api.deleteDiscoverySet(setId);}
      catch(e:any){throw new Error(`Pomocný set ${setId} nebylo možné bezpečně odstranit; zkontrolujte jej v Almě. ${String(e?.message||e)}`);}
    }
    if(!readCompleted)throw new Error('Členství pomocného setu nebylo načteno');
    const results:ReportItem[]=[];
    let cursor=0,done=0,failure:unknown=null;
    const workers=Array.from({length:Math.min(4,members.length)},async()=>{
      while(failure===null&&cursor<members.length){
        const itemPid=members[cursor++];
        try{
          const live=await this.liveItem(itemPid);
          if(live.itemPid!==itemPid||live.libraryCode!==libraryCode||live.locationCode!==locationCode||live.workOrderCode!==woCode||!live.reason.trim()||live.processType!=='WORK_ORDER_DEPARTMENT')
            throw new Error('Jednotka již neodpovídá vyhledávání: '+itemPid);
          results.push({...live,valid:this.allowedReasons.includes(live.reason) && (woCode!==this.woWeeding||(!live.weedingNumber&&!live.weedingDate))});
          progress(++done,members.length);
        }catch(e:unknown){failure=e;}
      }
    });
    await Promise.all(workers);
    if(failure!==null)throw failure;
    if(results.length!==members.length||new Set(results.map(x=>x.itemPid)).size!==members.length)
      throw new Error('Neúplné načtení jednotek pomocného setu');
    return results;
  }
  /** Fetch live API snapshot. Never consider an old display list sufficient for a write. */
  private async liveItem(itemPid:string):Promise<ReportItem & { libraryCode:string;workOrderCode:string }>{
    const raw:any=await this.api.getItem(itemPid);
    const d=raw?.item_data||{},h=raw?.holding_data||{},b=raw?.bib_data||{};
    const mmsId=String(b?.mms_id||''),lib=String(d?.library?.value||h?.library?.value||''),loc=String(d?.location?.value||h?.location?.value||'');
    return {mmsId,barcode:String(d?.barcode||''),inventoryNumber:String(d?.inventory_number||''),
      title:String(b?.title||''),locationCode:loc,libraryCode:lib,workOrderCode:String(d?.work_order_type?.value||''),
      itemPid:String(d?.pid||itemPid),holdingId:String(h?.holding_id||''),
      weedingNumber:String(d?.weeding_number||''),weedingDate:String(d?.weeding_date||''),
      processType:String(d?.process_type?.value||''),reason:String(d?.statistics_note_2||''),valid:true,
      author:String(b?.author||''),publicationYear:String(b?.date_of_publication||''),
      acquisitionMethod:String(d?.acquisition_method?.desc||d?.acquisition_method?.value||''),
      callNumber:String(d?.alternative_call_number||h?.call_number||''),
      inventoryDate:String(d?.inventory_date||''),inventoryPrice:String(d?.inventory_price||''),
      internalNote2:String(d?.internal_note_2||''),
      isbn:String(b?.isbn||''),publisher:String(b?.publisher_const||''),
      publicationDate:String(b?.date_of_publication||''),poLine:String(d?.po_line||''),
      enumeration:[d?.enumeration_a,d?.enumeration_b,d?.chronology_i].filter(Boolean).join(' / ')};
  }
  private async persistWorkflow():Promise<void>{
    await firstValueFrom(this.settings.set({operation:this.operation,scanAttempts:this.scanAttempts}));
  }
  private assertWritable():void {
    if(!this.canWrite)throw new Error('Zápis je vypnutý. Ověřte prostředí a povolte zápisy v nastavení.');
    if(this.workflowBusy)throw new Error('Jiná operace právě probíhá.');
  }
  private operationName(prefix:string,library:string,location:string,reason:string):string {
    const timestamp=new Date().toISOString().replace(/[-:.]/g,'').replace('T','-').slice(0,15);
    return `${prefix}-${safeFilePart(this.instCode)}-${timestamp}-${safeFilePart(library)}-${safeFilePart(location)}-${safeFilePart(reason)}`.slice(0,220);
  }
  private async fillSetSafely():Promise<void>{
    const op=this.operation;
    if(!op?.setId || !/^\d{10,}$/.test(op.setId))throw new Error('Chybí jednoznačné ID setu');
    const wanted=new Set(op.memberIds);
    if(wanted.size!==op.memberIds.length || !wanted.size || [...wanted].some(x=>!x))
      throw new Error('Neplatný nebo duplicitní PID v plánovaném setu');
    // Always query Alma again. The previous add_members request might have succeeded
    // even if the browser never received its response.
    const present=new Set(await this.api.members(op.setId));
    const foreign=[...present].filter(id=>!wanted.has(id));
    if(foreign.length)throw new Error('Set obsahuje neočekávané členy. Zápisy zastaveny: '+foreign.slice(0,5).join(','));
    const missing=op.memberIds.filter(id=>!present.has(id));
    for(let offset=0;offset<missing.length;offset+=1000){
      const chunk=missing.slice(offset,offset+1000);
      this.flowProgress=`Doplňuji set: ${present.size}/${wanted.size} (dávka ${Math.floor(offset/1000)+1}/${Math.ceil(missing.length/1000)})`;
      // A lost response is not retried blindly: the whole operation stops,
      // and the next explicit resume re-reads membership from Alma.
      await this.api.addSetMembers(op.setId,chunk);
      const after=new Set(await this.api.members(op.setId));
      if(chunk.some(pid=>!after.has(pid)))throw new Error('Alma nepotvrdila všechny členy právě odeslané dávky.');
      if([...after].some(pid=>!wanted.has(pid)))throw new Error('Po doplnění se v setu objevily cizí jednotky');
      present.clear();for(const id of after)present.add(id);
      await this.persistWorkflow();
    }
    await this.api.verifyMembers(op.setId,op.memberIds);
    op.stage='members_added';op.error='';await this.persistWorkflow();
  }
  private async createVerifiedSet(name:string,memberIds:string[]):Promise<void>{
    if(!this.operation)throw new Error('No operation state');
    // stage=new was persisted before createSet. After a lost POST response
    // resume must search the exact set name and must never create a second set.
    const originalSource=JSON.stringify({library:this.operation.library,location:this.operation.location,reason:this.operation.reason});
    const id=await this.api.createSet(name,'Cloud App Odpisy; důvod: '+this.operation.reason+'; '+this.operation.createdAt+'; [ODPISY_SOURCE_V1]'+originalSource+'[/ODPISY_SOURCE_V1]');
    this.operation.setId=id;this.operation.stage='set_created';await this.persistWorkflow();
    await this.fillSetSafely();
  }
  async resumeSetPreparation():Promise<void>{
    this.error='';this.message='';
    if(this.workflowBusy || !this.operation || !['new','set_created'].includes(this.operation.stage))return;
    this.workflowBusy=true;
    try{
      const op=this.operation;
      if(!op.setId){
        const matches=await this.api.setByExactName(op.setName);
        if(matches.length!==1)throw new Error('Nalezeno '+matches.length+' setů stejného názvu. Nelze bezpečně navázat; zkontrolujte sety ručně v Almě.');
        op.setId=matches[0].id;op.stage='set_created';await this.persistWorkflow();
      }
      await this.fillSetSafely();
      this.message='Členství setu je ověřené. Job NEBYL spuštěn. Zkontrolujte set a navazující job ručně; opakované odeslání se neprovádí automaticky.';
    }catch(e:any){this.error=String(e?.message||e);if(this.operation){this.operation.error=this.error;try{await this.persistWorkflow();}catch{}}}
    finally{this.workflowBusy=false;this.flowProgress='';}
  }
  private sameMembers(a:string[],b:string[]):boolean {
    const aa=[...a].sort(),bb=[...b].sort();return aa.length===bb.length&&aa.every((x,i)=>x===bb[i]);
  }
  async beginWeeding():Promise<void>{
    this.error='';this.message='';
    try{
      this.assertWritable();
      if(!this.readyToWeed)throw new Error('Výběr není validní nebo nejsou povolené zápisy.');
      const lib=this.library,loc=this.location,reason=this.selectedReason;
      const before=this.reportItems.map(x=>String(x.itemPid||''));
      this.workflowBusy=true;this.flowProgress='Ověřuji aktuální stav sbírky…';
      // Collection-wide reason validation must be performed again immediately before any POST.
      await this.load(true);
      if(this.loadedLibrary!==lib||this.loadedLocation!==loc||this.invalidCount!==0)throw new Error('Sbírka se změnila nebo obsahuje chybné důvody.');
      const group=this.items.filter(x=>x.reason===reason);
      if(!this.sameMembers(group.map(x=>String(x.itemPid||'')),before))throw new Error('Počet nebo členství skupiny se změnilo; odpis byl zastaven.');
      const cfg=this.mappingEntries.find(x=>x.libraryCode===lib);
      if(!cfg?.sequenceName?.trim())throw new Error('Pro knihovnu není nastavená úbytková řada.');
      const today=this.operationDate;
      if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||Number.isNaN(Date.parse(today+'T12:00:00')))throw new Error('Nesprávné datum.');
      const numberPre:{[pid:string]:string}={},datePre:{[pid:string]:string}={};
      for(const item of group){
        const itemPid=String(item.itemPid||'');if(!itemPid)throw new Error('Jednotka nemá PID');
        const actual=await this.liveItem(itemPid);
        if(actual.libraryCode!==lib||actual.locationCode!==loc||actual.workOrderCode!==this.woWeeding||
          actual.processType!=='WORK_ORDER_DEPARTMENT'||actual.reason!==reason||actual.weedingNumber||actual.weedingDate)
          throw new Error('Jednotka se změnila, odpis nelze spustit: '+(actual.barcode||itemPid));
        numberPre[itemPid]=actual.weedingNumber||'';datePre[itemPid]=actual.weedingDate||'';
      }
      const locationId=await this.api.locationId(lib,loc);
      const name=this.operationName('ODP',lib,loc,reason);
      const members=[...group].sort((a,b)=>a.inventoryNumber.localeCompare(b.inventoryNumber,undefined,{numeric:true})).map(x=>String(x.itemPid));
      this.operation={kind:'weeding',stage:'new',setId:'',setName:name,instanceId:'',library:lib,
        location:loc,targetLocation:loc,reason,memberIds:members,numbersBefore:numberPre,datesBefore:datePre,
        createdAt:new Date().toISOString(),weedingDate:today,error:''};
      await this.persistWorkflow();
      this.flowProgress='Vytvářím historickou sadu…';
      await this.createVerifiedSet(name,members);
      const xml=createNumberPayload(this.operation.setId,name,locationId,cfg.sequenceName,new Date(today+'T12:00:00').getTime());
      this.flowProgress='Odesílám M18…';
      this.operation.stage='post_maybe_sent';await this.persistWorkflow();
      const instance=await this.api.runM18(xml);
      this.operation.instanceId=instance;this.operation.stage='submitted';await this.persistWorkflow();
      this.startJobPolling();
      this.message='Job byl přijat. Instance '+instance+'. Pro dokončení použijte „Zkontrolovat job“.';
      this.selectedReason=reason;
    }catch(e:any){
      this.error=e?.message||String(e);
      if(this.operation){this.operation.error=this.error;try{await this.persistWorkflow();}catch{}}
    }finally{this.workflowBusy=false;this.flowProgress='';}
  }
  async loadWorkflowItems():Promise<void>{
    this.error='';this.message='';this.flowLoaded=false;this.flowItems=[];this.flowInvalid=0;this.flowSkipped=0;
    if(!this.flowLibrary||!this.flowLocation)return;
    if((this.tab==='move'||this.tab==='done') && !this.workflowSourceSetId){
      this.error='Nejprve vyberte původní odpisový set pro tuto knihovnu a sbírku. Samotný výběr 16 jednotek nestačí.';return;
    }
    this.workflowBusy=true;
    try{
      const lib=this.flowLibrary,loc=this.flowLocation;
      const wo=this.tab==='done'?this.woWeeding:this.woDone;
      const fetched=await this.discoverItems(lib,loc,wo,(n,total)=>this.flowProgress=`${n}/${total}`);
      if(lib!==this.flowLibrary||loc!==this.flowLocation)throw new Error('Výběr knihovny se během načítání změnil.');
      let eligible=fetched.filter(x=>!!(x.itemPid && x.weedingNumber && x.weedingDate && x.holdingId));
      if(this.workflowSourceSetId){
        const wanted=new Set(await this.api.members(this.workflowSourceSetId));
        eligible=eligible.filter(x=>wanted.has(String(x.itemPid)));
        // A partial set is NOT silently passed to the next job.
        if(eligible.length!==wanted.size)throw new Error('Původní set má '+wanted.size+' jednotek, ale pro aktuální krok vyhovuje jen '+eligible.length+'. Zkontrolujte chyby předchozího jobu; žádný zápis nebyl proveden.');
      }
      this.flowSkipped=fetched.length-eligible.length;
      eligible.sort((a,b)=>a.inventoryNumber.localeCompare(b.inventoryNumber,undefined,{numeric:true}));
      this.flowItems=eligible;this.flowInvalid=0;
      this.flowLoaded=true;
    }catch(e:any){this.error=e?.message||String(e);this.flowItems=[];this.flowLoaded=false;}
    finally{this.workflowBusy=false;this.flowProgress='';}
  }
  exportMoveResultsCsv():void {
    const op=this.operation;if(!op || op.kind!=='move')return;
    const q=(v:string)=>'"'+String(v||'').replace(/"/g,'""')+'"';
    const rows=[['Item PID','Výsledek','Původní lokace','Cílová lokace','Úbytkové číslo','Datum odpisu'].map(q).join(';')];
    for(const itemPid of op.memberIds)rows.push([itemPid,op.resultByPid?.[itemPid]||'NEOVĚŘENO',op.location,op.targetLocation,op.numbersBefore[itemPid],op.datesBefore[itemPid]].map(q).join(';'));
    this.downloadText('presun-' +safeFilePart(op.instanceId||op.setId)+'.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');
  }
  exportWoResultsCsv():void {
    const op=this.operation;
    if(!op || op.kind!=='wo')return;
    const quote=(value:string)=>'"'+value.replace(/"/g,'""')+'"';
    const rows=[['Item PID','Stav ověření','Číslo před','Datum před'].map(quote).join(';')];
    for(const pid of op.memberIds)
      rows.push([pid,op.resultByPid?.[pid]||'NEOVĚŘENO',op.numbersBefore[pid]||'',op.datesBefore[pid]||''].map(quote).join(';'));
    this.downloadText('wo-' +safeFilePart(op.instanceId||op.setId)+'.csv','\ufeff'+rows.join('\r\n'),'text/csv;charset=utf-8');
  }
  async beginWoM18():Promise<void>{
    this.error='';this.message='';
    try {
      this.assertWritable();
      if(!this.readyToWoJob)
        throw new Error('Neplatné potvrzení hromadného převodu.');
      const lib=this.flowLibrary,loc=this.flowLocation,cfg=this.chosenFlowConfig!;
      const planned=[...this.flowItems], members=planned.map(x=>String(x.itemPid||''));
      if(!this.workflowSourceReason || planned.some(x=>x.reason!==this.workflowSourceReason))
        throw new Error('Neshoduje se důvod odpisu s původním setem. Zápis byl zastaven.');
      if(new Set(members).size!==members.length)throw new Error('Duplicitní PID');
      this.workflowBusy=true;
      const numbers:{[pid:string]:string}={},dates:{[pid:string]:string}={};
      for(let i=0;i<planned.length;i++){
        const item=planned[i],pid=members[i];
        this.flowProgress=`Kontrola před M18 ${i+1}/${planned.length}`;
        const live=await this.liveItem(pid);
        if(live.libraryCode!==lib||live.locationCode!==loc||live.workOrderCode!==this.woWeeding||
           live.processType!=='WORK_ORDER_DEPARTMENT'||!live.weedingNumber||!live.weedingDate||
           live.weedingNumber!==item.weedingNumber||live.weedingDate!==item.weedingDate)
          throw new Error('Jednotka změnila stav; M18 zastaven: '+pid);
        numbers[pid]=live.weedingNumber;dates[pid]=live.weedingDate;
      }
      const name=this.workflowSourceSetName;
      if(!name||!this.workflowSourceSetId)throw new Error('Chybí zdrojový set odpisové dávky');
      this.operation={kind:'wo',stage:'new',setId:'',setName:name,instanceId:'',library:lib,location:loc,
        targetLocation:loc,reason:this.workflowSourceReason,memberIds:members,numbersBefore:numbers,datesBefore:dates,
        createdAt:new Date().toISOString(),error:'',resultByPid:{}};
      await this.persistWorkflow();
      this.operation.setId=this.workflowSourceSetId;await this.api.verifyMembers(this.operation.setId,members);
      this.operation.stage='members_added';await this.persistWorkflow();
      const payload=createWoPayload(this.operation.setId,name,cfg.woDepartmentId,this.woDone);
      this.operation.stage='post_maybe_sent';await this.persistWorkflow();
      const instance=await this.api.runM18(payload);
      this.operation.instanceId=instance;this.operation.stage='submitted';await this.persistWorkflow();
      this.startJobPolling();
      this.message='M18 pro WO odeslán, instance '+instance+'. Job může mít částečné chyby; ověřte každou jednotku a report v Monitor Jobs.';
    }catch(e:any){this.error=String(e?.message||e);
      if(this.operation){this.operation.error=this.error;try{await this.persistWorkflow();}catch{}}}
    finally{this.workflowBusy=false;this.flowProgress='';}
  }
  async beginScan():Promise<void>{
    this.error='';this.message='';
    try{
      this.assertWritable();
      if(!this.readyToScan)throw new Error('Jednotky nejsou připravené ke změně WO.');
      const lib=this.flowLibrary,loc=this.flowLocation,cfg=this.chosenFlowConfig!;
      const planned=[...this.flowItems];
      this.workflowBusy=true;
      this.flowProgress='Ověřuji pult/oddělení v Almě…';
      await this.api.validateScanner(lib,this.woDone,cfg.scanMode,cfg.scanCode);
      for(let i=0;i<planned.length;i++){
        const item=planned[i],pid=String(item.itemPid||'');
        this.flowProgress=`Scan-in ${i+1}/${planned.length}: ${item.barcode}`;
        const live=await this.liveItem(pid);
        if(live.workOrderCode===this.woDone && live.locationCode===loc){
          this.scanAttempts[pid]='confirmed';await this.persistWorkflow();continue;
        }
        if(this.scanAttempts[pid])throw new Error('Předchozí scan-in není bezpečně uzavřen: '+pid);
        if(live.libraryCode!==lib||live.locationCode!==loc||live.workOrderCode!==this.woWeeding||
          live.processType!=='WORK_ORDER_DEPARTMENT'||!live.weedingNumber||!live.weedingDate||
          live.weedingNumber!==item.weedingNumber||live.weedingDate!==item.weedingDate)
          throw new Error('Jednotka změnila stav; scan-in zastaven: '+pid);
        // Persist attempted before network POST to prevent duplicate scans after an ambiguous response.
        this.scanAttempts[pid]='post_maybe_sent';await this.persistWorkflow();
        await this.api.scanIn(pid,live.mmsId,live.holdingId||String(item.holdingId||''),lib,this.woDone,cfg.scanMode,cfg.scanCode);
        const changed=await this.liveItem(pid);
        if(changed.libraryCode!==lib||changed.locationCode!==loc||changed.workOrderCode!==this.woDone||
          changed.weedingNumber!==live.weedingNumber||changed.weedingDate!==live.weedingDate)
          throw new Error('Scan-in byl přijat, ale následný stav jednotky je nečekaný: '+pid);
        this.scanAttempts[pid]='confirmed';await this.persistWorkflow();
      }
      this.flowLoaded=false;
      this.message='Scan-in ověřen pro '+planned.length+' jednotek. Znovu načtěte sbírku.';
    }catch(e:any){this.error=e?.message||String(e);}
    finally{this.workflowBusy=false;this.flowProgress='';}
  }
  async beginMove():Promise<void>{
    this.error='';this.message='';
    try{
      this.assertWritable();
      if(!this.readyToMove)throw new Error('Jednotky nejsou připravené k přesunu.');
      const lib=this.flowLibrary,loc=this.flowLocation,cfg=this.chosenFlowConfig!;
      if(loc===cfg.locationCode)throw new Error('Jednotky jsou již v cílové sbírce.');
      const planned=[...this.flowItems],members=planned.map(x=>String(x.itemPid||''));
      if(!this.workflowSourceReason || planned.some(x=>x.reason!==this.workflowSourceReason))
        throw new Error('Neshoduje se důvod odpisu s původním setem. Zápis byl zastaven.');
      this.workflowBusy=true;
      this.flowProgress='Ověřuji jednotky…';
      const now=await this.discoverItems(lib,loc,this.woDone,(n,total)=>this.flowProgress=`${n}/${total}`);
      const chosenIds=new Set(members);
      const nowEligible=now.filter(x=>!!(x.itemPid&&x.weedingNumber&&x.weedingDate&&x.holdingId)&&chosenIds.has(String(x.itemPid)));
      if(!this.sameMembers(nowEligible.map(x=>String(x.itemPid||'')),members))throw new Error('Členství skupiny se změnilo; přesun zastaven.');
      const numbers:{[pid:string]:string}={},dates:{[pid:string]:string}={};
      for(const item of planned){
        const pid=String(item.itemPid||''),actual=await this.liveItem(pid);
        if(actual.libraryCode!==lib||actual.locationCode!==loc||actual.workOrderCode!==this.woDone||
          actual.processType!=='WORK_ORDER_DEPARTMENT'||!actual.weedingNumber||!actual.weedingDate||
          actual.weedingNumber!==item.weedingNumber||actual.weedingDate!==item.weedingDate)
          throw new Error('Jednotka není ve správném stavu před přesunem: '+pid);
        numbers[pid]=actual.weedingNumber;dates[pid]=actual.weedingDate;
      }
      const locationId=await this.api.locationId(lib,cfg.locationCode);
      const name=this.workflowSourceSetName;
      if(!name||!this.workflowSourceSetId)throw new Error('Chybí zdrojový set odpisové dávky');
      this.operation={kind:'move',stage:'new',setId:'',setName:name,instanceId:'',library:lib,location:loc,
        targetLocation:cfg.locationCode,reason:this.workflowSourceReason,memberIds:members,numbersBefore:numbers,datesBefore:dates,
        createdAt:new Date().toISOString(),error:''};
      await this.persistWorkflow();
      this.operation.setId=this.workflowSourceSetId;await this.api.verifyMembers(this.operation.setId,members);
      this.operation.stage='members_added';await this.persistWorkflow();
      const payload=createMovePayload(this.operation.setId,name,locationId);
      this.operation.stage='post_maybe_sent';await this.persistWorkflow();
      const instance=await this.api.runM18(payload);
      this.operation.instanceId=instance;this.operation.stage='submitted';await this.persistWorkflow();
      this.startJobPolling();
      this.message='M18 přesun přijat, instance '+instance+'. Před dalším zpracováním zkontrolujte dokončení.';
    }catch(e:any){this.error=e?.message||String(e);
      if(this.operation){this.operation.error=this.error;try{await this.persistWorkflow();}catch{}}
    }finally{this.workflowBusy=false;this.flowProgress='';}
  }
  async checkOperation():Promise<void>{
    this.error='';this.message='';
    if(!this.operation?.instanceId){this.error='Instance jobu není známá. Neposílejte další POST; ověřte Monitor Jobs.';return;}
    this.workflowBusy=true;
    try{
      const op=this.operation,status=await this.api.jobStatus(op.instanceId);
      if(!status){this.message='Job zatím nevrátil jednoznačný stav.';return;}
      if(status.startsWith('COMPLETED') || status==='FAILED' || status==='CANCELED' || status==='CANCELLED'){
        const afterNumbers=new Set<string>();
        const failures:string[]=[];op.resultByPid=op.resultByPid||{};
        for(let i=0;i<op.memberIds.length;i++){
          this.flowProgress=`Kontrola ${i+1}/${op.memberIds.length}`;
          const id=op.memberIds[i];
          let live:any;
          try{live=await this.liveItem(id);}
          catch(e:any){
            if(op.kind!=='wo')throw e;
            op.resultByPid[id]='NEOVĚŘENO (GET selhal: '+String(e?.message||e)+')';
            failures.push(id);continue;
          }
          if(op.kind==='wo'){
            const ok=live.libraryCode===op.library&&live.locationCode===op.location&&
              live.processType==='WORK_ORDER_DEPARTMENT'&&live.workOrderCode===this.woDone&&
              live.weedingNumber===op.numbersBefore[id]&&live.weedingDate===op.datesBefore[id];
            op.resultByPid[id]=ok?'OK':'NEOVĚŘENO (zjištěný stav neodpovídá cíli)';
            if(!ok)failures.push(id);
            continue;
          }
          if(live.libraryCode!==op.library||live.locationCode!==op.targetLocation||
            live.processType!=='WORK_ORDER_DEPARTMENT'||live.workOrderCode!==(op.kind==='weeding'?this.woWeeding:this.woDone))
            throw new Error('Stav po M18 nesouhlasí u jednotky '+id);
          if(op.kind==='weeding'){
            if(!live.weedingNumber||!live.weedingDate)throw new Error('Chybí úbytkové číslo nebo datum: '+id);
            const checkedDay=this.almaWeedingDay(live.weedingDate);
            if(!checkedDay)throw new Error('Neplatné datum odpisu u '+id);
            if(op.weedingDate && checkedDay!==op.weedingDate)throw new Error('Datum odpisu nesouhlasí s vybraným datem u '+id);
            op.weedingDate=checkedDay;
            if(afterNumbers.has(live.weedingNumber))throw new Error('Duplicitní úbytkové číslo: '+live.weedingNumber);
            afterNumbers.add(live.weedingNumber);
          }else if(live.weedingNumber!==op.numbersBefore[id]||live.weedingDate!==op.datesBefore[id])
            throw new Error('Při přesunu se změnilo úbytkové číslo nebo datum: '+id);
          op.resultByPid[id]='OK';
        }
        op.stage=failures.length||status!=='COMPLETED_SUCCESS'?'failed':'complete';
        op.error=failures.length?'Nevyhovující jednotky: '+failures.join(', '):status!=='COMPLETED_SUCCESS'?'Job skončil '+status:'';
        await this.persistWorkflow();this.stopJobPolling();
        if(op.error)this.error=op.error+'; zkontrolujte report M18. Automatické opakování je zakázáno.';
        else this.message='Job '+op.instanceId+' skončil COMPLETED_SUCCESS a všechny jednotky prošly kontrolou.';
        // Metadata are updated AFTER verification. Failed metadata writes must not undo a verified job.
        // Persist source phase state, then read back metadata and set membership through Alma API.
        await this.recordCurrentJobInSet(true);
      } else if(status.startsWith('COMPLETED')){
        op.stage='failed';op.error='Job '+op.instanceId+' skončil '+status+'. Neposílejte další POST.';
        await this.persistWorkflow();this.stopJobPolling();this.error=op.error;
      }else{
        this.message='Stav jobu '+op.instanceId+': '+status+'. Kontrolu můžete bezpečně opakovat.';
      }
    }catch(e:any){this.error=e?.message||String(e);}
    finally{this.workflowBusy=false;this.flowProgress='';}
  }
  async loadHistory(){
    this.error='';this.historyLoading=true;
    try{
      const found=(await this.api.findHistoricalSets('ODP-'))
        .filter(x=>!x.name.startsWith('ODP-MOVE-')&&!x.name.startsWith('ODP-DISCOVERY-'))
        .sort((a,b)=>b.name.localeCompare(a.name));
      this.historicalSets=found;
      this.historyDateScanned=false;
      if(this.historyFilterFrom||this.historyFilterTo){
        let checked=0;
        const narrowed=found.filter(x=>(!this.historyFilterLibrary||x.name.includes('-'+this.historyFilterLibrary+'-'))&&
          (!this.historyFilterLocation||x.name.includes('-'+this.historyFilterLocation.trim()+'-')));
        for(const entry of narrowed){
          this.flowProgress='Ověřuji datum odpisu '+(++checked)+'/'+narrowed.length;
          await this.detectHistoricalWeedingDate(entry.id,entry.name);
        }
        this.historyDateScanned=true;
      }
      this.verifiedSourceSets=[];
      if(this.flowLibrary&&this.flowLocation){
        // A name is only used to shortlist requests. The source marker in the
        // detail is authoritative, including diacritics in the reason.
        const marker=`-${this.flowLibrary}-${this.flowLocation}-`;
        const candidates=found.filter(x=>x.name.includes(marker));
        const op=this.operation;
        if(op?.kind==='weeding'&&op.stage==='complete'&&op.setId &&
           op.library===this.flowLibrary&&op.location===this.flowLocation&&
           !candidates.some(x=>x.id===op.setId))candidates.push({id:op.setId,name:op.setName});
        for(const candidate of candidates){
          const d=await this.api.getSetDetail(candidate.id);
          if(String(d?.id||'')!==candidate.id ||
             String(d?.type?.value??d?.type??'').toUpperCase()!=='ITEMIZED')continue;
          const src=this.sourceMetadataFromDetail(d);
          if(src?.library===this.flowLibrary&&src?.location===this.flowLocation)
            this.verifiedSourceSets.push({id:candidate.id,name:String(d.name),...src});
        }
      }
      const matches=this.workflowSetsForLocation;
      this.message='Z Almy načteno '+found.length+' odpisových setů; pro '+
        (this.flowLibrary||'—')+'/'+(this.flowLocation||'—')+' ověřeno '+matches.length+'.';
      // Only keep a selected source if it still belongs to the verified group.
      if(this.workflowSourceSetId && !matches.some(x=>x.id===this.workflowSourceSetId)){
        this.workflowSourceSetId='';this.workflowSourceSetName='';this.workflowSourceReason='';
        this.flowLoaded=false;this.flowItems=[];
      }
      if(!this.workflowSourceSetId && this.canUseLastWeedingSet)
        await this.useLastWeedingSet();
      if(!this.workflowSourceSetId && matches.length===1){
        this.workflowSourceSetId=matches[0].id;
        await this.selectWorkflowSourceSet();
      }
      if(!matches.length)this.message+=' Žádný odpovídající set. Zkontrolujte knihovnu a původní sbírku.';
    }catch(e:any){
      this.error='Načtení setů selhalo: '+String(e?.message||e);
    }finally{this.historyLoading=false;}
  }
  onHistoricalSetChange():void{
    // Prevent a report from a previously selected three-item set being displayed
    // as if it belonged to a newly selected sixteen-item set.
    this.historicalItems=[];this.historicalReportSetId='';
    this.historyLibrary='';this.historyLocation='';this.historyReason='';
    this.setDetail=null;this.metadataDescription='';this.metadataNote='';
  }
  async loadHistoricalReport(){
    this.error='';this.onHistoricalReportReset();
    const chosenId=this.selectedHistoricalSet;
    if(!chosenId)return;
    this.historyLoading=true;
    try{
      const detail=await this.api.getSetDetail(chosenId);
      if(String(detail?.id||'')!==chosenId ||
         String(detail?.type?.value??detail?.type??'').toUpperCase()!=='ITEMIZED')
        throw new Error('Historický set nemá očekávané ID nebo typ ITEMIZED');
      const source=this.sourceMetadataFromDetail(detail);
      if(!source)throw new Error('Původní sbírku nelze ze setu bezpečně určit. Ověřte metadata setu.');
      const members=await this.api.members(chosenId);
      if(!members.length)throw new Error('Vybraný historický set je prázdný');
      const out:ReportItem[]=[];
      for(let i=0;i<members.length;i++){
        this.flowProgress=`${i+1}/${members.length}`;
        out.push(await this.liveItem(members[i]));
      }
      if(chosenId!==this.selectedHistoricalSet)throw new Error('Historický set byl během načítání změněn');
      if(out.length!==members.length)throw new Error('Historický seznam není kompletní');
      // History date comes from the set metadata or its creation date, not from these items.
      // Use the same acquisition-method rules as the public accession-list app.
      // Read only; do not infer purchases from item price or order number alone.
      if(this.includeAcquisitionMethod)await this.enrichHistoricalAcquisitionMethods(out, chosenId);
      else for(const item of out){item.acquisitionMethod=this.isHistoricalRetroItem(item)?'Retrokatalogizace':'';}
      this.historyLibrary=source.library;this.historyLocation=source.location;
      this.historyReason=source.reason;
      this.historicalItems=out;this.historicalReportSetId=chosenId;
      this.message='Načten úbytkový seznam setu '+chosenId+': '+out.length+' jednotek; původní sbírka '+source.library+'/'+source.location+'.';
    }catch(e:any){this.onHistoricalReportReset();this.error=e?.message||String(e);}
    finally{this.historyLoading=false;this.flowProgress='';}
  }
  /** Accession-list-compatible acquisition method for the historical print and CSV.
   * Fetch PO lines only for the selected historical set; do not load invoices.
   * Missing/inaccessible acquisition data stays empty and does not block a report.
   */
  private async enrichHistoricalAcquisitionMethods(items:ReportItem[], setId:string):Promise<void>{
    const cache=new Map<string,string>();
    for(let i=0;i<items.length;i++){
      if(this.selectedHistoricalSet!==setId)throw new Error('Historický set byl během načítání změněn');
      const item=items[i];
      if(this.isHistoricalRetroItem(item)){
        item.acquisitionMethod='Retrokatalogizace';
        item.inventoryPrice='';
        continue;
      }
      const poLine=String(item.poLine||'').trim();
      if(!poLine)continue;
      if(cache.has(poLine)){
        item.acquisitionMethod=cache.get(poLine)!;
        continue;
      }
      this.flowProgress=`Akviziční údaje ${i+1}/${items.length}`;
      let method='';
      try{
        const response:any=await firstValueFrom(this.rest.call<any>(
          `/almaws/v1/acq/po-lines/${encodeURIComponent(poLine)}?format=json`
        ));
        const raw=String(response?.acquisition_method?.desc||response?.acquisition_method?.value||'');
        method=this.translateHistoricalAcquisitionMethod(raw);
      }catch(error:any){
        // Some institutions do not have acquisition API permissions; printing
        // should still work, but do not present an invented acquisition method.
        console.warn('Způsob nabytí není dostupný pro PO line '+poLine,error);
      }
      cache.set(poLine,method);
      item.acquisitionMethod=method;
    }
  }
  private isHistoricalRetroItem(item:ReportItem):boolean{
    const price=String(item.inventoryPrice||'').trim().replace(',','.');
    return /^-1(?:\.0+)?$/.test(price) ||
      /Z30-PRICE\s*:\s*-1(?:\.0+)?(?:\s|$)/i.test(String(item.internalNote2||''));
  }
  private translateHistoricalAcquisitionMethod(value:string):string{
    switch(value.trim().toUpperCase()){
      case 'PURCHASE':return 'Nákup';
      case 'GIFT':return 'Dar';
      case 'EXCHANGE':return 'Výměna';
      case 'LEGAL DEPOSIT':case 'LEGAL_DEPOSIT':case 'LEGALDEPOSIT':return 'Povinný výtisk';
      case 'NONE':return '';
      default:return value;
    }
  }
  private onHistoricalReportReset():void{
    this.historicalItems=[];this.historicalReportSetId='';
    this.historyLibrary='';this.historyLocation='';this.historyReason='';
  }
  private matchesWorkOrder(processCode:string, workOrderCode:string, configuredCode:string){
    return processCode.trim()==='WORK_ORDER_DEPARTMENT' && workOrderCode.trim()===configuredCode.trim();
  }
  private normalizeLegacyWorkOrderCode(value:string, kind:'weeding'|'done'){
    const v=value.trim();
    if(kind==='weeding' && v.toLocaleLowerCase()==='vyřazování')return 'WdrWO';
    if(kind==='done' && v.toLocaleLowerCase()==='odepsáno')return 'DlWO';
    return v;
  }
}
