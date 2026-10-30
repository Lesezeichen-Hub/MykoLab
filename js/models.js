import {db,transaction} from './db.js';
import {persistWithSerial,SERIAL_RULES} from './serials.js';
import {uuid,now,today,dateValue,number} from './utils.js';

const definitions={
  species:['name'],strains:['name','speciesId'],cultures:['name','strainId'],
  substrates:['name'],inoculations:['date','substrateId'],
  measurements:['inoculationId','date','kind','unit'],
  harvests:['inoculationId','date','unit'],experiments:['title','startDate']
};

export async function save(type,data){
  const required=definitions[type];if(!required)throw Error('Unbekannter Datentyp');
  for(const field of required)if(!String(data[field]??'').trim())throw Error(`Pflichtfeld fehlt: ${field}`);
  const relations={strains:['species','speciesId'],cultures:['strains','strainId'],measurements:['inoculations','inoculationId'],harvests:['inoculations','inoculationId']};
  if(relations[type]){
    const [table,field]=relations[type];
    if(!await db.get(table,data[field]))throw Error('Zugeordneter Datensatz wurde nicht gefunden');
  }
  if(type==='cultures'&&data.parentId){
    const visited=new Set(data.id?[data.id]:[]);
    let parentId=data.parentId;
    while(parentId){
      if(visited.has(parentId))throw Error('Kulturabstammung darf keinen Kreis bilden');
      visited.add(parentId);
      const parent=await db.get('cultures',parentId);
      if(!parent||parent.strainId!==data.strainId)throw Error('Elternkultur muss zum selben Stamm gehören');
      parentId=parent.parentId;
    }
  }
  if(type==='inoculations'){
    if(!data.cultureId&&!data.strainId)throw Error('Kultur oder Stamm auswählen');
    const substrate=await db.get('substrates',data.substrateId);
    if(!substrate)throw Error('Substrat wurde nicht gefunden');
    const culture=data.cultureId?await db.get('cultures',data.cultureId):null;
    if(data.cultureId&&!culture)throw Error('Kultur wurde nicht gefunden');
    if(culture&&data.strainId&&culture.strainId!==data.strainId)throw Error('Kultur und Stamm passen nicht zusammen');
    if(culture)data.strainId=culture.strainId;
    if(data.strainId&&!await db.get('strains',data.strainId))throw Error('Stamm wurde nicht gefunden');
    if(data.experimentId&&!await db.get('experiments',data.experimentId))throw Error('Experiment wurde nicht gefunden');
    const existing=data.id?await db.get(type,data.id):null;
    const unchanged=existing&&existing.cultureId===data.cultureId&&existing.strainId===data.strainId;
    const strain=await db.get('strains',data.strainId),species=strain?await db.get('species',strain.speciesId):null;
    data.recipeSnapshot=existing?.substrateId===data.substrateId?existing.recipeSnapshot||substrate:substrate;
    data.sourceSnapshot=unchanged&&existing.sourceSnapshot?existing.sourceSnapshot:{capturedAt:now(),historical:!existing||!unchanged,species:species?{id:species.id,name:species.name,germanName:species.germanName}:null,strain:strain?{id:strain.id,name:strain.name}:null,culture:culture?{id:culture.id,code:culture.code,name:culture.name}:null};
  }
  if(type==='measurements'){
    data.value=number(data.value);
    if(data.value==null&&data.kind!=='Phase')throw Error('Gültigen Messwert eingeben');
    if(data.kind==='Kolonisierung'&&(data.value<0||data.value>100||data.unit!=='%'))throw Error('Kolonisierung muss zwischen 0 und 100 % liegen');
  }
  if(type==='harvests'){
    data.amount=number(data.amount);
    if(data.amount==null||data.amount<0)throw Error('Gültige Ertragsmenge eingeben');
    if(!data.round){const rounds=await db.by('harvests','inoculationId',data.inoculationId);data.round=rounds.reduce((maximum,row)=>Math.max(maximum,Number(row.round)||0),0)+1}
    const round=number(data.round);
    if(!Number.isInteger(round)||round<1)throw Error('Erntedurchgang muss eine positive ganze Zahl sein');
    data.round=round;
  }
  for(const key of ['date','startDate','endDate'])if(data[key]&&!(data[key]=dateValue(data[key])))throw Error('Ungültiges Datum');
  if(data.endDate&&(data.date||data.startDate)&&data.endDate<(data.date||data.startDate))throw Error('Enddatum liegt vor dem Startdatum');
  const previous=data.id?await db.get(type,data.id):null;
  const item={...previous,...data,id:data.id||uuid(),createdAt:previous?.createdAt||now(),updatedAt:now()};
  if(type==='substrates')item.revision=(previous?.revision||0)+1;

  let event=null;
  if(['inoculations','measurements','harvests'].includes(type)){
    event={id:uuid(),inoculationId:type==='inoculations'?item.id:item.inoculationId,
      date:type==='inoculations'&&previous?today():item.date||today(),createdAt:item.updatedAt,
      kind:type==='inoculations'?(previous&&previous.status!==item.status?'Status geändert':previous?'Beimpfung bearbeitet':'Beimpfung angelegt'):type==='measurements'?'Messwert eingetragen':'Ernte dokumentiert',
      detail:type==='measurements'?(item.kind==='Phase'?item.phase||'Phase':`${item.kind}: ${item.value} ${item.unit}`):type==='harvests'?`${item.amount} ${item.unit}`:''};
  }
  if(type==='inoculations'&&previous&&(previous.substrateId!==item.substrateId||previous.cultureId!==item.cultureId||previous.strainId!==item.strainId)){
    event.kind='Herkunft korrigiert';
    event.detail=`Vorher: ${previous.recipeSnapshot?.name||'Substrat unbekannt'} · ${previous.sourceSnapshot?.species?.name||'Pilz unbekannt'}; jetzt: ${item.recipeSnapshot?.name||''} · ${item.sourceSnapshot?.species?.name||''}`;
    event.previousSource={substrateId:previous.substrateId,cultureId:previous.cultureId,strainId:previous.strainId,recipeSnapshot:previous.recipeSnapshot,sourceSnapshot:previous.sourceSnapshot};
  }
  if(SERIAL_RULES[type])await persistWithSerial(type,item,event,type==='inoculations'?(record,current,defaultEvent)=>{
    if(current){
      record.contaminated=current.contaminated;
      record.contaminatedAt=current.contaminatedAt;
      record.contaminatedDate=current.contaminatedDate;
    }
    if(record.status==='Kontaminiert'&&!current?.contaminated&&current?.status!=='Kontaminiert')return contaminationEvent(record,current);
    if(record.status==='Kontaminiert')record.contaminated=true;
    return defaultEvent;
  }:null);
  else if(event)await transaction([type,'events'],'readwrite',tx=>{tx.objectStore(type).put(item);tx.objectStore('events').put(event)});
  else await db.put(type,item);
  return item;
}

