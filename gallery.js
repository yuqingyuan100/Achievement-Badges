"use strict";
const $ = s => document.querySelector(s);
let data, category = "", query = "", filter = "";
const tierNames = {1:"第一档",2:"第二档",3:"第三档"};
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
$("#image-dialog").onclick=event=>{
 const dialog=event.currentTarget,box=dialog.getBoundingClientRect();
 if(event.target===dialog&&(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom))dialog.close();
};
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

// Client checks deter recognizable automation; they are not a server access gate.
let encryptedPayload,downloadController,accessClosed=false;
const activity={preview:[],save:[]};
function releaseImages(gallery){for(const url of Object.values(gallery?.images||{}))if(url.startsWith("blob:"))URL.revokeObjectURL(url);}
function closeAccess(){
 if(accessClosed)return;accessClosed=true;
 downloadController?.abort();releaseImages(data);data=undefined;encryptedPayload=undefined;
 const dialog=$("#image-dialog");if(dialog.open)dialog.close();$("#large-image").removeAttribute("src");
 $("#content").replaceChildren();$("#content").hidden=true;$("#unlock-form").hidden=true;
 $("#passphrase").value="";$("#passphrase").disabled=true;$("#unlock").disabled=true;
 $("#access").hidden=false;$("#access").classList.add("error-notice");
 $("#access-message").textContent="检测到自动化访问或批量取图，本次访问已关闭。";
 document.title="访问已关闭";try{sessionStorage.setItem("badge-access-closed","1");}catch{}
}
function knownAutomation(){return typeof navigator!=="undefined"&&(navigator.webdriver===true||/GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|PerplexityBot|Perplexity-User|Bytespider|Amazonbot|Googlebot|bingbot|HeadlessChrome|PhantomJS|python-requests|python-httpx|curl\/|wget\//i.test(navigator.userAgent||""));}
function allowActivity(kind){
 if(accessClosed)return false;
 const now=Date.now();activity[kind]=activity[kind].filter(t=>now-t<10000);activity[kind].push(now);
 if(activity[kind].length>=(kind==="preview"?40:5)){closeAccess();return false;}return true;
}
const openImage=showImage;
showImage=(id,label)=>{if(allowActivity("preview"))openImage(id,label);};
for(const type of ["contextmenu","dragstart"])document.addEventListener(type,event=>{
 if(event.target.closest?.("img,.icon-slot.has-image,.image-dialog")){event.preventDefault();allowActivity("save");}
});
document.addEventListener("click",event=>{if(event.target.closest?.('a[download],a[href^="blob:"]')){event.preventDefault();closeAccess();}},true);
async function unlockGallery(passphrase) {
 if(knownAutomation())closeAccess();if(accessClosed)throw Error("本次访问已关闭。");
 if(!crypto.subtle)throw Error("请使用新版 Chrome 或 Edge，通过网站链接打开。");
 if(!encryptedPayload) {
  downloadController=new AbortController();
  const options={credentials:"omit",signal:downloadController.signal};
  const response=await fetch("./payload.data?v=a225f038745713c8",options);
  if(!response.ok)throw Error("图稿包加载失败，请稍后重试。");
  let bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes[0]===123) {
   const manifest=JSON.parse(new TextDecoder().decode(bytes));
   if(manifest.format!=="badge-chunks-v1"||!Array.isArray(manifest.parts)||manifest.parts.length>32)throw Error("图稿分包目录无效。");
   const parts=[];let total=0;
   for(const part of manifest.parts) {
    if(accessClosed)throw Error("本次访问已关闭。");
    $("#access-message").textContent="正在加载图稿 "+(parts.length+1)+" / "+manifest.parts.length+"，请稍候…";
    if(!/^payload-\d{2}\.data$/.test(part.file)||!Number.isInteger(part.bytes)||part.bytes<=0||total+part.bytes>256*1024*1024)throw Error("图稿分包目录无效。");
    const chunk=await fetch("./"+part.file+"?v=a225f038745713c8",options);
    if(!chunk.ok)throw Error("图稿分包加载失败，请稍后重试。");
    const content=new Uint8Array(await chunk.arrayBuffer());
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",content)),b=>b.toString(16).padStart(2,"0")).join("");
    if(content.length!==part.bytes||digest!==part.sha256)throw Error("图稿分包校验失败，请刷新页面重试。");
    parts.push(content);total+=content.length;
   }
   bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  }
  if(accessClosed)throw Error("本次访问已关闭。");encryptedPayload=bytes;
 }
 const payload=encryptedPayload;
 if(payload.length<50||new TextDecoder().decode(payload.slice(0,6))!=="BDGP1\0")throw Error("图稿包格式无效，请刷新页面。");
 const material=await crypto.subtle.importKey("raw",new TextEncoder().encode(passphrase),"PBKDF2",false,["deriveKey"]);
 const key=await crypto.subtle.deriveKey({name:"PBKDF2",salt:payload.slice(6,22),iterations:600000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["decrypt"]);
 let plain;
 try{plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:payload.slice(22,34),additionalData:payload.slice(0,22)},key,payload.slice(34));}
 catch{throw Error("验证密码不正确，或图稿包已更新。请核对密码后重试。");}
 const gallery=await unpackGallery(plain);
 if(accessClosed){releaseImages(gallery);throw Error("本次访问已关闭。");}return gallery;
}
$("#unlock-form").addEventListener("submit",async event=>{
 event.preventDefault();
 const input=$("#passphrase"),button=$("#unlock");button.disabled=true;input.disabled=true;
 $("#access-message").textContent="正在解锁并加载图稿，请稍候…";
 $("#access").classList.remove("error-notice");
 try{showGallery(await unlockGallery(input.value));input.value="";}
 catch(error){if(!accessClosed){$("#access").classList.add("error-notice");$("#access-message").textContent=error instanceof TypeError?"网络连接失败，请检查网络后重试。":error.message;}}
 finally{button.disabled=accessClosed;input.disabled=accessClosed;}
});
let alreadyClosed=false;try{alreadyClosed=sessionStorage.getItem("badge-access-closed")==="1";}catch{}
if(alreadyClosed||knownAutomation())closeAccess();
