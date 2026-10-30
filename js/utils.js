export const uuid=()=>crypto.randomUUID();
export const now=()=>new Date().toISOString();
export const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const dateValue=value=>{if(!value)return null;const s=String(value).trim();const m=s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);const iso=m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:s.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return null;const d=new Date(`${iso}T12:00:00`);return Number.isNaN(d.valueOf())||d.getFullYear()!==+iso.slice(0,4)||d.getMonth()+1!==+iso.slice(5,7)||d.getDate()!==+iso.slice(8,10)?null:iso};
export const days=(a,b)=>{const x=dateValue(a),y=dateValue(b);return x&&y?Math.round((Date.parse(y+'T12:00:00')-Date.parse(x+'T12:00:00'))/86400000):null};
export const number=value=>{if(value===''||value==null)return null;const n=Number(String(value).replace(',','.'));return Number.isFinite(n)?n:null};
export const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
export const median=values=>{if(!values.length)return null;const v=[...values].sort((a,b)=>a-b);return(v[(v.length-1)>>1]+v[v.length>>1])/2};
export const format=value=>value==null?'—':new Intl.NumberFormat('de-DE',{maximumFractionDigits:2}).format(value);
export const csvCell=value=>{let s=String(value??'');if(/^[\s]*[=+\-@]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};
export const csv=(rows,columns)=>[columns.map(csvCell).join(';'),...rows.map(row=>columns.map(key=>csvCell(typeof row[key]==='object'?JSON.stringify(row[key]):row[key])).join(';'))].join('\r\n');
export function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000)}
