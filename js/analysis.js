import {escapeHtml as h,format,days,today,download,csv,number} from './utils.js';
import {summarize} from './statistics.js';
import {contextFor,timelineFor,intervalFor} from './timelines.js';
import {growthChart,barChart,icon,tool,palette} from './charts.js';

const state={filter:{},tab:'growth',timeline:'all',selected:null,calendar:false,pair:null,groupBy:'experimentGroup',yieldKey:null};
const statuses=['Aktiv','Abgeschlossen','Kontaminiert','Abgebrochen','Pausiert','Archiviert'];
const names={speciesId:'Pilzart',strainId:'Stamm',cultureId:'Kultur',substrateId:'Substrat',experimentId:'Experiment',experimentGroup:'Gruppe',status:'Status',container:'Behälter',from:'Beimpft ab',to:'Beimpft bis'};
const relationTypes={speciesId:'species',strainId:'strains',cultureId:'cultures',substrateId:'substrates',experimentId:'experiments'};
const dateText=value=>value?new Date(`${value}T12:00:00`).toLocaleDateString('de-DE'):'Nicht dokumentiert';
const openButton=(type,id,text)=>id?`<button type="button" class="text-link" data-context-type="${type}" data-context-id="${h(id)}">${h(text)}</button>`:h(text);

export function shortInfo(data,item,compact=false){
  const info=contextFor(data,item);
  if(compact)return `<span class="context-primary">${h(info.species)}</span><span class="context-secondary">${h(info.substrate)} · ${h(info.culture)}</span>`;
  return `<div class="origin-summary"><div class="origin-heading"><span class="record-code">${h(info.serial)}</span><span class="badge ${h(info.status.toLowerCase())}">${h(info.status)}</span></div><h3>${h(info.species)}</h3><div class="origin-grid"><span><small>Substrat bei Beimpfung</small>${openButton('substrates',info.substrateId,info.substrate)} <span class="muted">${h(info.recipeNumber)}${info.revision!=null?' · Rev. '+h(info.revision):''}</span></span><span><small>Stamm / Kultur</small>${openButton('strains',info.strainId,info.strain)} · ${openButton('cultures',info.cultureId,info.culture)}</span><span><small>Beimpft</small>${h(dateText(item.date))}</span><span><small>Herkunftsstand</small>${info.historical?'Bei Beimpfung gespeichert':'Aktuelle Stammdaten'}</span></div>${item.contaminated?`<p class="contamination-stamp">${icon('biohazard')} Kontamination: ${item.contaminatedDate?h(dateText(item.contaminatedDate)):'Datum nicht dokumentiert'}</p>`:''}</div>`;
}

export function bindContext(container,onOpen){
  container.querySelectorAll('[data-context-type]').forEach(button=>button.onclick=()=>onOpen(button.dataset.contextType,button.dataset.contextId));
}

function field(key,rows,value){
  return `<label>${names[key]}<select name="${key}"><option value="">Alle</option>${rows.map(row=>typeof row==='string'?`<option value="${h(row)}" ${row===value?'selected':''}>${h(row)}</option>`:`<option value="${h(row.id)}" ${row.id===value?'selected':''}>${h([row.code||row.number||row.serial,row.name||row.title].filter(Boolean).join(' · '))}</option>`).join('')}</select></label>`;
}

function filterLabel(data){
  const values=Object.entries(state.filter).filter(([,value])=>value).map(([key,value])=>{
    const row=(data[relationTypes[key]]||[]).find(item=>item.id===value);
    return `${names[key]}: ${row?.name||row?.title||row?.code||value}`;
  });
  return values.length?values.join(' · '):'Alle Ansätze';
}

