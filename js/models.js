import {db,transaction} from './db.js';
import {persistWithSerial,SERIAL_RULES} from './serials.js';
import {uuid,now,dateValue,number} from './utils.js';

const definitions={
  species:['name'],strains:['name','speciesId'],cultures:['name','strainId'],
  substrates:['name'],inoculations:['date','substrateId'],
  measurements:['inoculationId','date','kind','unit'],
  harvests:['inoculationId','date','unit'],experiments:['title','startDate']
};

export async function save(type,data){
  const required=definitions[type];if(!required)throw Error('Unbekannter Datentyp');
  for(const field of required)if(!String(data[field]??'').trim())throw Error(`Pflichtfeld fehlt: ${field}`);
  if(type==='inoculations'){
    if(!data.cultureId&&!data.strainId)throw Error('Kultur oder Stamm auswählen');
    const substrate=await db.get('substrates',data.substrateId);
    if(!substrate)throw Error('Substrat wurde nicht gefunden');
    if(data.cultureId&&!await db.get('cultures',data.cultureId))throw Error('Kultur wurde nicht gefunden');
    if(data.strainId&&!await db.get('strains',data.strainId))throw Error('Stamm wurde nicht gefunden');
    data.recipeSnapshot=data.recipeSnapshot||substrate;
  }
  if(type==='measurements'){
    data.value=number(data.value);
    if(data.value==null&&data.kind!=='Phase')throw Error('Gültigen Messwert eingeben');
    if(data.kind==='Kolonisierung'&&(data.value<0||data.value>100||data.unit!=='%'))throw Error('Kolonisierung muss zwischen 0 und 100 % liegen');
  }
  if(type==='harvests'){
    data.amount=number(data.amount);
    if(data.amount==null||data.amount<0)throw Error('Gültige Ertragsmenge eingeben');
  }
  for(const key of ['date','startDate','endDate'])if(data[key]&&!(data[key]=dateValue(data[key])))throw Error('Ungültiges Datum');
  const previous=data.id?await db.get(type,data.id):null;
  const item={...previous,...data,id:data.id||uuid(),createdAt:previous?.createdAt||now(),updatedAt:now()};
  if(type==='inoculations'&&item.status==='Kontaminiert')item.contaminated=true;
  if(type==='substrates')item.revision=(previous?.revision||0)+1;

  let event=null;
  if(['inoculations','measurements','harvests'].includes(type)){
    event={id:uuid(),inoculationId:type==='inoculations'?item.id:item.inoculationId,
      date:item.date||item.updatedAt.slice(0,10),
      kind:type==='inoculations'?(previous&&previous.status!==item.status?'Status geändert':previous?'Beimpfung bearbeitet':'Beimpfung angelegt'):type==='measurements'?'Messwert eingetragen':'Ernte dokumentiert',
      detail:type==='measurements'?`${item.kind}: ${item.value} ${item.unit}`:type==='harvests'?`${item.amount} ${item.unit}`:''};
  }
  if(SERIAL_RULES[type])await persistWithSerial(type,item,event);
  else if(event)await transaction([type,'events'],'readwrite',tx=>{tx.objectStore(type).put(item);tx.objectStore('events').put(event)});
  else await db.put(type,item);
  return item;
}

export async function remove(type,id){
  const photos=(await db.by('photos','ownerId',id)).filter(p=>p.ownerType===type);
  if(type==='inoculations'){
    const dependent={measurements:await db.by('measurements','inoculationId',id),harvests:await db.by('harvests','inoculationId',id),events:await db.by('events','inoculationId',id),photos};
    await transaction(['inoculations',...Object.keys(dependent)],'readwrite',tx=>{for(const [table,rows] of Object.entries(dependent))for(const row of rows)tx.objectStore(table).delete(row.id);tx.objectStore('inoculations').delete(id)});
    return;
  }
  const references={species:[['strains','speciesId']],strains:[['cultures','strainId'],['inoculations','strainId']],cultures:[['cultures','parentId'],['inoculations','cultureId']],substrates:[['inoculations','substrateId']]};
  for(const [table,index] of references[type]||[])if((await db.by(table,index,id)).length)throw Error('Datensatz ist verknüpft und kann nicht gelöscht werden');
  await transaction([type,'photos'],'readwrite',tx=>{for(const photo of photos)tx.objectStore('photos').delete(photo.id);tx.objectStore(type).delete(id)});
}
