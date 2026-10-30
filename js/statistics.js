import {days,mean,median,number} from './utils.js';

export function summarize(data,filter={}){
	const cultures=new Map((data.cultures||[]).map(row=>[row.id,row]));
	const strains=new Map((data.strains||[]).map(row=>[row.id,row]));
	const rows=(data.inoculations||[]).filter(item=>{
		const strainId=item.strainId||cultures.get(item.cultureId)?.strainId;
		return (!filter.from||item.date>=filter.from)&&(!filter.to||item.date<=filter.to)
			&&(!filter.substrateId||item.substrateId===filter.substrateId)
			&&(!filter.experimentId||item.experimentId===filter.experimentId)
			&&(!filter.experimentGroup||item.experimentGroup===filter.experimentGroup)
			&&(!filter.strainId||strainId===filter.strainId)
			&&(!filter.speciesId||strains.get(strainId)?.speciesId===filter.speciesId)
			&&(!filter.cultureId||item.cultureId===filter.cultureId)
			&&(!filter.status||item.status===filter.status)&&(!filter.container||item.container===filter.container);
	});
	const rowIds=new Set(rows.map(item=>item.id));
	const completed=rows.filter(item=>item.status==='Abgeschlossen');
	const durations=completed.map(item=>days(item.date,item.endDate)).filter(value=>value!=null&&value>=0);
	const harvests=(data.harvests||[]).filter(item=>rowIds.has(item.inoculationId));
	const measurements=(data.measurements||[]).filter(item=>rowIds.has(item.inoculationId));
	const groups={},totals=new Map();
	for(const harvest of harvests){
		const amount=number(harvest.amount);
		if(amount==null||amount<0)continue;
		const rawKey=`${harvest.massType||'Unbekannt'} · ${harvest.unit}`;
		(groups[rawKey]??=[]).push(amount);
		const factor={g:1,kg:1000,mg:0.001}[harvest.unit];
		const unit=factor?'g':harvest.unit||'Unbekannt';
		const key=`${harvest.massType||'Unbekannt'} · ${unit}`;
		if(!totals.has(key))totals.set(key,new Map());
		const values=totals.get(key);
		values.set(harvest.inoculationId,(values.get(harvest.inoculationId)||0)+amount*(factor||1));
	}
	const yields=[...totals].map(([key,values])=>{
		const amounts=[...values.values()],average=mean(amounts);
		return {key,total:amounts.reduce((sum,value)=>sum+value,0),n:amounts.length,average,median:median(amounts),
			deviation:amounts.length>1?Math.sqrt(amounts.reduce((sum,value)=>sum+(value-average)**2,0)/(amounts.length-1)):null,
			values:[...values].map(([id,amount])=>({id,amount}))};
	});
	const contaminated=rows.filter(item=>item.status==='Kontaminiert'||item.contaminated);
	const contaminationDays=contaminated.map(item=>days(item.date,item.contaminatedDate)).filter(value=>value!=null&&value>=0);
	return {rows,completed,measurements,harvests,groups,yields,durations,contaminated,
		averageDays:mean(durations),medianDays:median(durations),contamination:rows.length?contaminated.length/rows.length:null,
		medianContaminationDays:median(contaminationDays),unknownContaminationDates:contaminated.filter(item=>!item.contaminatedDate).length};
}