function filterPanel(data,sum){
  const groups=[...new Set((data.inoculations||[]).map(row=>row.experimentGroup).filter(Boolean))];
  const containers=[...new Set((data.inoculations||[]).map(row=>row.container).filter(Boolean))];
  return `<div class="analysis-filter"><div class="filter-summary"><span>${icon('sliders-horizontal')} <strong>${sum.rows.length}</strong> Ansätze</span><span class="filter-caption">${h(filterLabel(data))}</span><button class="quiet" type="button" data-filter-reset>${icon('rotate-ccw')} Zurücksetzen</button></div><details class="filter-details"><summary>Auswahl filtern</summary><form data-filter-form><div class="filter-grid">${Object.entries(relationTypes).map(([key,type])=>field(key,data[type]||[],state.filter[key])).join('')}${field('experimentGroup',groups,state.filter.experimentGroup)}${field('status',statuses,state.filter.status)}${field('container',containers,state.filter.container)}<label>Beimpft ab<input type="date" name="from" value="${h(state.filter.from||'')}"></label><label>Beimpft bis<input type="date" name="to" value="${h(state.filter.to||'')}"></label></div><button class="primary" type="submit">Auswahl anwenden</button><p data-filter-error role="alert"></p></form></details></div>`;
}

function metrics(sum){
  const measured=new Set(sum.measurements.map(row=>row.inoculationId)).size;
  const definitions=[['Ansätze',sum.rows.length,`${sum.completed.length} abgeschlossen`,''],['Aktiv',sum.rows.filter(row=>row.status==='Aktiv').length,'Laufende Kultivierungen','Aktiv'],['Kontaminiert',sum.contaminated.length,sum.contamination==null?'Keine Bezugsgruppe':`${format(sum.contamination*100)} % der Auswahl`,'Kontaminiert'],['Erntedurchgänge',sum.harvests.length,`${new Set(sum.harvests.map(row=>row.inoculationId)).size} Ansätze mit Ernte`,''],['Median Laufzeit',sum.medianDays==null?'–':format(sum.medianDays),`${sum.durations.length} dokumentierte Abschlüsse · Tage`,''],['Messabdeckung',sum.rows.length?`${format(measured/sum.rows.length*100)} %`:'–',`${measured} Ansätze mit Messung`,'']];
  return `<div class="metric-grid">${definitions.map(([label,value,detail,status])=>`<button class="analysis-metric ${status==='Kontaminiert'?'metric-danger':''}" data-metric-status="${h(status)}"><span>${h(label)}</span><strong>${h(value)}</strong><small>${h(detail)}</small></button>`).join('')}</div>`;
}

function section(title,body,subtitle='',extra=''){
  return `<section class="analysis-section ${extra}"><div class="section-heading"><div><h2>${h(title)}</h2>${subtitle?`<p>${h(subtitle)}</p>`:''}</div></div>${body}</section>`;
}

function pairOptions(sum){
  return [...new Map(sum.measurements.filter(row=>number(row.value)!=null&&row.kind!=='Phase').map(row=>[JSON.stringify([row.kind,row.unit]),[row.kind,row.unit]])).values()];
}

function growthMarkup(sum){
  const pairs=pairOptions(sum);
  if(!pairs.some(pair=>JSON.stringify(pair)===state.pair))state.pair=pairs.length?JSON.stringify(pairs[0]):null;
  return `<div class="plot-controls"><label>Messgröße<select data-growth-pair>${pairs.map(pair=>`<option value="${h(JSON.stringify(pair))}" ${JSON.stringify(pair)===state.pair?'selected':''}>${h(pair[0])} · ${h(pair[1])}</option>`).join('')}</select></label><div class="segmented" aria-label="Zeitachse"><button data-calendar="false" class="${!state.calendar?'selected':''}" aria-pressed="${!state.calendar}">Tag seit Beimpfung</button><button data-calendar="true" class="${state.calendar?'selected':''}" aria-pressed="${state.calendar}">Kalender</button></div></div><div data-growth-chart></div>`;
}

function cohortTable(data,rows){
  return `<div class="table-wrap cohort-table"><table><thead><tr><th>Ansatz / Herkunft</th><th>Beimpft</th><th>Status</th><th>Ernten</th></tr></thead><tbody>${rows.map(item=>`<tr><td>${openButton('inoculations',item.id,item.serial)}${shortInfo(data,item,true)}</td><td>${h(dateText(item.date))}</td><td><span class="badge ${h((item.status||'').toLowerCase())}">${h(item.status||'–')}</span></td><td>${(data.harvests||[]).filter(row=>row.inoculationId===item.id).length}</td></tr>`).join('')}</tbody></table>${!rows.length?'<div class="empty">Keine Ansätze in dieser Auswahl.</div>':''}</div>`;
}

