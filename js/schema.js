export const DB_NAME='MykoLab';
export const DB_VERSION=1;
export const STORES={species:['name'],strains:['speciesId','name'],cultures:['strainId','parentId','name'],substrates:['number','name'],inoculations:['serial','cultureId','strainId','substrateId','status','date'],measurements:['inoculationId','date','kind'],harvests:['inoculationId','date'],experiments:['number','status'],events:['inoculationId','date'],photos:['ownerId','ownerType'],settings:[],imports:['fingerprint']};
export function upgrade(db,oldVersion,transaction){
  if(oldVersion<1){for(const [name,indexes] of Object.entries(STORES)){const store=db.createObjectStore(name,{keyPath:'id'});for(const index of indexes)store.createIndex(index,index,{unique:name==='inoculations'&&index==='serial'});}}
}
