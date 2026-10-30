import {db} from './db.js';import {uuid,today,escapeHtml as h,download} from './utils.js';
const urls=[];
export function releasePhotoUrls(){for(const url of urls)URL.revokeObjectURL(url);urls.length=0}
async function thumb(blob){const bitmap=await createImageBitmap(blob);const scale=Math.min(1,240/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.75))}
export async function showPhotos(container,type,id){
	releasePhotoUrls();
	const owner=`${type}:${id}`;
	container.dataset.photoOwner=owner;
	const photos=(await db.by('photos','ownerId',id)).filter(photo=>photo.ownerType===type);
	if(container.dataset.photoOwner!==owner)return;
	let panel=container.querySelector('#photos-panel');
	if(!panel){panel=document.createElement('section');panel.id='photos-panel';container.append(panel)}
	panel.innerHTML='<h3>Fotos</h3><input id="photo-files" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Fotos hinzufügen" multiple><p class="editor-error" data-photo-error role="alert"></p><div class="grid" id="photo-grid"></div>';
	const grid=panel.querySelector('#photo-grid');
	const failure=error=>{if(panel.isConnected)panel.querySelector('[data-photo-error]').textContent=error.message};
	for(const photo of photos){
		const url=URL.createObjectURL(photo.thumb||photo.blob);urls.push(url);
		const card=document.createElement('div');card.className='metric';
		card.innerHTML=`<img src="${url}" alt="${h(photo.description||photo.name)}" style="width:100%;max-height:180px;object-fit:contain"><p>${h(photo.description||photo.name)}</p><small>${h(photo.date)} · ${Math.round(photo.size/1024)} KiB</small><div class="row"><button type="button" data-photo="open">Öffnen</button><button type="button" data-photo="save">Download</button><button type="button" data-photo="delete" class="danger">Löschen</button></div>`;
		card.querySelector('[data-photo=open]').onclick=()=>{const original=URL.createObjectURL(photo.blob);urls.push(original);window.open(original,'_blank','noopener')};
		card.querySelector('[data-photo=save]').onclick=()=>download(photo.blob,photo.name);
		card.querySelector('[data-photo=delete]').onclick=async event=>{
			if(!confirm('Foto wirklich löschen?'))return;
			event.currentTarget.disabled=true;
			try{await db.remove('photos',photo.id);if(container.dataset.photoOwner===owner)await showPhotos(container,type,id)}catch(error){failure(error)}
		};
		grid.append(card);
	}
	panel.querySelector('#photo-files').onchange=async event=>{
		const input=event.currentTarget,files=[...input.files];
		input.disabled=true;
		try{
			for(const file of files){
				if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1048576)throw Error(`${file.name}: Nur JPEG, PNG oder WebP bis 5 MiB erlaubt`);
				const description=prompt(`Beschreibung für ${file.name}`,file.name);
				if(description===null)continue;
				await db.put('photos',{id:uuid(),ownerType:type,ownerId:id,name:file.name,mime:file.type,size:file.size,date:today(),description,blob:file,thumb:await thumb(file)});
			}
			if(container.dataset.photoOwner===owner)await showPhotos(container,type,id);
		}catch(error){failure(error)}
		finally{input.disabled=false}
	};
}
