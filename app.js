import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const CONFIG={OWNER:"",REPO:"",BRANCH:"main",STL_ROOT:"stl"};

const $=id=>document.getElementById(id);
const library=$("library"),searchInput=$("searchInput"),viewer=$("viewer"),viewerWrap=$("viewerWrap"),
fileInput=$("fileInput"),resetBtn=$("resetBtn"),wireframeBtn=$("wireframeBtn"),
fullscreenBtn=$("fullscreenBtn"),downloadBtn=$("downloadBtn"),colorPicker=$("colorPicker"),
loading=$("loading"),status=$("status");

function detectRepo(){
  if(CONFIG.OWNER&&CONFIG.REPO)return{owner:CONFIG.OWNER,repo:CONFIG.REPO};
  const host=location.hostname;
  const parts=location.pathname.split("/").filter(Boolean);
  if(host.endsWith(".github.io")){
    const owner=host.replace(".github.io","");
    return {owner,repo:parts.length?parts[0]:`${owner}.github.io`};
  }
  return null;
}
const repoInfo=detectRepo();
const apiTreeUrl=()=>`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(CONFIG.BRANCH)}?recursive=1`;
const rawUrl=path=>`https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${CONFIG.BRANCH}/${path}`;

const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(45,viewer.clientWidth/viewer.clientHeight,.1,100000);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(viewer.clientWidth,viewer.clientHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
viewer.appendChild(renderer.domElement);

const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true; controls.screenSpacePanning=true;

scene.add(new THREE.HemisphereLight(0xffffff,0x666666,2));
const l1=new THREE.DirectionalLight(0xffffff,3);l1.position.set(3,4,5);scene.add(l1);
const l2=new THREE.DirectionalLight(0xffffff,1.5);l2.position.set(-4,2,-3);scene.add(l2);

const grid=new THREE.GridHelper(200,20,0x999999,0xcccccc);
grid.material.opacity=.25;grid.material.transparent=true;scene.add(grid);

const loader=new STLLoader();
const material=new THREE.MeshStandardMaterial({color:colorPicker.value,roughness:.55,metalness:.08});

let mesh=null,wireframe=false,allModels=[],currentPath=null;

function fit(object){
  const box=new THREE.Box3().setFromObject(object),size=new THREE.Vector3(),center=new THREE.Vector3();
  box.getSize(size);box.getCenter(center);
  const maxDim=Math.max(size.x,size.y,size.z)||1;
  const fov=THREE.MathUtils.degToRad(camera.fov);
  const z=Math.abs(maxDim/(2*Math.tan(fov/2)))*1.65;
  camera.position.set(center.x+z*.65,center.y+z*.45,center.z+z);
  camera.near=Math.max(maxDim/1000,.01);camera.far=Math.max(maxDim*100,1000);camera.updateProjectionMatrix();
  controls.target.copy(center);controls.minDistance=maxDim*.05;controls.maxDistance=maxDim*20;controls.update();
  grid.scale.setScalar(Math.max(maxDim/200,.01));
}

function showGeometry(g,name){
  if(mesh){scene.remove(mesh);mesh.geometry?.dispose();}
  g.computeVertexNormals();g.center();g.computeBoundingBox();
  mesh=new THREE.Mesh(g,material);mesh.rotation.x=-Math.PI/2;scene.add(mesh);fit(mesh);
  const tris=Math.floor((g.attributes.position?.count||0)/3);
  const s=new THREE.Vector3();g.boundingBox.getSize(s);
  status.textContent=`${name} · ${tris.toLocaleString("de-CH")} Dreiecke · ${s.x.toFixed(1)} × ${s.y.toFixed(1)} × ${s.z.toFixed(1)} mm`;
}

async function loadModel(model){
  loading.classList.add("show");currentPath=model.path;markActive();
  try{
    const r=await fetch(model.rawUrl); if(!r.ok)throw new Error(r.status);
    showGeometry(loader.parse(await r.arrayBuffer()),model.name);
    downloadBtn.href=model.rawUrl;downloadBtn.download=model.name;downloadBtn.classList.remove("disabled");
  }catch(e){console.error(e);status.textContent="Das Modell konnte nicht geladen werden."}
  finally{loading.classList.remove("show")}
}

function openLocal(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{try{currentPath=null;markActive();showGeometry(loader.parse(e.target.result),file.name);downloadBtn.classList.add("disabled")}catch(err){status.textContent="Die STL-Datei konnte nicht gelesen werden."}};
  reader.readAsArrayBuffer(file);
}

async function loadLibrary(){
  if(!repoInfo){
    library.innerHTML='<div class="empty">Repository konnte nicht automatisch erkannt werden. Trage OWNER und REPO oben in app.js ein.</div>';
    return;
  }
  try{
    const r=await fetch(apiTreeUrl()); if(!r.ok)throw new Error(r.status);
    const data=await r.json();
    const root=CONFIG.STL_ROOT.replace(/^\/+|\/+$/g,"");
    allModels=data.tree
      .filter(x=>x.type==="blob"&&x.path.toLowerCase().endsWith(".stl"))
      .filter(x=>!root||x.path.startsWith(root+"/"))
      .map(x=>{
        const rel=root?x.path.slice(root.length+1):x.path;
        const parts=rel.split("/"),name=parts.pop();
        return{name,path:x.path,relativePath:rel,folders:parts,rawUrl:rawUrl(x.path)};
      })
      .sort((a,b)=>a.relativePath.localeCompare(b.relativePath,"de",{numeric:true}));
    renderLibrary();
  }catch(e){
    console.error(e);
    library.innerHTML='<div class="empty">GitHub-Bibliothek konnte nicht geladen werden. Prüfe Repository, Branch und STL_ROOT.</div>';
  }
}

function makeTree(models){
  const root={name:"",folders:new Map(),files:[]};
  for(const m of models){
    let n=root;
    for(const f of m.folders){
      if(!n.folders.has(f))n.folders.set(f,{name:f,folders:new Map(),files:[]});
      n=n.folders.get(f);
    }
    n.files.push(m);
  }
  return root;
}

function renderFolder(node,parent){
  const el=document.createElement("div");el.className="folder";
  const row=document.createElement("div");row.className="folder-row";
  const toggle=document.createElement("button");toggle.className="folder-toggle";toggle.textContent="▼";
  const name=document.createElement("span");name.textContent="📁 "+node.name;
  row.append(toggle,name);el.append(row);

  const children=document.createElement("div");children.className="folder-children";

  [...node.folders.values()].sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true})).forEach(f=>renderFolder(f,children));
  [...node.files].sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true})).forEach(m=>{
    const b=document.createElement("button");b.className="model-button";b.dataset.path=m.path;
    b.innerHTML=`<span>${m.name.replace(/\.stl$/i,"")}</span><span class="model-path">${m.relativePath}</span>`;
    b.onclick=()=>loadModel(m);children.appendChild(b);
  });

  toggle.onclick=()=>{el.classList.toggle("collapsed");toggle.textContent=el.classList.contains("collapsed")?"▶":"▼"};
  el.append(children);parent.appendChild(el);
}

