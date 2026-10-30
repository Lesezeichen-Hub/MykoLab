export const DB_NAME='MykoLab';
export const DB_VERSION=2;
export const STORES={species:['name'],strains:['speciesId','name'],cultures:['strainId','parentId','name'],substrates:['number','name'],inoculations:['serial','cultureId','strainId','substrateId','status','date'],measurements:['inoculationId','date','kind'],harvests:['inoculationId','date'],experiments:['number','status'],events:['inoculationId','date'],photos:['ownerId','ownerType'],settings:[],imports:['fingerprint']};
export function upgrade(db,oldVersion,transaction){
  if(oldVersion<1){for(const [name,indexes] of Object.entries(STORES)){const store=db.createObjectStore(name,{keyPath:'id'});for(const index of indexes)store.createIndex(index,index,{unique:name==='inoculations'&&index==='serial'});}}
  if(oldVersion<2){
    const numbered={substrates:['number','SUB'],cultures:['code','KUL'],inoculations:['serial','BEP'],experiments:['number','EXP']};
    const settings=transaction.objectStore('settings');
    for(const [type,[field,prefix]] of Object.entries(numbered)){
      const store=transaction.objectStore(type);
      store.getAll().onsuccess=e=>{
        const rows=e.target.result,reserved=new Set(),counters=new Map(),year=new Date().getFullYear();
        const pattern=new RegExp(`^${prefix}-(\\d{4})-(\\d+)$`);
        for(const row of rows){
          const code=String(row[field]??'').trim().toLocaleUpperCase('de-DE');
          if(!code)continue;
          reserved.add(code);
          const match=code.match(pattern);
          if(match)counters.set(Number(match[1]),Math.max(counters.get(Number(match[1]))||0,Number(match[2])));
        }
        const seen=new Set();
        store.createIndex('codeKey','codeKey',{unique:true});
        for(const row of rows){
          let code=String(row[field]??'').trim(),key=code.toLocaleUpperCase('de-DE');
          if(!code||seen.has(key)){
            let next=counters.get(year)||0;
            do{next++;code=`${prefix}-${year}-${String(next).padStart(4,'0')}`;key=code.toLocaleUpperCase('de-DE')}while(reserved.has(key));
            counters.set(year,next);reserved.add(key);
          }
          seen.add(key);
          row[field]=code;row.codeKey=key;store.put(row);
        }
        for(const [counterYear,value] of counters)settings.put({id:`serial-counter:${type}:${counterYear}`,value});
      };
    }
  }
}