function overview(data,sum){
  const latest=sum.rows.flatMap(item=>timelineFor(data,item).map(event=>({...event,item}))).sort((first,second)=>second.date.localeCompare(first.date)).slice(0,8);
  const events=latest.map(event=>`<div class="activity-row"><span class="event-dot ${event.tone}"></span><div><strong>${h(event.kind)}</strong><span>${openButton('inoculations',event.item.id,event.item.serial)} · ${h(contextFor(data,event.item).species)}</span></div><time>${h(dateText(event.date))}</time></div>`).join('')||'<div class="empty">Noch keine dokumentierten Ereignisse.</div>';
  const yieldSummary=sum.yields.map(group=>`<div class="yield-summary"><small>${h(group.key)}</small><strong>${h(format(group.total))}</strong><span>${group.n} Ansätze · Ø ${h(format(group.average))} je Ansatz</span></div>`).join('')||'<div class="empty">Noch keine dokumentierten Ernten.</div>';
  return `${metrics(sum)}<div class="analysis-columns">${section('Wachstumsverläufe',growthMarkup(sum),'Dokumentierte Werte je Ansatz','wide-section')}${section('Bestandsstatus','<div data-status-chart></div>','Aktueller Stand der Auswahl')}</div><div class="analysis-columns">${section('Letzte Laborereignisse',events)}${section('Dokumentierter Ertrag',yieldSummary,'Massearten bleiben getrennt')}</div>${section('Ansätze im Blick',cohortTable(data,sum.rows))}`;
}

function timelineGrid(data,rows){
  const known=rows.filter(item=>item.date);
  if(!known.length)return '<div class="empty">Keine datierten Ansätze in dieser Auswahl.</div>';
  const first=known.reduce((value,item)=>item.date<value?item.date:value,known[0].date);
  const last=known.flatMap(item=>[...timelineFor(data,item).map(row=>row.date),intervalFor(item).end||item.date]).sort().at(-1)||today();
  const total=Math.max(1,days(first,last)||1);
  const percent=date=>Math.max(0,Math.min(100,(days(first,date)||0)/total*100));
  const ticks=Array.from({length:6},(_,index)=>{
    const date=new Date(`${first}T12:00:00`);date.setDate(date.getDate()+Math.round(total*index/5));
    return `<span style="left:${index*20}%">${h(date.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}))}</span>`;
  }).join('');
  return `<div class="timeline-scroll"><div class="timeline-board"><div class="timeline-axis"><span>Ansatz / Herkunft</span><div>${ticks}</div></div>${known.map(item=>{
    const interval=intervalFor(item),info=contextFor(data,item);
    return `<div class="timeline-track"><div class="timeline-identity">${openButton('inoculations',item.id,item.serial)}${shortInfo(data,item,true)}</div><div class="timeline-lane">${interval.end?`<span class="duration-bar ${interval.ongoing?'ongoing':''}" style="left:${percent(item.date)}%;width:${Math.max(0.3,percent(interval.end)-percent(item.date))}%" title="${h(`${interval.duration} Tage${interval.ongoing?' · laufend':''}`)}"></span>`:''}${timelineFor(data,item).map(event=>`<button class="time-marker ${event.tone}" style="left:${percent(event.date)}%" data-context-type="${event.ownerType||'inoculations'}" data-context-id="${h(event.ownerId||item.id)}" title="${h(`${item.serial} · ${info.species} · ${info.substrate} · ${event.date} · ${event.kind} ${event.detail}`)}" aria-label="${h(`${item.serial} · ${event.date} · ${event.kind}`)}"></button>`).join('')}</div></div>`;
  }).join('')}</div></div><div class="timeline-key"><span><i class="event-dot start"></i>Beimpfung</span><span><i class="event-dot measurement"></i>Messung / Phase</span><span><i class="event-dot harvest"></i>Ernte</span><span><i class="event-dot contamination"></i>Kontamination</span><span>Gestrichelt: laufend bis heute</span></div>`;
}

