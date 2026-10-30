import {dateValue,days,today,number} from './utils.js';

export function contextFor(data,item){
  const culture=(data.cultures||[]).find(row=>row.id===item.cultureId);
  const strain=(data.strains||[]).find(row=>row.id===(item.strainId||culture?.strainId));
  const species=(data.species||[]).find(row=>row.id===strain?.speciesId);
  const source=item.sourceSnapshot;
  const recipe=item.recipeSnapshot||(data.substrates||[]).find(row=>row.id===item.substrateId);
  return {
    serial:item.serial||'Ohne Kennung',
    species:source?.species?.name||species?.name||'Pilz nicht dokumentiert',
    strain:source?.strain?.name||strain?.name||'Stamm nicht dokumentiert',
    culture:source?.culture?.code||culture?.code||source?.culture?.name||culture?.name||(item.cultureId?'Kultur nicht dokumentiert':'Direkter Stamm'),
    substrate:recipe?.name||'Substrat nicht dokumentiert',
    recipeNumber:recipe?.number||'',revision:recipe?.revision??null,
    historical:Boolean(source)&&source.historical!==false,speciesId:strain?.speciesId,strainId:strain?.id,cultureId:culture?.id,
    substrateId:item.substrateId,date:item.date,status:item.status||'Nicht dokumentiert'
  };
}

export function timelineFor(data,item){
  const rows=[];
  const add=(entry)=>{if(dateValue(entry.date))rows.push(entry)};
  add({id:`start:${item.id}`,date:item.date,kind:'Beimpfung',detail:contextFor(data,item).substrate,tone:'start'});
  for(const measurement of data.measurements||[]){
    if(measurement.inoculationId!==item.id)continue;
    add({id:measurement.id,date:measurement.date,kind:measurement.kind==='Phase'?measurement.phase||'Phase':measurement.kind,detail:measurement.kind==='Phase'?measurement.notes||'':`${measurement.value??'–'} ${measurement.unit||''}`,tone:'measurement',ownerType:'measurements',ownerId:measurement.id});
  }
  for(const harvest of data.harvests||[]){
    if(harvest.inoculationId!==item.id)continue;
    add({id:harvest.id,date:harvest.date,kind:`Ernte${harvest.round?' · Durchgang '+harvest.round:''}`,detail:`${harvest.amount} ${harvest.unit} · ${harvest.massType||'Unbekannt'}`,tone:'harvest',ownerType:'harvests',ownerId:harvest.id});
  }
  if(item.contaminatedDate)add({id:`contamination:${item.id}`,date:item.contaminatedDate,kind:'Kontamination festgestellt',detail:'',tone:'contamination'});
  for(const event of data.events||[]){
    if(event.inoculationId!==item.id||['Beimpfung angelegt','Messwert eingetragen','Ernte dokumentiert','Kontamination festgestellt'].includes(event.kind))continue;
    add({...event,tone:'event'});
  }
  for(const photo of data.photos||[]){
    const harvest=(data.harvests||[]).find(row=>row.id===photo.ownerId&&row.inoculationId===item.id);
    if(!(photo.ownerType==='inoculations'&&photo.ownerId===item.id)&&!(photo.ownerType==='harvests'&&harvest))continue;
    add({id:photo.id,date:photo.date,kind:'Foto hinzugefügt',detail:photo.description||photo.name||'',tone:'photo'});
  }
  if(item.endDate)add({id:`end:${item.id}`,date:item.endDate,kind:item.status==='Abgeschlossen'?'Abgeschlossen':'Dokumentiertes Ende',detail:'',tone:'end'});
  return rows.sort((first,second)=>first.date.localeCompare(second.date)||first.id.localeCompare(second.id));
}

export function intervalFor(item,reference=today()){
  const start=dateValue(item.date);
  const ongoing=['Aktiv','Pausiert'].includes(item.status);
  const end=dateValue(item.endDate)||(ongoing?reference:null);
  return {start,end,ongoing:ongoing&&!item.endDate,duration:start&&end?days(start,end):null};
}

export function growthSeries(data,rows,kind,unit,calendar=false){
  const result=[];
  for(const item of rows){
    const context=contextFor(data,item);
    const points=(data.measurements||[]).filter(row=>row.inoculationId===item.id&&row.kind===kind&&row.unit===unit)
      .map(row=>({date:dateValue(row.date),x:calendar?Date.parse(`${dateValue(row.date)}T12:00:00Z`)/86400000:days(item.date,row.date),y:number(row.value)}))
      .filter(point=>point.date&&point.x!=null&&Number.isFinite(point.x)&&point.y!=null&&(calendar||point.x>=0))
      .sort((first,second)=>first.x-second.x);
    if(points.length)result.push({id:item.id,name:item.serial||item.id,context:`${context.species} · ${context.substrate}`,points});
  }
  return result;
}