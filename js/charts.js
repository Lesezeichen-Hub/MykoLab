import {escapeHtml as h,format,download,csv} from './utils.js';
import {growthSeries} from './timelines.js';

export const palette=['#5edcc4','#edbd67','#8ebdff','#f48d9a','#bdc97b','#e6a0da','#a6ccd4','#faad80'];
export const icon=name=>`<img class="tool-icon" src="./assets/icons/${name}.svg" alt="" width="18" height="18">`;
export const tool=(name,title,action)=>`<button type="button" class="icon-button" title="${h(title)}" aria-label="${h(title)}" data-tool="${action}">${icon(name)}</button>`;

function serializedSvg(svg,title,metadata='',container=null){
	const clone=svg.cloneNode(true);
	const width=svg.viewBox.baseVal.width,originalHeight=svg.viewBox.baseVal.height;
	const labels=[...(container?.querySelectorAll('.chart-legend label')||[])].filter(label=>label.querySelector('input').checked);
	const textRows=[];
	const wrap=text=>{
		const length=Math.max(28,Math.floor((width-40)/7));
		for(let offset=0;offset<text.length;offset+=length)textRows.push(text.slice(offset,offset+length));
	};
	wrap(metadata);
	labels.forEach(label=>wrap(label.textContent.trim()));
	const height=originalHeight+(textRows.length?textRows.length*18+24:0);
	clone.setAttribute('viewBox',`0 0 ${width} ${height}`);
	if(textRows.length)clone.insertAdjacentHTML('beforeend',`<rect x="0" y="${originalHeight}" width="${width}" height="${height-originalHeight}" fill="#151719"/>${textRows.map((text,index)=>`<text x="18" y="${originalHeight+20+index*18}" fill="#b4bcc2" font-family="sans-serif" font-size="12">${h(text)}</text>`).join('')}`);
	clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
	clone.setAttribute('width','960');
	clone.setAttribute('height',String(960*height/width));
	clone.insertAdjacentHTML('afterbegin',`<title>${h(title)}</title>`);
	return new XMLSerializer().serializeToString(clone);
}

export function bindExports(container,getRows,title,metadata=''){
	const filename=title.toLocaleLowerCase('de').replace(/[^a-z0-9]+/g,'-');
	container.querySelector('[data-tool="svg"]')?.addEventListener('click',()=>{
		const svg=container.querySelector('svg');
		if(svg)download(new Blob([serializedSvg(svg,title,metadata,container)],{type:'image/svg+xml'}),`${filename}.svg`);
	});
	container.querySelector('[data-tool="csv"]')?.addEventListener('click',()=>{
		const rows=getRows().map(row=>({...row,Auswertung:title,Filter:metadata}));
		download(new Blob([csv(rows,[...new Set(rows.flatMap(Object.keys))])],{type:'text/csv;charset=utf-8'}),`${filename}.csv`);
	});
	container.querySelector('[data-tool="png"]')?.addEventListener('click',async event=>{
		const button=event.currentTarget,svg=container.querySelector('svg');
		if(!svg)return;
		button.disabled=true;
		let url;
		try{
			url=URL.createObjectURL(new Blob([serializedSvg(svg,title,metadata,container)],{type:'image/svg+xml'}));
			const image=new Image();
			image.src=url;
			await image.decode();
			const canvas=document.createElement('canvas');
			canvas.width=image.width*2;canvas.height=image.height*2;
			const context=canvas.getContext('2d');
			context.fillStyle='#151719';context.fillRect(0,0,canvas.width,canvas.height);
			context.drawImage(image,0,0,canvas.width,canvas.height);
			const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
			if(!blob)throw Error('PNG konnte nicht erzeugt werden');
			download(blob,`${filename}.png`);
		}catch(error){container.querySelector('[data-chart-notice]').textContent=error.message}
		finally{if(url)URL.revokeObjectURL(url);button.disabled=false}
	});
}

