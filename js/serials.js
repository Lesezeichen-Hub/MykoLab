import {openDb} from './db.js';

export const SERIAL_RULES={
  substrates:{field:'number',prefix:'SUB'},
  cultures:{field:'code',prefix:'KUL'},
  inoculations:{field:'serial',prefix:'BEP'},
  experiments:{field:'number',prefix:'EXP'}
};

export const canonicalSerial=value=>String(value??'').trim().toLocaleUpperCase('de-DE');
export const serialYear=()=>new Date().getFullYear();
export function formatSerial(type,year,sequence){
  const rule=SERIAL_RULES[type];
  if(!rule||!Number.isInteger(year)||!Number.isInteger(sequence)||sequence<1)throw Error('Ungültige Kennungsfolge');
  return `${rule.prefix}-${year}-${String(sequence).padStart(4,'0')}`;
}
export function serialSequence(type,value){
  const rule=SERIAL_RULES[type],match=canonicalSerial(value).match(new RegExp(`^${rule.prefix}-(\\d{4})-(\\d+)$`));
  return match?{year:Number(match[1]),sequence:Number(match[2])}:null;
}
export const counterId=(type,year)=>`serial-counter:${type}:${year}`;
const writeError=error=>error?.name==='QuotaExceededError'?new Error('Browser-Speicher ist voll. Bitte ein Backup erstellen und Speicherplatz freigeben.'):error;

export function normalizeSnapshotSerials(snapshot){
  const settings=new Map((snapshot.settings||[]).map(row=>[row.id,row]));
  for(const [type,rule] of Object.entries(SERIAL_RULES)){
    const rows=snapshot[type]||[],reserved=new Set(),seen=new Set(),maxByYear=new Map();
    for(const row of rows){
      const code=canonicalSerial(row[rule.field]);if(code)reserved.add(code);
      const parsed=code&&serialSequence(type,code);
      if(parsed)maxByYear.set(parsed.year,Math.max(maxByYear.get(parsed.year)||0,parsed.sequence));
    }
    for(const row of rows){
      let code=String(row[rule.field]??'').trim(),key=canonicalSerial(code);
      if(!key||seen.has(key)){
        const year=Number(String(row.createdAt||'').slice(0,4))||serialYear();
        let next=Math.max(maxByYear.get(year)||0,Number(settings.get(counterId(type,year))?.value||0));
        do{code=formatSerial(type,year,++next);key=canonicalSerial(code)}while(reserved.has(key));
        maxByYear.set(year,next);reserved.add(key);
      }
      seen.add(key);row[rule.field]=code;row.codeKey=key;
    }
    for(const [year,value] of maxByYear){const id=counterId(type,year);settings.set(id,{id,value:Math.max(value,Number(settings.get(id)?.value||0))})}
  }
  snapshot.settings=[...settings.values()];
  return snapshot;
}

// Counter, Kollisionsprüfung und Datensatz werden in derselben IndexedDB-Transaktion geschrieben.
export async function persistWithSerial(type,item,event){
  const rule=SERIAL_RULES[type];if(!rule)throw Error('Unbekannter Kennungsbereich');
  const database=await openDb(),stores=event?[type,'settings','events']:[type,'settings'];
  return new Promise((resolve,reject)=>{
    const tx=database.transaction(stores,'readwrite');
    const records=tx.objectStore(type),settings=tx.objectStore('settings'),index=records.index('codeKey');
    let failure=null;
    const abort=message=>{failure=new Error(message);tx.abort()};
    tx.oncomplete=()=>resolve(item);
    tx.onerror=()=>reject(writeError(failure||tx.error)||new Error('Speichern fehlgeschlagen'));
    tx.onabort=()=>reject(writeError(failure||tx.error)||new Error('Speichern abgebrochen'));
    const write=()=>{item.codeKey=canonicalSerial(item[rule.field]);records.put(item);if(event)tx.objectStore('events').put(event)};
    const requested=String(item[rule.field]??'').trim();
    if(requested){
      item[rule.field]=requested;
      index.get(canonicalSerial(requested)).onsuccess=e=>{
        if(e.target.result&&e.target.result.id!==item.id){abort('Kennung ist bereits vergeben');return}
        const parsed=serialSequence(type,requested);
        if(!parsed){write();return}
        const key=counterId(type,parsed.year);
        settings.get(key).onsuccess=result=>{
          if(parsed.sequence>Number(result.target.result?.value||0))settings.put({id:key,value:parsed.sequence});
          write();
        };
      };
      return;
    }
    const year=serialYear(),key=counterId(type,year);
    settings.get(key).onsuccess=e=>{
      let next=Number(e.target.result?.value||0)+1;
      const attempt=()=>{
        const candidate=formatSerial(type,year,next);
        index.get(canonicalSerial(candidate)).onsuccess=found=>{
          if(found.target.result){next++;attempt();return}
          item[rule.field]=candidate;
          settings.put({id:key,value:next});
          write();
        };
      };
      attempt();
    };
  });
}