function contaminationEvent(item,previous){
  const timestamp=now(),date=today();
  Object.assign(item,{status:'Kontaminiert',contaminated:true,contaminatedAt:timestamp,contaminatedDate:date,updatedAt:timestamp});
  return {id:uuid(),inoculationId:item.id,date,createdAt:timestamp,kind:'Kontamination festgestellt',detail:previous?.status||''};
}

export async function markContaminated(id){
  let item;
  await transaction(['inoculations','events'],'readwrite',tx=>{
    const store=tx.objectStore('inoculations');
    const request=store.get(id);
    request.onsuccess=()=>{
      const previous=request.result;
      if(!previous){tx.abort();return}
      item=previous;
      if(previous.contaminated||previous.status==='Kontaminiert')return;
      item={...previous};
      const event=contaminationEvent(item,previous);
      store.put(item);
      tx.objectStore('events').put(event);
    };
  });
  return item;
}

export async function remove(type,id){
  const photos=(await db.by('photos','ownerId',id)).filter(p=>p.ownerType===type);
  if(type==='inoculations'){
    const dependent={measurements:await db.by('measurements','inoculationId',id),harvests:await db.by('harvests','inoculationId',id),events:await db.by('events','inoculationId',id),photos};
    for(const harvest of dependent.harvests)dependent.photos.push(...(await db.by('photos','ownerId',harvest.id)).filter(photo=>photo.ownerType==='harvests'));
    await transaction(['inoculations',...Object.keys(dependent)],'readwrite',tx=>{for(const [table,rows] of Object.entries(dependent))for(const row of rows)tx.objectStore(table).delete(row.id);tx.objectStore('inoculations').delete(id)});
    return;
  }
  if(type==='experiments'&&(await db.all('inoculations')).some(item=>item.experimentId===id))throw Error('Experiment ist mit Beimpfungen verknüpft');
  const references={species:[['strains','speciesId']],strains:[['cultures','strainId'],['inoculations','strainId']],cultures:[['cultures','parentId'],['inoculations','cultureId']],substrates:[['inoculations','substrateId']]};
  for(const [table,index] of references[type]||[])if((await db.by(table,index,id)).length)throw Error('Datensatz ist verknüpft und kann nicht gelöscht werden');
  await transaction([type,'photos'],'readwrite',tx=>{for(const photo of photos)tx.objectStore('photos').delete(photo.id);tx.objectStore(type).delete(id)});
}