export function lineChart(container,series,options={}){
	const {title='Wachstum',unit='',calendar=false,onSelect,metadata=''}=options;
	const hidden=new Set();
	let zoom=1;
	const available=series.flatMap(row=>row.points);
	if(!available.length){container.innerHTML='<div class="empty">Keine dokumentierten Messwerte für diese Auswahl.</div>';return}
	container.innerHTML=`<div class="chart-toolbar"><div class="chart-legend">${series.map((row,index)=>`<label><input type="checkbox" data-series="${h(row.id)}" checked><span class="swatch" style="--swatch:${palette[index%palette.length]}"></span><span>${h(row.name)}</span></label>`).join('')}</div><div class="row">${tool('zoom-in','Zeitachse vergrößern','zoom')}${tool('rotate-ccw','Zoom zurücksetzen','reset')}${tool('image','PNG herunterladen','png')}${tool('download','SVG herunterladen','svg')}${tool('table-2','CSV herunterladen','csv')}</div></div><div class="chart-scroll"><div class="chart-stage"></div></div><div class="chart-selection" data-chart-notice role="status" aria-live="polite">${h(title)} · ${h(unit)} · ${available.length} Messwerte</div><details class="chart-data"><summary>Messdaten</summary><div class="table-wrap" data-chart-table></div></details>`;
	const visible=()=>series.filter(row=>!hidden.has(row.id));
	const exported=()=>visible().flatMap(row=>row.points.map(point=>({Ansatz:row.name,UUID:row.id,Herkunft:row.context||'',Datum:point.date,Tag:calendar?'':point.x,Messgröße:title,Wert:point.y,Einheit:unit})));
	const draw=()=>{
		const stage=container.querySelector('.chart-stage');
		stage.style.width=`${zoom*100}%`;
		const selected=visible(),points=selected.flatMap(row=>row.points);
		if(!points.length){stage.innerHTML='<div class="empty">Keine Kurven ausgewählt.</div>';container.querySelector('[data-chart-table]').innerHTML='';return}
		let minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x));
		let minY=Math.min(0,...points.map(point=>point.y)),maxY=Math.max(0,...points.map(point=>point.y));
		if(maxX===minX){minX-=0.5;maxX+=0.5}
		if(maxY===minY){minY-=1;maxY+=1}
		const width=Math.max(360,Math.round(container.clientWidth*zoom));
		const plotWidth=width-96;
		const coordX=value=>64+(value-minX)/(maxX-minX)*plotWidth;
		const coordY=value=>282-(value-minY)/(maxY-minY)*230;
		const dateLabel=value=>new Date(Math.round(value)*86400000).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'});
		let body=`<rect width="${width}" height="340" fill="#151719"/><text x="64" y="25" fill="#e9ecee" font-size="13" font-family="sans-serif">${h(title)} · ${h(unit)}</text>`;
		for(let tick=0;tick<=5;tick++){
			const value=minY+(maxY-minY)*tick/5,y=coordY(value),xValue=minX+(maxX-minX)*tick/5,x=coordX(xValue);
			body+=`<line x1="64" x2="${width-32}" y1="${y}" y2="${y}" stroke="#303438"/><text x="54" y="${y+4}" text-anchor="end" fill="#b4bcc2" font-size="12" font-family="sans-serif">${h(format(value))}</text><text x="${x}" y="305" text-anchor="middle" fill="#b4bcc2" font-size="12" font-family="sans-serif">${h(calendar?dateLabel(xValue):format(xValue))}</text>`;
		}
		body+=`<text x="${width/2}" y="330" text-anchor="middle" fill="#b4bcc2" font-size="12" font-family="sans-serif">${calendar?'Kalenderdatum':'Tage seit Beimpfung'}</text>`;
		for(const row of selected){
			const color=palette[series.indexOf(row)%palette.length];
			body+=`<polyline points="${row.points.map(point=>`${coordX(point.x)},${coordY(point.y)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
			row.points.forEach((point,index)=>{
				const label=`${row.name} · ${row.context||''} · ${point.date} · ${format(point.y)} ${unit}`;
				body+=`<circle data-point="${index}" data-row="${h(row.id)}" tabindex="0" role="button" aria-label="${h(label)}" cx="${coordX(point.x)}" cy="${coordY(point.y)}" r="5" fill="${color}" stroke="#151719" stroke-width="2"><title>${h(label)}</title></circle>`;
			});
		}
		stage.innerHTML=`<svg class="chart" viewBox="0 0 ${width} 340" role="img" aria-label="${h(title)}"><desc>${h(metadata)} · ${selected.length} Ansätze</desc>${body}</svg>`;
		stage.querySelectorAll('[data-point]').forEach(point=>{
			const select=()=>{container.querySelector('[data-chart-notice]').textContent=point.getAttribute('aria-label')};
			point.onmouseenter=select;point.onfocus=select;
			point.onclick=()=>{select();onSelect?.(point.dataset.row)};
			point.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();point.onclick()}};
		});
		const rows=exported();
		container.querySelector('[data-chart-table]').innerHTML=`<table><thead><tr><th>Ansatz</th><th>Pilz / Substrat</th><th>Datum</th><th>Wert</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${h(row.Ansatz)}</td><td>${h(row.Herkunft)}</td><td>${h(row.Datum)}</td><td>${h(format(row.Wert))} ${h(unit)}</td></tr>`).join('')}</tbody></table>`;
	};
	container.querySelectorAll('[data-series]').forEach(input=>input.onchange=()=>{if(input.checked)hidden.delete(input.dataset.series);else hidden.add(input.dataset.series);draw()});
	container.querySelector('[data-tool="zoom"]').onclick=()=>{zoom=Math.min(4,zoom+1);draw()};
	container.querySelector('[data-tool="reset"]').onclick=()=>{zoom=1;draw()};
	bindExports(container,exported,title,metadata);
	draw();
	const observer=new ResizeObserver(()=>{if(container.isConnected)draw();else observer.disconnect()});
	observer.observe(container);
}

export function barChart(container,rows,{title='Ertrag',unit='',metadata='',onSelect}={}){
	if(!rows.length){container.innerHTML='<div class="empty">Keine vergleichbaren Werte dokumentiert.</div>';return}
	const width=Math.max(380,container.clientWidth),labelWidth=Math.min(225,Math.round(width*0.35)),plotWidth=width-labelWidth-75;
	const height=Math.max(150,rows.length*45+62),maximum=Math.max(1,...rows.map(row=>row.value));
	const body=rows.map((row,index)=>{
		const length=Math.floor((labelWidth-22)/7),label=row.name.length>length?row.name.slice(0,length-3)+'...':row.name;
		const color=row.color||palette[index%palette.length];
		return `<g data-bar="${h(row.id)}" tabindex="0" role="button" aria-label="${h(`${row.name} · ${format(row.value)} ${unit}`)}"><title>${h(row.name)} · ${h(format(row.value))} ${h(unit)}</title><text x="14" y="${index*45+52}" fill="#e9ecee" font-size="12" font-family="sans-serif">${h(label)}</text><rect x="${labelWidth}" y="${index*45+35}" width="${row.value/maximum*plotWidth}" height="25" rx="3" fill="${color}"/><text x="${labelWidth+10+row.value/maximum*plotWidth}" y="${index*45+53}" fill="#e9ecee" font-size="12" font-family="sans-serif">${h(format(row.value))}</text></g>`;
	}).join('');
	container.innerHTML=`<div class="chart-toolbar"><span class="muted">${h(unit)}</span><div class="row">${tool('image','PNG herunterladen','png')}${tool('download','SVG herunterladen','svg')}${tool('table-2','CSV herunterladen','csv')}</div></div><div class="chart-scroll"><svg class="chart bar-chart" style="width:${width}px;min-width:100%;height:auto" viewBox="0 0 ${width} ${height}" role="img" aria-label="${h(title)}"><rect width="${width}" height="${height}" fill="#151719"/><text x="14" y="20" fill="#b4bcc2" font-size="12" font-family="sans-serif">${h(title)}</text>${body}</svg></div><div data-chart-notice role="status"></div><details class="chart-data"><summary>Datentabelle</summary><div class="table-wrap"><table><thead><tr><th>Ansatz / Gruppe</th><th>Wert</th><th>Einheit</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${h(row.name)}</td><td>${h(format(row.value))}</td><td>${h(unit)}</td></tr>`).join('')}</tbody></table></div></details>`;
	container.querySelectorAll('[data-bar]').forEach(bar=>{
		bar.onclick=()=>onSelect?.(bar.dataset.bar);
		bar.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();bar.onclick()}};
	});
	bindExports(container,()=>rows.map(row=>({Kennung:row.name,Wert:row.value,Einheit:unit})),title,metadata);
}

export function growthChart(container,measurements,inoculations,kind,unit='%',options={}){
	const data={...options.data,measurements};
	lineChart(container,growthSeries(data,inoculations,kind,unit,options.calendar),{...options,title:kind,unit});
}
