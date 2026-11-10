"use strict";
const $ = s => document.querySelector(s);
let data, category = "", query = "", filter = "";
const tierNames = {1:"铜档",2:"银档",3:"金档"};
function el(tag, cls, text) { const n = document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
function state(i) { return i.review==="approved"?"审核通过":i.review==="needs_changes"?"需要调整":i.selected_image?"当前选定":i.blocked?"等待参考":i.generation==="generated"?"已生成 · 未选定":"待生成"; }
function showImage(id, label) { $("#large-image").src=data.images[id]; $("#large-image").alt=label; $("#image-caption").textContent=label+" · 原生PNG"; $("#image-dialog").showModal(); }
function render() {
 const groups=data.groups.filter(g=>(!category||g.category===category)&&(!query||g.name.includes(query)||g.id.includes(query))&&(!filter||g.icons.some(i=>filter==="selected"?i.selected_image:filter==="blocked"?i.blocked:i.review===filter)));
 const fragment=document.createDocumentFragment();
 for(const g of groups) {
  const row=el("tr"), name=el("td"); name.append(el("strong","",g.name),el("div","group-meta",g.category+" · "+g.icons.length+" 枚")); row.append(name);
  for(const tier of [1,2,3]) { const cell=el("td","tier-cell"), i=g.icons.find(i=>i.tier===tier); cell.dataset.tier=tierNames[tier];
   if(!i)cell.append(el("div","missing-tier","--"));
   else { if(i.selected_image) { const b=el("button","icon-slot has-image"), image=el("img"); image.src=data.images[i.selected_image]; image.alt=g.name+" · "+tierNames[tier]; image.loading="lazy"; b.append(image); b.setAttribute("aria-label","查看"+image.alt); b.onclick=()=>showImage(i.selected_image,image.alt); cell.append(b); } else cell.append(el("div","icon-slot")); cell.append(el("small","tier-state",state(i))); } row.append(cell); }
  const progress=el("td"), count=g.icons.filter(i=>i.generation==="generated").length;
  const label=g.icons.some(i=>i.review==="needs_changes")?"需要调整":g.icons.every(i=>i.review==="approved")?"审核通过":g.icons.some(i=>i.blocked)?"等待参考":"制作中";
  progress.append(el("span","status-tag "+(label==="审核通过"?"approved":label==="需要调整"?"blocked":"generated"),label),el("div","row-progress",count+" / "+g.icons.length+" 已生成")); row.append(progress);fragment.append(row);
 } $("#achievement-list").replaceChildren(fragment); $("#result-count").textContent=groups.length+" / "+data.groups.length+" 组成就"; $("#empty").hidden=groups.length!==0;
}
$("#search").oninput=e=>{query=e.target.value.trim();render();}; $("#status").onchange=e=>{filter=e.target.value;render();};
for(const b of document.querySelectorAll("[data-category]"))b.onclick=()=>{category=b.dataset.category;for(const n of document.querySelectorAll("[data-category]"))n.classList.toggle("selected",n===b);render();};
for(const b of document.querySelectorAll("[data-view]"))b.onclick=()=>{for(const n of document.querySelectorAll(".view"))n.hidden=n.id!==b.dataset.view+"-view";for(const n of document.querySelectorAll("[data-view]"))n.classList.toggle("active",n===b);};
$("#close-image").onclick=()=>$("#image-dialog").close();
function showGallery(d) {
 data=d;for(const [k,v] of Object.entries(d.stats))$("#stat-"+k).textContent=v;
 const date=new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(d.source_at));
 $("#sync-time").textContent=date;$("#footer-sync").textContent="内容更新 · "+date+"（上海）";
 for(const stage of d.stages){const item=el("li","stage-item"),title=el("strong","",stage.name);item.append(title,el("span","",stage.detail));$("#stages").append(item);}
 $("#access").hidden=true;$("#content").hidden=false;render();
}
async function unpackGallery(plain) {
 const view=new DataView(plain), bytes=new Uint8Array(plain), decoder=new TextDecoder(), files=new Map();
 let end=bytes.length-22;while(end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50)end--;
 if(end<0)throw Error("图稿包格式无效。");
 let position=view.getUint32(end+16,true);const count=view.getUint16(end+10,true);
 for(let index=0;index<count;index++) {
  if(view.getUint32(position,true)!==0x02014b50)throw Error("图稿目录无效。");
  const method=view.getUint16(position+10,true),size=view.getUint32(position+20,true),nameLength=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true),local=view.getUint32(position+42,true);
  const name=decoder.decode(bytes.slice(position+46,position+46+nameLength));
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true), compressed=bytes.slice(start,start+size);
  if(method===0)files.set(name,compressed);
  else if(method===8)files.set(name,new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()));
  else throw Error("不支持的图稿压缩格式。");
  position+=46+nameLength+extra+comment;
 }
 const result=JSON.parse(decoder.decode(files.get("data.json")));
 for(const [id,path] of Object.entries(result.images)) {
  const image=files.get(path.replace(/^\.\//,""));if(!image)throw Error("图稿文件不完整。");
  result.images[id]=URL.createObjectURL(new Blob([image],{type:"image/png"}));
 }
 return result;
}

let encryptedPayload;
async function unlockGallery(passphrase) {
 if(!crypto.subtle)throw Error("请使用新版 Chrome 或 Edge，通过网站链接打开。");
 if(!encryptedPayload) {
  const response=await fetch("./payload.data?v=793e96079ec3bbc2",{credentials:"omit"});
  if(!response.ok)throw Error("图稿包加载失败，请稍后重试。");
  encryptedPayload=new Uint8Array(await response.arrayBuffer());
 }
 const payload=encryptedPayload;
 if(payload.length<50||new TextDecoder().decode(payload.slice(0,6))!=="GNGP1\0")throw Error("图稿包格式无效，请刷新页面。");
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:payload.slice(6,22),iterations:600000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["decrypt"]);
 let plain;
 try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:payload.slice(22,34),additionalData:payload.slice(0,22)},key,payload.slice(34));}
 catch{throw Error("访问口令不正确，或图稿包已更新。请核对口令后重试。");}
 return unpackGallery(plain);
}
$("#unlock-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const input=$("#passphrase"),button=$("#unlock");button.disabled=true;input.disabled=true;
 $("#access-message").textContent="正在解锁并加载图稿，请稍候…";
 $("#access").classList.remove("error-notice");
 try{showGallery(await unlockGallery(input.value));input.value="";}
 catch(error){$("#access").classList.add("error-notice");$("#access-message").textContent=error instanceof TypeError?"网络连接失败，请检查网络后重试。":error.message;}
 finally{button.disabled=false;input.disabled=false;}
});