function timelineView(data,sum){
  const modes=[['all','Alle Ansätze'],['single','Einzelverlauf'],['groups','Versuchsvergleich']];
  const tabs=`<div class="view-tabs" role="tablist" aria-label="Zeitlinienansicht">${modes.map(([key,label])=>`<button role="tab" aria-selected="${state.timeline===key}" data-timeline-mode="${key}" class="${state.timeline===key?'selected':''}">${label}</button>`).join('')}</div>`;
  if(state.timeline==='groups')return tabs+comparison(data,sum)+section('Wachstum ab Beimpfung',growthMarkup(sum));
  if(state.timeline==='all')return tabs+section('Kultivierungen im Zeitverlauf',timelineGrid(data,sum.rows),`${sum.rows.length} Ansätze · dokumentierte Ereignisse`);
  if(!sum.rows.some(item=>item.id===state.selected))state.selected=sum.rows[0]?.id||null;
  const item=sum.rows.find(row=>row.id===state.selected);
  if(!item)return tabs+'<div class="empty">Keine Ansätze in dieser Auswahl.</div>';
  const events=timelineFor(data,item);
  const chooser=`<label class="record-select">Ansatz<select data-selected-record>${sum.rows.map(row=>`<option value="${h(row.id)}" ${row.id===item.id?'selected':''}>${h(row.serial)} · ${h(contextFor(data,row).species)}</option>`).join('')}</select></label>`;
  return tabs+chooser+shortInfo(data,item)+`<div class="analysis-columns">${section('Vom Substrat zur Ernte',`<ol class="event-timeline">${events.map(event=>`<li class="${event.tone}"><time>${h(dateText(event.date))}</time><div><strong>${event.ownerType?openButton(event.ownerType,event.ownerId,event.kind):h(event.kind)}</strong><p>${h(event.detail)}</p></div></li>`).join('')}</ol>${item.contaminated&&!item.contaminatedDate?'<p class="muted">Kontamination dokumentiert · Zeitpunkt unbekannt</p>':''}`)}${section('Wachstum dieses Ansatzes',growthMarkup({...sum,rows:[item],measurements:sum.measurements.filter(row=>row.inoculationId===item.id)}))}</div>`;
}

function comparisonGroups(data,sum){
  const groups=new Map();
  for(const item of sum.rows){
    const info=contextFor(data,item);
    const experiment=(data.experiments||[]).find(row=>row.id===item.experimentId);
    const label=state.groupBy==='substrateId'?`${info.recipeNumber} · ${info.substrate}${info.revision!=null?' · Rev. '+info.revision:''}`:state.groupBy==='strainId'?`${info.strain} · ${info.species}`:state.groupBy==='experimentGroup'?`${experiment?.number||experiment?.title||'Ohne Experiment'} · ${item.experimentGroup||'Ohne Gruppe'}`:item[state.groupBy]||'Ohne Gruppe';
    const key=state.groupBy==='substrateId'?`${item.substrateId}:${info.revision??'unknown'}`:state.groupBy==='strainId'?info.strainId||'unknown':state.groupBy==='experimentGroup'?`${item.experimentId||''}:${item.experimentGroup||''}`:label;
    if(!groups.has(key))groups.set(key,{name:label,items:[]});
    groups.get(key).items.push(item);
  }
  return [...groups.values()].map(({name,items})=>({name,summary:summarize({...data,inoculations:items})}));
}