function renderLibrary(){
  const term=searchInput.value.trim().toLowerCase();
  const filtered=allModels.filter(m=>m.relativePath.toLowerCase().includes(term));
  if(!filtered.length){library.innerHTML='<div class="empty">Keine STL-Dateien gefunden.</div>';return}
  const tree=makeTree(filtered);library.innerHTML="";
  [...tree.folders.values()].sort((a,b)=>a.name.localeCompare(b.name,"de",{numeric:true})).forEach(f=>renderFolder(f,library));
  if(tree.files.length)renderFolder({name:"Allgemein",folders:new Map(),files:tree.files},library);
  markActive();
}

function markActive(){
  document.querySelectorAll(".model-button").forEach(b=>b.classList.toggle("active",b.dataset.path===currentPath));
}

searchInput.oninput=renderLibrary;
fileInput.onchange=e=>openLocal(e.target.files[0]);
colorPicker.oninput=()=>material.color.set(colorPicker.value);
wireframeBtn.onclick=()=>{wireframe=!wireframe;material.wireframe=wireframe;wireframeBtn.textContent=wireframe?"Drahtgitter: ein":"Drahtgitter: aus"};
resetBtn.onclick=()=>mesh&&fit(mesh);
fullscreenBtn.onclick=async()=>document.fullscreenElement?document.exitFullscreen():viewerWrap.requestFullscreen();

function resize(){camera.aspect=viewer.clientWidth/viewer.clientHeight;camera.updateProjectionMatrix();renderer.setSize(viewer.clientWidth,viewer.clientHeight)}
addEventListener("resize",resize);
document.addEventListener("fullscreenchange",()=>setTimeout(resize,50));

(function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)})();
camera.position.set(100,80,120);
loadLibrary();