function comparison(data,sum){
  const groups=comparisonGroups(data,sum),keys=sum.yields.map(group=>group.key);
  if(!keys.includes(state.yieldKey))state.yieldKey=keys[0]||null;
  return `<div class="plot-controls"><label>Vergleichen nach<select data-group-by>${[['experimentGroup','Versuchsgruppe'],['substrateId','Substrat / Revision'],['strainId','Stamm'],['container','Behälter']].map(([key,label])=>`<option value="${key}" ${state.groupBy===key?'selected':''}>${label}</option>`).join('')}</select></label><label>Ertragsbasis<select data-yield-key>${keys.map(key=>`<option ${key===state.yieldKey?'selected':''}>${h(key)}</option>`).join('')}</select></label></div>${section('Ertrag je unabhängigem Ansatz','<div data-comparison-chart></div>',state.yieldKey||'Keine dokumentierten Erträge')}<div class="table-wrap"><table><thead><tr><th>Gruppe</th><th>Ansätze</th><th>Kontaminiert</th><th>Ernten</th><th>Ansätze mit Ertrag</th><th>Ø Ertrag</th><th>Median Ertrag</th><th>Streuung</th><th>Median Laufzeit</th></tr></thead><tbody>${groups.map(group=>{
    const yieldGroup=group.summary.yields.find(row=>row.key===state.yieldKey),summary=group.summary;
    return `<tr><td>${h(group.name)}</td><td>${summary.rows.length}</td><td>${summary.contaminated.length} · ${format((summary.contamination||0)*100)} %</td><td>${summary.harvests.length}</td><td>${yieldGroup?.n??0}</td><td>${format(yieldGroup?.average)}</td><td>${format(yieldGroup?.median)}</td><td>${format(yieldGroup?.deviation)}</td><td>${format(summary.medianDays)} Tage</td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function statsView(data,sum){
  const tabs=[['growth','Wachstum'],['yield','Ertrag'],['duration','Laufzeit / Kontamination'],['comparison','Vergleich']];
  let body='';
  if(state.tab==='growth')body=section('Wachstum im Vergleich',growthMarkup(sum));
  if(state.tab==='yield')body=sum.yields.map(group=>section(group.key,`<div data-yield-chart="${h(group.key)}"></div><p class="stat-footnote">${group.n} Ansätze mit Ertrag · Ø ${format(group.average)} · Median ${format(group.median)} · Streuung ${format(group.deviation)}</p>`)).join('')||'<div class="empty">Noch keine vergleichbaren Erträge dokumentiert.</div>';
  if(state.tab==='duration')body=`<div class="analysis-columns">${section('Dokumentierte Laufzeiten','<div data-duration-chart></div>',`${sum.durations.length} abgeschlossene Ansätze · Median ${format(sum.medianDays)} Tage`)}${section('Kontaminationsübersicht','<div data-contamination-chart></div>',`${sum.contaminated.length} von ${sum.rows.length} Ansätzen · ${sum.unknownContaminationDates} ohne Feststellungsdatum`)}</div>${cohortTable(data,sum.contaminated)}`;
  if(state.tab==='comparison')body=comparison(data,sum);
  return `${metrics(sum)}<div class="view-tabs" role="tablist" aria-label="Auswertung">${tabs.map(([key,label])=>`<button role="tab" aria-selected="${state.tab===key}" class="${state.tab===key?'selected':''}" data-stat-tab="${key}">${label}</button>`).join('')}<div class="export-actions">${tool('printer','Bericht drucken','print')}${tool('table-2','Auswertung als CSV','report-csv')}</div></div>${body}`;
}

export function renderAnalysis(container,data,page,onOpen){
  const sum=summarize(data,state.filter),metadata=`${filterLabel(data)} · Stand ${today()}`;
  container.innerHTML=`<div class="analysis-heading"><p>${page==='dashboard'?'LABORÜBERSICHT':page==='timelines'?'KULTIVIERUNGSVERLAUF':'VERSUCHSAUSWERTUNG'}</p><span>${h(dateText(today()))}</span></div>${filterPanel(data,sum)}${page==='dashboard'?overview(data,sum):page==='timelines'?timelineView(data,sum):statsView(data,sum)}`;
  const refresh=()=>renderAnalysis(container,data,page,onOpen);
  container.querySelector('[data-filter-form]').onsubmit=event=>{
    event.preventDefault();
    const filter=Object.fromEntries(new FormData(event.currentTarget));
    if(filter.from&&filter.to&&filter.from>filter.to){container.querySelector('[data-filter-error]').textContent='Zeitraum ist ungültig';return}
    state.filter=filter;refresh();
  };
  container.querySelector('[data-filter-reset]').onclick=()=>{state.filter={};refresh()};
  container.querySelectorAll('[data-metric-status]').forEach(button=>button.onclick=()=>{state.filter={...state.filter,status:button.dataset.metricStatus};refresh()});
  container.querySelectorAll('[data-stat-tab]').forEach(button=>button.onclick=()=>{state.tab=button.dataset.statTab;refresh()});
  container.querySelectorAll('[data-timeline-mode]').forEach(button=>button.onclick=()=>{state.timeline=button.dataset.timelineMode;refresh()});
  container.querySelector('[data-selected-record]')?.addEventListener('change',event=>{state.selected=event.target.value;refresh()});
  container.querySelector('[data-growth-pair]')?.addEventListener('change',event=>{state.pair=event.target.value;refresh()});
  container.querySelectorAll('[data-calendar]').forEach(button=>button.onclick=()=>{state.calendar=button.dataset.calendar==='true';refresh()});
  container.querySelector('[data-group-by]')?.addEventListener('change',event=>{state.groupBy=event.target.value;refresh()});
  container.querySelector('[data-yield-key]')?.addEventListener('change',event=>{state.yieldKey=event.target.value;refresh()});
  bindContext(container,onOpen);
  const growth=container.querySelector('[data-growth-chart]');
  if(growth){
    const rows=page==='timelines'&&state.timeline==='single'?sum.rows.filter(row=>row.id===state.selected):sum.rows;
    if(state.pair){const [kind,unit]=JSON.parse(state.pair);growthChart(growth,sum.measurements,rows,kind,unit,{data,calendar:state.calendar,metadata,onSelect:id=>onOpen('inoculations',id)})}
    else growth.innerHTML='<div class="empty">Noch keine numerischen Messwerte für diese Auswahl.</div>';
  }
  const statusChart=container.querySelector('[data-status-chart]');
  if(statusChart)barChart(statusChart,statuses.map((name,index)=>({id:name,name,value:sum.rows.filter(item=>item.status===name).length,color:name==='Kontaminiert'?'#f48d9a':palette[index%palette.length]})),{title:'Aktueller Status',unit:'Ansätze',metadata,onSelect:status=>{state.filter={...state.filter,status};refresh()}});
  container.querySelectorAll('[data-yield-chart]').forEach(chart=>{
    const group=sum.yields.find(row=>row.key===chart.dataset.yieldChart);
    barChart(chart,group.values.map(value=>({id:value.id,name:sum.rows.find(row=>row.id===value.id)?.serial||value.id,value:value.amount})),{title:group.key,unit:group.key,metadata,onSelect:id=>onOpen('inoculations',id)});
  });
  const duration=container.querySelector('[data-duration-chart]');
  if(duration)barChart(duration,sum.completed.map(item=>({id:item.id,name:item.serial,value:days(item.date,item.endDate)})).filter(row=>row.value!=null&&row.value>=0),{title:'Laufzeit',unit:'Tage',metadata,onSelect:id=>onOpen('inoculations',id)});
  const contamination=container.querySelector('[data-contamination-chart]');
  if(contamination){
    const groups=new Map();
    for(const item of sum.contaminated)if(item.contaminatedDate)groups.set(item.contaminatedDate,(groups.get(item.contaminatedDate)||0)+1);
    barChart(contamination,[...groups].sort(([first],[second])=>first.localeCompare(second)).map(([date,value])=>({id:date,name:dateText(date),value,color:'#f48d9a'})),{title:'Festgestellte Kontaminationen',unit:'Ansätze',metadata});
  }
  const comparisonChart=container.querySelector('[data-comparison-chart]');
  if(comparisonChart)barChart(comparisonChart,comparisonGroups(data,sum).map(group=>({id:group.name,name:group.name,value:group.summary.yields.find(row=>row.key===state.yieldKey)?.average})).filter(row=>row.value!=null),{title:'Mittlerer Ertrag je Ansatz',unit:state.yieldKey||'',metadata});
  container.querySelector('[data-tool="print"]')?.addEventListener('click',()=>window.print());
  container.querySelector('[data-tool="report-csv"]')?.addEventListener('click',()=>{
    const rows=sum.rows.map(item=>{const info=contextFor(data,item);return {Ansatz:item.serial,Pilz:info.species,Stamm:info.strain,Kultur:info.culture,Substrat:info.substrate,Revision:info.revision,Beimpft:item.date,Status:item.status,Kontamination:item.contaminatedDate||'',Erntedurchgänge:sum.harvests.filter(row=>row.inoculationId===item.id).length,Filter:metadata}});
    download(new Blob([csv(rows,['Ansatz','Pilz','Stamm','Kultur','Substrat','Revision','Beimpft','Status','Kontamination','Erntedurchgänge','Filter'])],{type:'text/csv;charset=utf-8'}),'mykolab-auswertung.csv');
  });
}