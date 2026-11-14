'use strict';
/* Beet Down — game logic. Art comes from assets.js (Kenney CC0, built by tools/build_assets.py). */

/* ================= utils ================= */
const TAU=Math.PI*2;
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const lerp=(a,b,t)=>a+(b-a)*t;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const d2=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy};
function angLerp(a,b,t){let d=((b-a)%TAU+TAU*1.5)%TAU-Math.PI;return a+d*t}
function angDiff(a,b){return Math.abs(((b-a)%TAU+TAU*1.5)%TAU-Math.PI)}
function weighted(obj){let s=0;for(const k in obj)s+=obj[k];let r=Math.random()*s;for(const k in obj){r-=obj[k];if(r<=0)return k}return Object.keys(obj)[0]}
const $=id=>document.getElementById(id);
const FD='"Lilita One","Arial Black",system-ui,sans-serif';
const store={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};

/* ================= assets ================= */
const A=window.BD_ASSETS||{}; const IMG={};
function loadAssets(){return Promise.all(Object.keys(A).map(k=>new Promise(res=>{const im=new Image();im.onload=()=>res();im.onerror=()=>res();im.src=A[k].src;IMG[k]=im})))}
const tintCache=new Map();
function tinted(name,col){const k=name+'|'+col;let c=tintCache.get(k);if(c)return c;const im=IMG[name];c=document.createElement('canvas');c.width=im.width||1;c.height=im.height||1;const x=c.getContext('2d');x.drawImage(im,0,0);x.globalCompositeOperation='source-in';x.fillStyle=col;x.fillRect(0,0,c.width,c.height);tintCache.set(k,c);return c}

/* ================= data ================= */
const AW=1280, AH=960;
const RAR=[{n:'Common',c:'#c9c2d6'},{n:'Rare',c:'#4fb3ff'},{n:'Epic',c:'#b86bff'},{n:'Legendary',c:'#ff6b3d'}];
const TIERN=['I','II','III','IV'];
const STAT={maxHp:'Max HP',regen:'HP Regen',lifesteal:'% Life Steal',dmg:'% Damage',melee:'Melee Damage',ranged:'Ranged Damage',atkSpd:'% Attack Speed',crit:'% Crit Chance',range:'Range',armor:'Armor',dodge:'% Dodge',speed:'% Speed',luck:'Luck',harvest:'Harvesting',pickup:'% Pickup Range',boom:'% Death Explosions',thorns:'Thorns'};
const STAT_ORDER=['maxHp','regen','lifesteal','dmg','melee','ranged','atkSpd','crit','range','armor','dodge','speed','luck','harvest'];

const WEAPONS={
  hammer:{name:'Hammer',melee:true,dmg:15,cd:.9,range:120,hitR:34,knock:30,crit:3,critMul:2,price:22,len:46,pv:.14,desc:'Heavy bonk with huge knockback.'},
  spear:{name:'Spear',melee:true,line:true,dmg:11,cd:1.05,range:195,hitR:16,knock:12,crit:5,critMul:2.2,price:26,len:68,pv:.2,desc:'Long thrust that skewers a whole line.'},
  axe:{name:'Axe',melee:true,sweep:1.15,dmg:17,cd:1.15,range:125,knock:22,crit:5,critMul:2,price:30,len:48,pv:.14,desc:'Wide swing that cleaves everything in front.'},
  sword:{name:'Sword',melee:true,sweep:.8,dmg:12,cd:.72,range:140,knock:12,crit:8,critMul:2,price:28,len:52,pv:.16,desc:'Fast slashing arc. Reliable all-rounder.'},
  knife:{name:'Chef Knife',melee:true,dmg:6,cd:.38,range:100,hitR:18,knock:4,crit:25,critMul:2.5,price:20,len:40,pv:.22,desc:'Rapid stabs with 25% base crit chance.'},
  pan:{name:'Frying Pan',melee:true,bonk:true,dmg:13,cd:1,range:112,hitR:38,knock:50,crit:12,critMul:2.5,price:24,len:46,pv:.14,desc:'Sends aliens flying. Crits go BONK.'},
  pistol:{name:'Pistol',dmg:11,cd:.75,range:400,speed:980,pierce:1,knock:8,crit:5,critMul:2,price:20,len:36,pv:.32,desc:'Reliable shot. Pierces 1 enemy.'},
  smg:{name:'SMG',dmg:4,cd:.16,range:340,speed:980,spread:.24,knock:3,crit:2,critMul:2,price:26,len:42,pv:.32,desc:'Sprays a stream of bullets.'},
  shotgun:{name:'Shotgun',dmg:6,cd:1.2,range:290,speed:880,pellets:5,spread:.6,pierce:1,knock:16,crit:3,critMul:2,price:30,len:50,pv:.32,desc:'Five piercing pellets. Best up close.'},
  rocket:{name:'Rocket',dmg:16,cd:1.7,range:440,speed:520,blast:78,knock:22,crit:3,critMul:2,price:36,len:54,pv:.36,desc:'Explodes on impact, hitting everything nearby.'},
  zapper:{name:'Zapper',dmg:9,cd:.95,range:330,chains:3,knock:4,crit:5,critMul:2,price:32,len:44,pv:.32,desc:'Lightning that jumps between enemies.'},
  sniper:{name:'Sniper',dmg:30,cd:1.1,range:650,speed:1900,pierce:4,knock:14,crit:15,critMul:2.5,price:38,len:62,pv:.32,desc:'Huge range. Pierces 4 enemies.'},
  minigun:{name:'Minigun',spin:true,dmg:3.5,cd:.07,range:330,speed:1000,spread:.3,knock:2,crit:2,critMul:2,price:40,len:50,pv:.32,desc:'Spins up into a bullet storm.'},
  flamer:{name:'Flamer',flame:true,dmg:2.2,cd:.085,range:185,speed:430,spread:.3,knock:1,crit:0,critMul:2,price:34,len:46,pv:.32,desc:'Short-range fire that burns through crowds.'},
  bouncer:{name:'Bouncer',bounce:2,dmg:9,cd:.8,range:360,speed:720,knock:6,crit:5,critMul:2,price:30,len:42,pv:.32,desc:'Shots ricochet to 2 more enemies (+1 per tier).'},
  lobber:{name:'Lobber',lob:true,dmg:18,cd:2,range:380,blast:88,knock:24,crit:3,critMul:2,price:38,len:50,pv:.32,desc:'Lobs grenades over the crowd. Big boom.'},
};
const TIER_DMG=[1,1.65,2.5,3.7], TIER_CD=[1,.9,.8,.7], TIER_PRICE=[1,1.9,3.4,6];

const ITEMS=[
  {id:'protein',name:"Choco Bar",r:0,price:14,sym:'♥',col:'#ff6b8a',mods:{maxHp:4,melee:1}},
  {id:'coffee',name:'Bitter Coffee',r:0,price:15,sym:'◉',col:'#c98a4b',mods:{atkSpd:8,speed:-2}},
  {id:'scope',name:'Tin Scope',r:0,price:14,sym:'◎',col:'#9fd0ff',mods:{range:40,atkSpd:-3}},
  {id:'boots',name:"Running Socks",r:0,price:15,sym:'➶',col:'#7bd35a',mods:{speed:7}},
  {id:'bandage',name:"Pocket Defib",r:0,price:13,sym:'✚',col:'#ffffff',mods:{regen:2}},
  {id:'clover',name:"Lucky Star",r:0,price:13,sym:'✤',col:'#5ee07a',mods:{luck:12}},
  {id:'trowel',name:"Shovel",r:0,price:16,sym:'▲',col:'#d9b26b',mods:{harvest:6}},
  {id:'bark',name:"Bark Shield",r:0,price:15,sym:'⬢',col:'#b07a4a',mods:{armor:2,speed:-2}},
  {id:'fang',name:"Blood Chalice",r:1,price:30,sym:'▼',col:'#ff4d6d',mods:{lifesteal:3}},
  {id:'lens',name:'Cracked Lens',r:1,price:28,sym:'◈',col:'#ffe066',mods:{crit:6,range:15}},
  {id:'fizz',name:'Fizzy Drink',r:1,price:30,sym:'ϟ',col:'#6fe3ff',mods:{atkSpd:15,maxHp:-3}},
  {id:'belt',name:"Ammo Clip",r:1,price:32,sym:'≡',col:'#e0b84f',mods:{ranged:3,atkSpd:5}},
  {id:'hood',name:"Cool Shades",r:1,price:30,sym:'☾',col:'#9b8cff',mods:{dodge:6}},
  {id:'magnet',ic:'i_coin',name:"Coin Magnet",r:1,price:24,sym:'∩',col:'#ff5a5a',mods:{pickup:80,harvest:3}},
  {id:'knuckles',name:"Hard Hat",r:1,price:30,sym:'■',col:'#b8b8c8',mods:{melee:3,armor:1}},
  {id:'overcharger',name:"Power Crystal",r:2,price:55,sym:'✺',col:'#ff8a3d',mods:{dmg:22,armor:-2}},
  {id:'thorn',name:"Cactus Armor",r:2,price:50,sym:'✳',col:'#6cc24a',mods:{thorns:14,armor:3},extra:'Enemies that touch you take 14 damage'},
  {id:'twin',name:"Double Shells",r:2,price:62,sym:'‖',col:'#ffcc4d',mods:{extraProj:1,dmg:-5},extra:'Ranged weapons fire +1 projectile',max:2},
  {id:'mask',name:"Jack-o'-Mask",r:2,price:55,sym:'✖',col:'#e0336f',mods:{dmg:15,atkSpd:12,maxHp:-5}},
  {id:'core',name:'Alien Core',r:3,price:90,sym:'✦',col:'#5ef2b0',mods:{dmg:15,atkSpd:15,maxHp:6,speed:5}},
  {id:'reactor',name:'Chain Reactor',r:3,price:95,sym:'✹',col:'#ff6b3d',mods:{boom:35},max:2},
  {id:'crown',name:"Blood Ruby",r:3,price:90,sym:'♛',col:'#ff4d6d',mods:{lifesteal:7,maxHp:10}},
];
const ITEM_BY=Object.fromEntries(ITEMS.map(i=>[i.id,i]));
function iconHTML(key,fallback,col,cls='iimg'){const a=A[key];return a?`<img class="${cls}" src="${a.src}" alt="">`:`<span class="sym" style="color:${col}">${fallback}</span>`}
const itemIcon=(it,cls)=>iconHTML(it.ic||'i_'+it.id,it.sym,it.col,cls);
const UPG_IC={maxHp:'i_heart',regen:'i_bandage',lifesteal:'i_fang',dmg:'i_overcharger',melee:'i_knuckles',ranged:'i_belt',atkSpd:'i_coffee',crit:'i_lens',range:'i_scope',armor:'i_bark',dodge:'i_hood',speed:'i_boots',luck:'i_clover',harvest:'i_trowel'};

const UPG=[['maxHp',[3,6,9,12],'♥','#ff6b8a'],['regen',[2,3,4,5],'✚','#fff'],['lifesteal',[1,2,3,4],'▼','#ff4d6d'],['dmg',[5,8,12,16],'✺','#ff8a3d'],['melee',[1,2,3,4],'■','#b8b8c8'],['ranged',[1,2,3,4],'≡','#e0b84f'],['atkSpd',[5,10,15,20],'ϟ','#6fe3ff'],['crit',[3,5,7,9],'◈','#ffe066'],['range',[15,30,45,60],'◎','#9fd0ff'],['armor',[1,2,3,4],'⬢','#b07a4a'],['dodge',[3,6,9,12],'☾','#9b8cff'],['speed',[3,6,9,12],'➶','#7bd35a'],['luck',[5,10,15,20],'✤','#5ee07a'],['harvest',[5,8,10,12],'▲','#d9b26b']];

/* k: sprite height in body radii. fy: face height (0 top..1 bottom). es: eye spacing, ez: eye size (fractions of sprite height). */
const CHARS=[
  {id:'beet',name:'Beet',role:'Rookie',desc:'Fresh out of the crater. No tricks.',weapon:'pistol',mods:{maxHp:3,speed:5},lines:[],k:4.4,fy:.73,es:.075,ez:.045},
  {id:'carrot',name:'Carrot',role:'Sharpshooter',desc:'Sees aliens coming from a mile off.',weapon:'sniper',mods:{range:60,ranged:3,crit:8},lines:[],k:4.6,fy:.52,es:.04,ez:.032},
  {id:'onion',name:'Onion',role:'Stinker',desc:'Layers of armor and a smell that hurts.',weapon:'pan',mods:{armor:3,maxHp:8,speed:-8},lines:[['Stink aura damages nearby enemies','pos']],aura:true,k:2.7,fy:.6,es:.13,ez:.07},
  {id:'radish',name:'Radish',role:'Brawler',desc:'Settles things face to face.',weapon:'hammer',mods:{melee:3,maxHp:6,armor:1},lines:[['Ranged weapons deal half damage','neg']],rangedMul:.5,k:4.4,fy:.8,es:.055,ez:.035},
  {id:'corn',name:'Corn',role:'Lucky',desc:'Things just keep popping its way.',weapon:'smg',mods:{luck:40,harvest:10,dmg:-10},lines:[['Shop rerolls cost half','pos']],cheapReroll:true,k:3.2,fy:.4,es:.06,ez:.04},
  {id:'eggplant',name:'Eggplant',role:'Glass Cannon',desc:'Hits like a truck. Bruises like fruit.',weapon:'shotgun',mods:{dmg:40,atkSpd:10,maxHp:-8},lines:[],k:3.1,fy:.55,es:.09,ez:.055},
  {id:'broccoli',name:'Broccoli',role:'Sprout',desc:'Keeps growing back, whatever you do.',weapon:'bouncer',mods:{regen:6,lifesteal:3,dmg:-15},lines:[],k:2.9,fy:.36,es:.1,ez:.06},
  {id:'mushroom',name:'Mushroom',role:'Spore Bomb',desc:'Everything it touches goes pop.',weapon:'lobber',mods:{boom:18,atkSpd:-10},lines:[],k:2.8,fy:.37,es:.12,ez:.06},
  {id:'pepper',name:'Pepper',role:'Hot Head',desc:'Fast, furious and slightly on fire.',weapon:'flamer',mods:{atkSpd:18,speed:10,armor:-3,maxHp:-3},lines:[],k:2.8,fy:.55,es:.1,ez:.06},
  {id:'pumpkin',name:'Pumpkin',role:'Big Gourd',desc:'Too big to fail. Too slow to dodge.',weapon:'axe',mods:{maxHp:20,thorns:10,dmg:-10,speed:-3},lines:[['Bigger body','neu']],r:23,k:2.3,fy:.58,es:.15,ez:.065},
];

const ENEMIES={
  grub:{hp:7,spd:95,dmg:3,r:14,mats:1,col:'#3cd46f',dark:'#1d7a3e'},
  dasher:{hp:11,spd:72,dmg:5,r:15,mats:1,col:'#ff4d6d',dark:'#9c1f37'},
  spitter:{hp:10,spd:85,dmg:3,r:15,mats:1,col:'#45d6e8',dark:'#1d7584'},
  brute:{hp:50,spd:55,dmg:7,r:27,mats:3,col:'#6b5444',dark:'#2e2219',heavy:true},
  splitter:{hp:18,spd:78,dmg:4,r:19,mats:1,vs:.9,col:'#ffc21f',dark:'#9a6f00'},
  mini:{hp:4,spd:135,dmg:2,r:10,mats:1,col:'#ffc21f',dark:'#9a6f00'},
  bomber:{hp:14,spd:100,dmg:9,r:15,mats:2,col:'#ff5577',dark:'#8a1530'},
  hopper:{hp:16,spd:0,dmg:5,r:15,mats:1,vs:.8,col:'#3cd46f',dark:'#1d7a3e'},
  lootbug:{hp:30,spd:150,dmg:0,r:16,mats:12,col:'#f2eef0',dark:'#8a8090'},
  boss:{hp:3400,spd:70,dmg:10,r:62,mats:60,col:'#ff4d6d',dark:'#7a1530',heavy:true},
};
const WAVES=[
  {dur:20,int:1.5,grp:[2,4],mix:{grub:1}},
  {dur:25,int:1.45,grp:[2,4],mix:{grub:3,dasher:1}},
  {dur:30,int:1.4,grp:[3,4],mix:{grub:3,dasher:1,spitter:1},bug:true},
  {dur:35,int:1.35,grp:[3,5],mix:{grub:3,dasher:1,spitter:1,splitter:1,bomber:.5}},
  {dur:40,int:1.2,grp:[4,6],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.4,bomber:.6},elite:true,bug:true},
  {dur:45,int:1.1,grp:[4,6],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.6,bomber:.7,hopper:1}},
  {dur:45,int:1.05,grp:[5,7],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.6,bomber:.8,hopper:1.2},bug:true},
  {dur:50,int:1,grp:[5,7],mix:{grub:3,dasher:1.4,spitter:1.2,splitter:1.2,brute:.8,bomber:.9,hopper:1.3},elite:true},
  {dur:55,int:.95,grp:[6,8],mix:{grub:3,dasher:1.5,spitter:1.3,splitter:1.3,brute:1,bomber:1,hopper:1.4},bug:true},
  {dur:0,int:2.6,grp:[3,5],mix:{grub:2,dasher:1,spitter:1,hopper:1},boss:true},
];
const LAST_WAVE=WAVES.length;

/* ================= audio ================= */
const AU={ctx:null,master:null,noise:null,muted:store.get('bd_muted',false),last:{}};
function audioInit(){
  if(AU.ctx){if(AU.ctx.state==='suspended')AU.ctx.resume();return}
  try{
    const C=window.AudioContext||window.webkitAudioContext; if(!C)return;
    AU.ctx=new C(); AU.master=AU.ctx.createGain(); AU.master.gain.value=AU.muted?0:.45; AU.master.connect(AU.ctx.destination);
    const len=AU.ctx.sampleRate; const b=AU.ctx.createBuffer(1,len,AU.ctx.sampleRate); const d=b.getChannelData(0);
    for(let i=0;i<len;i++)d[i]=Math.random()*2-1; AU.noise=b;
  }catch(e){AU.ctx=null}
}
function blip(f0,f1,dur,type,vol,delay=0){
  const c=AU.ctx; if(!c||AU.muted)return; const t=c.currentTime+delay;
  const o=c.createOscillator(), g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
  g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur); o.connect(g); g.connect(AU.master); o.start(t); o.stop(t+dur+.02);
}
function nz(dur,vol,f0,f1,delay=0){
  const c=AU.ctx; if(!c||AU.muted||!AU.noise)return; const t=c.currentTime+delay;
  const s=c.createBufferSource(); s.buffer=AU.noise; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(f0,t); f.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+dur);
  const g=c.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur); s.connect(f); f.connect(g); g.connect(AU.master); s.start(t,Math.random()*.5); s.stop(t+dur+.02);
}
const GAP={shoot:45,smg:55,hit:28,crit:40,kill:22,gem:22,swing:60,zap:60,boom:50,shotgun:60,rocket:60,dodge:80,flame:90,sniper:80,bounce:50,lob:80,bonk:60,fuse:120};
function sfx(n,arg){
  if(!AU.ctx||AU.muted)return; const now=performance.now(); if(GAP[n]&&now-(AU.last[n]||0)<GAP[n])return; AU.last[n]=now;
  switch(n){
    case 'shoot': blip(rand(850,950),260,.07,'square',.035); break;
    case 'smg': blip(rand(1150,1300),500,.045,'square',.022); break;
    case 'shotgun': nz(.18,.16,2500,300); blip(180,50,.12,'sawtooth',.06); break;
    case 'sniper': blip(1800,120,.22,'sawtooth',.06); nz(.25,.14,5000,400); break;
    case 'rocket': nz(.28,.07,600,1800); break;
    case 'lob': blip(300,700,.12,'triangle',.06); nz(.08,.05,1500,800); break;
    case 'flame': nz(.12,.05,900,400); break;
    case 'bounce': blip(1400,2200,.06,'square',.03); break;
    case 'zap': blip(1600,180,.13,'sawtooth',.035); blip(2400,900,.08,'square',.02,.03); break;
    case 'swing': nz(.09,.07,3500,700); break;
    case 'bonk': blip(900,880,.18,'triangle',.12); blip(1800,1750,.12,'sine',.05); break;
    case 'hit': blip(rand(260,320),110,.05,'triangle',.07); break;
    case 'crit': blip(1300,500,.08,'square',.045); nz(.06,.06,4000,1500); break;
    case 'kill': blip(rand(200,260),rand(650,800),.07,'triangle',.07); nz(.05,.05,3000,800); break;
    case 'gem': {const f=660*Math.pow(2,Math.min(arg||0,24)/12); blip(f,f*1.5,.07,'sine',.05); break}
    case 'hurt': blip(420,70,.28,'sawtooth',.11); nz(.2,.12,1800,200); break;
    case 'boom': nz(.55,.28,1600,80); blip(130,35,.35,'sine',.25); break;
    case 'fuse': blip(1200,1200,.05,'square',.03); break;
    case 'levelup': [523,659,784,1047].forEach((f,i)=>blip(f,f,.12,'square',.04,i*.07)); break;
    case 'buy': blip(880,880,.08,'square',.04); blip(1320,1320,.14,'square',.04,.07); break;
    case 'deny': blip(200,150,.15,'square',.05); break;
    case 'wave': blip(110,55,.3,'sine',.25); nz(.2,.1,800,100); blip(440,440,.1,'square',.04,.1); blip(660,660,.15,'square',.04,.2); break;
    case 'clear': [392,523,659,784,1047].forEach((f,i)=>blip(f,f*1.01,.16,'triangle',.06,i*.08)); break;
    case 'dodge': blip(700,1500,.09,'sine',.05); break;
    case 'heal': blip(700,1100,.12,'sine',.05); break;
    case 'crate': [784,988,1175].forEach((f,i)=>blip(f,f,.1,'triangle',.06,i*.06)); break;
    case 'combo': blip(990,1980,.18,'square',.04); blip(1480,2960,.18,'square',.03,.06); break;
    case 'roar': nz(1.2,.25,300,60); blip(70,40,1.2,'sawtooth',.12); break;
    case 'hop': blip(250,600,.1,'sine',.05); break;
    case 'click': blip(600,500,.04,'square',.03); break;
  }
}
function setMuted(m){AU.muted=m;store.set('bd_muted',m);if(AU.master)AU.master.gain.value=m?0:.45;$('btnSound').textContent=m?'×':'♪';$('btnSound').style.opacity=m?.6:1}

/* ================= canvas ================= */
const cvs=$('game'), ctx=cvs.getContext('2d');
let W=0,H=0,DPR=1,SC=1,SAFE={t:0,l:0,r:0,b:0};
const probe=document.createElement('div');
probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
document.body.appendChild(probe);
function resize(){
  DPR=Math.min(2,window.devicePixelRatio||1); W=window.innerWidth; H=window.innerHeight;
  cvs.width=Math.round(W*DPR); cvs.height=Math.round(H*DPR);
  SC=clamp(Math.min(W,H)/(W<H?500:640),.55,1.45);
  const cs=getComputedStyle(probe); SAFE={t:parseFloat(cs.paddingTop)||0,r:parseFloat(cs.paddingRight)||0,b:parseFloat(cs.paddingBottom)||0,l:parseFloat(cs.paddingLeft)||0};
}
window.addEventListener('resize',resize); resize();

const floor=document.createElement('canvas'); floor.width=AW; floor.height=AH;
function buildFloor(){
  const c=floor.getContext('2d');
  const g=c.createRadialGradient(AW/2,AH/2,100,AW/2,AH/2,AW*.7); g.addColorStop(0,'#3d3040'); g.addColorStop(1,'#291d2d');
  c.fillStyle=g; c.fillRect(0,0,AW,AH);
  c.strokeStyle='rgba(0,0,0,.16)'; c.lineWidth=2;
  for(let x=0;x<=AW;x+=80){c.beginPath();c.moveTo(x,0);c.lineTo(x,AH);c.stroke()}
  for(let y=0;y<=AH;y+=80){c.beginPath();c.moveTo(0,y);c.lineTo(AW,y);c.stroke()}
  for(let i=0;i<900;i++){c.fillStyle=`rgba(${Math.random()<.5?'255,220,200':'10,0,10'},${rand(.03,.08)})`;c.beginPath();c.arc(rand(0,AW),rand(0,AH),rand(1,4),0,TAU);c.fill()}
  // soft moss patches
  for(let i=0;i<14;i++){const x=rand(0,AW),y=rand(0,AH),r=rand(60,140);const gg=c.createRadialGradient(x,y,0,x,y,r);gg.addColorStop(0,'rgba(90,140,80,.12)');gg.addColorStop(1,'rgba(90,140,80,0)');c.fillStyle=gg;c.fillRect(x-r,y-r,r*2,r*2)}
  // sparse, muted decor so enemies stay readable
  const deco=[['d_grass',22,.3,.45,.32],['d_grassl',10,.35,.5,.3],['d_rocka',5,.35,.5,.5],['d_rockb',5,.35,.5,.5],['d_rockc',4,.35,.5,.5],['d_mush',5,.22,.32,.55]];
  for(const [n,cnt,s0,s1,al] of deco){const im=IMG[n];if(!im||!im.width)continue;for(let i=0;i<cnt;i++){const s=rand(s0,s1);const w=im.width*s,h=im.height*s;const x=rand(20,AW-20),y=rand(20,AH-20);c.globalAlpha=al;c.drawImage(im,x-w/2,y-h/2,w,h)}}
  c.globalAlpha=1; c.fillStyle='rgba(30,18,36,.25)'; c.fillRect(0,0,AW,AH);
}
const decal=document.createElement('canvas'); decal.width=AW; decal.height=AH; const dctx=decal.getContext('2d');

/* ================= state ================= */
let state='loading';
let run=null, P=null, S=null;
let enemies=[],bullets=[],ebullets=[],gems=[],pickups=[],parts=[],texts=[],fx=[],spawns=[],booms=[];
let cam={x:AW/2,y:AH/2},shake=0,freezeT=0,timeScale=1,hurtFlash=0,banner=null;
const keys={}; const joy={id:null,ox:0,oy:0,x:0,y:0,active:false};

function newRun(ch){
  S={maxHp:20,regen:0,lifesteal:0,dmg:0,melee:0,ranged:0,atkSpd:0,crit:0,range:0,armor:0,dodge:0,speed:0,luck:0,harvest:0,pickup:0,extraProj:0,thorns:0,boom:0};
  for(const k in ch.mods)S[k]+=ch.mods[k];
  run={char:ch,wave:0,mats:0,kills:0,pendingLv:0,crates:0,items:{},weapons:[],shop:[],rerolls:0,combo:0,comboT:0,bestCombo:0,gemChain:0,lastGem:0,lsCd:0,matBump:0,hpTrail:S.maxHp,time:0,totalMats:0,auraT:0};
  P={x:AW/2,y:AH/2,vx:0,vy:0,r:ch.r||18,hp:S.maxHp,iframes:0,walk:0,moving:false,lx:1,ly:0,level:0,xp:0,regenAcc:0,blink:2};
  addWeapon(ch.weapon,0);
}
const maxHp=()=>Math.max(1,Math.round(S.maxHp));
const xpNeed=l=>(l+3)*(l+3);

/* ================= weapons ================= */
function addWeapon(id,tier){
  if(run.weapons.length>=6){const m=run.weapons.find(w=>w.id===id&&w.tier===tier&&tier<3);if(!m)return false;m.tier++;m.flash=1;return true}
  run.weapons.push({id,tier,cd:rand(.1,.5),aim:-Math.PI/2,ext:0,thrust:null,recoil:0,flash:0,spin:0}); return true;
}
function canAddWeapon(id,tier){return run.weapons.length<6||run.weapons.some(w=>w.id===id&&w.tier===tier&&tier<3)}
function wDmg(def,t){const base=def.dmg*TIER_DMG[t]+(def.melee?S.melee:S.ranged)*(def.flame||def.spin?.4:1);const mul=(1+S.dmg/100)*(def.melee?1:(run.char.rangedMul||1));return Math.max(1,base*mul)}
function wCd(def,t){const a=S.atkSpd>=0?1+S.atkSpd/100:1/(1-S.atkSpd/100);return def.cd*TIER_CD[t]/a}
function wRange(def){return Math.max(60,def.range+S.range*(def.melee?.5:1))}
function wPrice(id,t){return Math.round(WEAPONS[id].price*TIER_PRICE[t]*(1+.1*run.wave))}
function iPrice(it){return Math.round(it.price*(1+.1*run.wave))}
function slotPos(i,n){if(n===1)return{x:P.x+P.r+8,y:P.y+4};const a=-Math.PI/2+i/n*TAU+Math.PI/n;const R=P.r+18;return{x:P.x+Math.cos(a)*R,y:P.y+Math.sin(a)*R*.85+4}}
function nearestEnemy(x,y,R,exclude){let best=null,bd=R*R;for(const e of enemies){if(e.dead||e.popT!=null||(exclude&&exclude.has(e)))continue;const dd=d2(x,y,e.x,e.y)-e.r*e.r;if(dd<bd){bd=dd;best=e}}return best}
function segDist(px,py,ax,ay,bx,by){const vx=bx-ax,vy=by-ay;const l=vx*vx+vy*vy||1;let t=((px-ax)*vx+(py-ay)*vy)/l;t=clamp(t,0,1);return Math.hypot(px-(ax+vx*t),py-(ay+vy*t))}

function updateWeapons(dt){
  const n=run.weapons.length;
  run.weapons.forEach((w,i)=>{
    const def=WEAPONS[w.id]; const sp=slotPos(i,n); w.sx=sp.x; w.sy=sp.y;
    w.cd-=dt; w.recoil=Math.max(0,w.recoil-dt*8); w.flash=Math.max(0,w.flash-dt*2);
    const R=wRange(def);
    if(w.thrust){
      const T=w.thrust; T.t+=dt; const p=T.t/T.dur;
      if(def.sweep){
        w.ext=Math.sin(Math.min(1,p)*Math.PI);
        T.cur=T.a-def.sweep+2*def.sweep*easeInOut(Math.min(1,p));
        if(!T.done&&p>=.45){T.done=true;
          for(const e of enemies){if(e.dead||e.popT!=null)continue;const dd=Math.hypot(e.x-sp.x,e.y-sp.y);if(dd<R+e.r&&angDiff(T.a,Math.atan2(e.y-sp.y,e.x-sp.x))<def.sweep+.15)dealHit(e,T.dmg,def,Math.atan2(e.y-sp.y,e.x-sp.x),def.knock)}
          fx.push({k:'slash',x:sp.x+Math.cos(T.a)*R*.6,y:sp.y+Math.sin(T.a)*R*.6,a:T.a,t:0,life:.18,s:R*1.25})}
      }else{
        w.ext=p<.35?1-Math.pow(1-p/.35,3):Math.max(0,1-(p-.35)/.65);
        const tx=sp.x+Math.cos(T.a)*T.d*w.ext, ty=sp.y+Math.sin(T.a)*T.d*w.ext;
        if(p<.6)for(const e of enemies){
          if(e.dead||e.popT!=null||T.hit.has(e))continue; let hit=false;
          if(def.line)hit=segDist(e.x,e.y,sp.x,sp.y,tx,ty)<e.r+def.hitR; else hit=d2(e.x,e.y,tx,ty)<(e.r+def.hitR)*(e.r+def.hitR);
          if(hit){T.hit.add(e);dealHit(e,T.dmg,def,T.a,def.knock);if(!T.fx){T.fx=1;fx.push({k:'slash',x:tx,y:ty,a:T.a,t:0,life:.14,s:def.hitR*2.4})}}
        }
      }
      if(p>=1){w.thrust=null;w.ext=0}
      return;
    }
    const tgt=nearestEnemy(sp.x,sp.y,R);
    if(def.spin)w.spin=tgt?Math.min(1,w.spin+dt*.7):Math.max(0,w.spin-dt*1.5);
    if(tgt){
      const a=Math.atan2(tgt.y-sp.y,tgt.x-sp.x); w.aim=angLerp(w.aim,a,1-Math.exp(-dt*25));
      if(w.cd<=0){fire(w,def,sp,tgt,a,R);w.cd=wCd(def,w.tier)/(def.spin?.3+.7*w.spin:1)}
    }else w.aim=angLerp(w.aim,Math.atan2(P.ly,P.lx),1-Math.exp(-dt*6));
  });
}
const easeInOut=t=>t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

function fire(w,def,sp,tgt,a,R){
  const dmg=wDmg(def,w.tier); w.recoil=1; w.aim=a;
  if(def.melee){
    const dist=Math.min(R,Math.hypot(tgt.x-sp.x,tgt.y-sp.y)+12);
    w.thrust={t:0,dur:def.sweep?clamp(wCd(def,w.tier)*.55,.2,.34):clamp(wCd(def,w.tier)*.5,.12,.3),a,d:dist,hit:new Set(),dmg,cur:a}; sfx('swing'); return;
  }
  const mx=sp.x+Math.cos(a)*def.len*(1-def.pv), my=sp.y+Math.sin(a)*def.len*(1-def.pv);
  if(def.chains){
    const hit=new Set(); let from={x:mx,y:my}; let cur=tgt; const pts=[from];
    const n=def.chains+w.tier+S.extraProj;
    for(let k=0;k<n&&cur;k++){hit.add(cur);pts.push({x:cur.x,y:cur.y});dealHit(cur,dmg*(1-k*.08),def,Math.atan2(cur.y-from.y,cur.x-from.x),def.knock);from=cur;cur=nearestEnemy(cur.x,cur.y,170,hit)}
    fx.push({k:'zap',pts:jag(pts),nodes:pts,t:0,life:.18}); sfx('zap'); return;
  }
  if(def.lob){
    const n=1+S.extraProj;
    for(let i=0;i<n;i++){const tx=tgt.x+(i?rand(-60,60):0),ty=tgt.y+(i?rand(-60,60):0);const dist=Math.hypot(tx-mx,ty-my);bullets.push({lob:true,sx:mx,sy:my,tx,ty,x:mx,y:my,t:0,T:clamp(dist/420,.35,.9),dmg,def,z:0,rot:0})}
    muzzle(mx,my,a,.8); sfx('lob'); return;
  }
  const n=(def.pellets||1)+S.extraProj;
  for(let i=0;i<n;i++){
    let ang=a; const spr=def.spread||(n>1?.22:0);
    if(n>1&&!def.flame)ang+=(i/(n-1)-.5)*spr+rand(-.04,.04); else ang+=rand(-.5,.5)*spr;
    const sp2=def.speed*(def.flame?rand(.85,1.1):1);
    bullets.push({x:mx,y:my,vx:Math.cos(ang)*sp2,vy:Math.sin(ang)*sp2,spd:sp2,dmg,def,range:R+40,trav:0,pierce:def.flame?99:(def.pierce||0),hit:new Set(),r:def.blast?7:def.flame?10:4.5,rocket:!!def.blast,flame:!!def.flame,bounce:def.bounce?def.bounce+w.tier:0,a:ang,rot:rand(0,TAU)});
  }
  if(def.flame){sfx('flame');return}
  muzzle(mx,my,a,def.pellets?1.4:def.speed>1500?1.5:1);
  sfx({smg:'smg',minigun:'smg',shotgun:'shotgun',rocket:'rocket',sniper:'sniper',bouncer:'bounce'}[w.id]||'shoot');
}
function muzzle(x,y,a,s){
  fx.push({k:'muzzle',x,y,a,t:0,life:.06,s});
  for(let i=0;i<3;i++)parts.push({x,y,vx:Math.cos(a+rand(-.5,.5))*rand(100,260),vy:Math.sin(a+rand(-.5,.5))*rand(100,260),t:0,life:rand(.06,.14),c:'#fff3b0',s:rand(2,4)});
}
function jag(pts){const out=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];for(let k=1;k<4;k++){const t=k/4;out.push({x:lerp(a.x,b.x,t)+rand(-9,9),y:lerp(a.y,b.y,t)+rand(-9,9)})}out.push(b)}return out}

/* ================= combat ================= */
function dealHit(e,dmg,def,ang,knock){
  const crit=Math.random()*100<(def.crit+S.crit);
  hurtEnemy(e,Math.max(1,Math.round(dmg*(crit?def.critMul:1))),crit,ang,knock,crit&&def.bonk);
}
function hurtEnemy(e,d,crit,ang,knock,bonk){
  if(e.dead||e.popT!=null)return;
  e.hp-=d; if(!(e.flashCd>0)){e.flash=.07;e.flashCd=.14}
  const kr=e.def.heavy?(e.type==='boss'?.08:.3):1; e.kx+=Math.cos(ang)*knock*kr*14*(bonk?2:1); e.ky+=Math.sin(ang)*knock*kr*14*(bonk?2:1);
  e.sq=1;
  texts.push({x:e.x+rand(-8,8),y:e.y-e.r,vy:-90,t:0,life:crit?.8:.6,s:bonk?30:crit?26:17,txt:bonk?'BONK!':crit?d+'!':''+d,c:bonk?'#ff8a3d':crit?'#ffcc4d':'#ffffff'});
  for(let i=0;i<(crit?6:2);i++)parts.push({x:e.x,y:e.y,vx:Math.cos(ang+rand(-.8,.8))*rand(80,260),vy:Math.sin(ang+rand(-.8,.8))*rand(80,260),t:0,life:rand(.2,.4),c:e.def.col,s:rand(2,4.5),g:300});
  if(crit){parts.push({x:e.x+rand(-6,6),y:e.y-e.r*.4,vx:0,vy:0,t:0,life:.3,img:'fx_glint',col:'#fff4b0',s0:20,s1:46,rot:rand(0,1),add:1});shake=Math.max(shake,2.5)}
  sfx(bonk?'bonk':crit?'crit':'hit');
  if(S.lifesteal>0&&run.lsCd<=0&&Math.random()*100<S.lifesteal){heal(1);run.lsCd=.12}
  if(e.hp<=0)killEnemy(e,true);
}
function heal(n){const m=maxHp();if(P.hp>=m)return;const h=Math.min(n,m-P.hp);P.hp+=h;texts.push({x:P.x,y:P.y-34,vy:-70,t:0,life:.7,s:16,txt:'+'+h,c:'#7bd35a'})}

function killEnemy(e,drops){
  if(e.dead)return; e.dead=true;
  const big=e.r>24;
  for(let i=0;i<(big?26:14);i++){const a=rand(0,TAU),s=rand(80,big?420:300);parts.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.3,.7),c:Math.random()<.6?e.def.col:e.def.dark,s:rand(3,big?9:6),g:200,drag:3})}
  for(let i=0;i<(big?4:2);i++)parts.push({x:e.x+rand(-8,8),y:e.y+rand(-8,8),vx:rand(-40,40),vy:rand(-60,-10),t:0,life:rand(.4,.6),img:'fx_puff',col:e.def.col,s0:e.r*1.2,s1:e.r*3,rot:rand(0,TAU),vr:rand(-2,2),a0:.55});
  fx.push({k:'ring',x:e.x,y:e.y,r0:e.r*.6,r1:e.r*2.4,t:0,life:.28,c:e.def.col,w:4});
  splat(e.x,e.y,e.r,e.def.dark);
  sfx('kill');
  if(e.type==='bomber')booms.push({x:e.x,y:e.y,t:.05,r:80,dmg:28+run.wave*3,safe:true});
  if(!drops)return;
  run.kills++; run.combo++; run.comboT=1.4; run.bestCombo=Math.max(run.bestCombo,run.combo);
  if(run.combo%25===0){
    const bonus=Math.floor(run.combo/25)*3;
    for(let i=0;i<bonus;i++)dropGem(P.x+rand(-40,40),P.y+rand(-40,40),1,true);
    texts.push({x:P.x,y:P.y-56,vy:-50,t:0,life:1.2,s:24,txt:run.combo+' COMBO! +'+bonus,c:'#5ef2b0'});
    fx.push({k:'ring',x:P.x,y:P.y,r0:10,r1:140,t:0,life:.4,c:'#5ef2b0',w:5}); sfx('combo');
  }
  let m=e.mats; if(Math.random()<S.luck/200)m++;
  if(m>=8){const b5=Math.floor(m/5);for(let i=0;i<b5;i++)dropGem(e.x,e.y,5);m-=b5*5}
  for(let i=0;i<m;i++)dropGem(e.x,e.y,1);
  if(Math.random()<.025*(1+S.luck/100))pickups.push({k:'fruit',x:e.x,y:e.y,t:0,vx:rand(-60,60),vy:rand(-60,60)});
  if(e.crate)pickups.push({k:'crate',x:e.x,y:e.y,t:0,vx:0,vy:0});
  if(S.boom>0&&Math.random()*100<S.boom)booms.push({x:e.x,y:e.y,t:.07,r:55,dmg:8+S.dmg*.1+run.wave,safe:true});
  if(e.type==='splitter')for(let k=0;k<2;k++){const m2=makeEnemy('mini',e.x+rand(-6,6),e.y+rand(-6,6));const a=rand(0,TAU);m2.kx=Math.cos(a)*260;m2.ky=Math.sin(a)*260;enemies.push(m2)}
  if(big||e.elite){freezeT=Math.max(freezeT,.06);shake=Math.max(shake,8)}
  if(e.type==='boss')bossDown(e);
}
function stamp(name,col,x,y,size,alpha,rot){const im=tinted(name,col);dctx.save();dctx.globalAlpha=alpha;dctx.translate(x,y);dctx.rotate(rot);dctx.drawImage(im,-size/2,-size/2*im.height/im.width,size,size*im.height/im.width);dctx.restore()}
function splat(x,y,r,col){stamp('fx_splat',col,x,y,r*rand(3,4),.6,rand(0,TAU))}
function explode(x,y,R,dmg,knock,hurtsPlayer){
  for(const e of enemies){if(e.dead)continue;const dd=Math.sqrt(d2(x,y,e.x,e.y));if(dd<R+e.r){const crit=Math.random()*100<S.crit+3;hurtEnemy(e,Math.max(1,Math.round(dmg*(crit?2:1))),crit,Math.atan2(e.y-y,e.x-x),knock)}}
  if(hurtsPlayer&&Math.hypot(P.x-x,P.y-y)<R+P.r)hurtPlayer(hurtsPlayer,null);
  fx.push({k:'ring',x,y,r0:R*.3,r1:R*1.15,t:0,life:.3,c:'#ffd27a',w:8});
  parts.push({x,y,vx:0,vy:0,t:0,life:.3,img:'fx_fire',col:'#ffb347',s0:R*.8,s1:R*2.2,rot:rand(0,TAU),add:1,a0:1});
  parts.push({x,y,vx:0,vy:0,t:0,life:.18,img:'fx_glow',col:'#fff6d0',s0:R*1.2,s1:R*2.4,add:1,a0:1});
  for(let i=0;i<5;i++){const a=rand(0,TAU);parts.push({x:x+Math.cos(a)*R*.3,y:y+Math.sin(a)*R*.3,vx:Math.cos(a)*rand(20,70),vy:Math.sin(a)*rand(20,70)-20,t:0,life:rand(.6,1),img:'fx_smoke',col:'#3a2c3c',s0:R*.6,s1:R*1.6,rot:rand(0,TAU),vr:rand(-1,1),a0:.6})}
  for(let i=0;i<16;i++){const a=rand(0,TAU),s=rand(120,420);parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.25,.6),c:pick(['#ffcc4d','#ff8a3d','#ff5d3d','#fff3b0']),s:rand(3,7),drag:4})}
  stamp('fx_scorch','#120a10',x,y,R*2,.45,rand(0,TAU));
  shake=Math.max(shake,7); sfx('boom');
}
function dropGem(x,y,val,instant){
  if(gems.length>320){const g=pick(gems);g.val+=val;return}
  const a=rand(0,TAU),s=rand(60,220);
  gems.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,val,t:instant?.3:0,spin:rand(0,TAU),mag:false,sp:0,vac:false});
}
function hurtPlayer(d,src){
  if(P.iframes>0||state!=='wave')return;
  if(Math.random()*100<Math.min(60,S.dodge)){P.iframes=.25;texts.push({x:P.x,y:P.y-34,vy:-80,t:0,life:.6,s:18,txt:'DODGE',c:'#9fd0ff'});sfx('dodge');return}
  const ar=S.armor; const mul=ar>=0?15/(15+ar):1+(-ar)/15;
  d=Math.max(1,Math.round(d*mul));
  run.dmgBy=run.dmgBy||{}; const dk=src?src.type:'shot'; run.dmgBy[dk]=(run.dmgBy[dk]||0)+d;
  P.hp-=d; P.iframes=.75; hurtFlash=1; shake=Math.max(shake,11); freezeT=Math.max(freezeT,.07);
  texts.push({x:P.x,y:P.y-34,vy:-80,t:0,life:.8,s:22,txt:'-'+d,c:'#ff5d6c'});
  for(let i=0;i<12;i++){const a=rand(0,TAU),s=rand(80,240);parts.push({x:P.x,y:P.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.3,.5),c:'#c2185b',s:rand(3,6),g:300})}
  sfx('hurt');
  if(S.thorns>0&&src&&!src.dead)hurtEnemy(src,Math.round(S.thorns*(1+S.dmg/200)),false,Math.atan2(src.y-P.y,src.x-P.x),18);
  if(P.hp<=0){P.hp=0;die()}
}

/* ================= enemies ================= */
function waveMul(){const w=run.wave;return{hp:1+.36*(w-1)+.035*(w-1)*(w-1),dmg:1+.17*(w-1)}}
function makeEnemy(type,x,y,elite){
  const def=ENEMIES[type]; const m=type==='boss'?{hp:1,dmg:1}:waveMul();
  const e={type,def,x,y,z:0,kx:0,ky:0,hp:def.hp*m.hp,dmg:Math.round(def.dmg*m.dmg),r:def.r,spd:def.spd*rand(.92,1.08),flash:0,t:0,wob:rand(0,TAU),st:'chase',stT:rand(.4,1.2),cool:rand(1,2.5),dead:false,mats:def.mats,sq:0,popT:null,born:0};
  if(elite){e.elite=true;e.hp*=7;e.r*=1.55;e.dmg=Math.round(e.dmg*1.5);e.mats=20;e.crate=true;e.spd*=.9}
  if(type==='lootbug'){e.crate=true;e.life=11}
  if(type==='boss'){e.hp=def.hp;e.st='chase';e.stT=2.5;e.phaseIdx=0}
  if(type==='hopper'){e.st='idle';e.stT=rand(.3,.9)}
  e.maxHp=e.hp; return e;
}
function spawnPoint(minD){for(let i=0;i<30;i++){const x=rand(60,AW-60),y=rand(60,AH-60);if(d2(x,y,P.x,P.y)>minD*minD)return{x,y}}return{x:P.x<AW/2?AW-80:80,y:P.y<AH/2?AH-80:80}}
function queueSpawn(type,x,y,elite,delay=.9){spawns.push({type,x,y,elite,t:0,life:delay})}
function updateSpawning(dt){
  const def=WAVES[run.wave-1];
  run.spawnT-=dt;
  const alive=enemies.length+spawns.length;
  if(run.spawnT<=0){
    run.spawnT=def.int*rand(.8,1.2)*(alive>110?2:1);
    const c=spawnPoint(260); const n=randi(def.grp[0],def.grp[1]);
    for(let i=0;i<n;i++){const t=weighted(def.mix);queueSpawn(t,clamp(c.x+rand(-70,70),40,AW-40),clamp(c.y+rand(-70,70),40,AH-40),false,.9+i*.05)}
  }
  if(def.elite&&!run.eliteDone&&run.timer<def.dur*.55){run.eliteDone=true;const c=spawnPoint(300);queueSpawn('brute',c.x,c.y,true,1.4);showBanner('ELITE INCOMING','Drops a crate',.9,'#ffcc4d')}
  if(def.bug&&run.bugT>0){run.bugT-=dt;if(run.bugT<=0){const c=spawnPoint(250);queueSpawn('lootbug',c.x,c.y,false,.6)}}
  if(def.boss&&run.bossT>0){run.bossT-=dt;if(run.bossT<=0){queueSpawn('boss',AW/2,AH*.25,false,2);sfx('roar');shake=14;showBanner('THE BROOD QUEEN','Smash her to win',1.2,'#ff6b9d')}}
  for(let i=spawns.length-1;i>=0;i--){const s=spawns[i];s.t+=dt;if(s.t>=s.life){spawns.splice(i,1);const e=makeEnemy(s.type,s.x,s.y,s.elite);enemies.push(e);if(s.type==='boss')run.boss=e;parts.push({x:s.x,y:s.y,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#d8c8e0',s0:e.r*1.5,s1:e.r*3.2,rot:rand(0,TAU),a0:.5})}}
}
function updateEnemies(dt){
  const ending=state!=='wave';
  for(const e of enemies){
    if(e.dead)continue;
    e.t+=dt; e.born+=dt; e.flash-=dt; e.flashCd-=dt; e.sq=Math.max(0,e.sq-dt*6);
    if(e.popT!=null){e.popT-=dt;e.flash=.05;if(e.popT<=0)killEnemy(e,false);continue}
    const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;
    let mx=0,my=0;
    if(!ending)switch(e.type){
      case 'grub':case 'brute':case 'splitter':case 'mini':mx=nx*e.spd;my=ny*e.spd;break;
      case 'dasher':
        e.cool-=dt;
        if(e.st==='chase'){mx=nx*e.spd;my=ny*e.spd;if(d<300&&e.cool<=0){e.st='wind';e.stT=.55;e.da=Math.atan2(dy,dx)}}
        else if(e.st==='wind'){e.stT-=dt;e.da=angLerp(e.da,Math.atan2(dy,dx),dt*4);if(e.stT<=0){e.st='dash';e.stT=.42}}
        else if(e.st==='dash'){e.stT-=dt;mx=Math.cos(e.da)*560;my=Math.sin(e.da)*560;if(Math.random()<.5)parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.25,c:e.def.col,s:e.r*.6,fade:1});if(e.stT<=0){e.st='rest';e.stT=.5}}
        else{e.stT-=dt;if(e.stT<=0){e.st='chase';e.cool=rand(1.8,2.6)}}
        break;
      case 'spitter':{
        e.cool-=dt; const side=e.wob>Math.PI?1:-1;
        if(d>320){mx=nx*e.spd;my=ny*e.spd}else if(d<220){mx=-nx*e.spd;my=-ny*e.spd}else{mx=-ny*e.spd*.6*side;my=nx*e.spd*.6*side}
        if(e.cool<=0&&d<430){e.cool=rand(2.8,3.6);e.swell=.45}
        if(e.swell>0){e.swell-=dt;mx*=.2;my*=.2;if(e.swell<=0){sfx('click');const a=Math.atan2(dy,dx);ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*220,vy:Math.sin(a)*220,r:8,dmg:e.dmg,t:0,c:'#45d6e8'})}}
        break}
      case 'bomber':
        if(e.st==='chase'){mx=nx*e.spd;my=ny*e.spd;if(d<75){e.st='fuse';e.stT=.85}}
        else{e.stT-=dt;if(Math.random()<.3)sfx('fuse');if(e.stT<=0){e.dead=true;explode(e.x,e.y,95,30+run.wave*3,26,e.dmg);splat(e.x,e.y,e.r*1.4,e.def.dark)}}
        break;
      case 'hopper':
        if(e.st==='idle'){e.stT-=dt;if(e.stT<=0&&d<600){e.st='hop';e.stT=0;e.hT=.55;const L=Math.min(d,230);e.hx0=e.x;e.hy0=e.y;e.hx1=clamp(e.x+nx*L,e.r,AW-e.r);e.hy1=clamp(e.y+ny*L,e.r,AH-e.r);sfx('hop')}}
        else{e.stT+=dt;const p=Math.min(1,e.stT/e.hT);e.x=lerp(e.hx0,e.hx1,p);e.y=lerp(e.hy0,e.hy1,p);e.z=Math.sin(p*Math.PI)*60;if(p>=1){e.z=0;e.st='idle';e.stT=rand(.5,.9);e.sq=1;parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#bba8c4',s0:e.r,s1:e.r*2.6,rot:rand(0,TAU),a0:.45})}}
        break;
      case 'lootbug':{
        e.life-=dt; const fl=d<350?1:.4;
        mx=(-nx*fl+Math.cos(e.t*2+e.wob)*.6)*e.spd; my=(-ny*fl+Math.sin(e.t*2.3+e.wob)*.6)*e.spd;
        if(e.x<80)mx+=120;if(e.x>AW-80)mx-=120;if(e.y<80)my+=120;if(e.y>AH-80)my-=120;
        if(Math.random()<.15)parts.push({x:e.x+rand(-10,10),y:e.y+rand(-10,10),vx:0,vy:-20,t:0,life:.5,img:'fx_star',col:'#ffe58a',s0:10,s1:2,add:1});
        if(e.life<=0){e.dead=true;texts.push({x:e.x,y:e.y-20,vy:-40,t:0,life:1,s:18,txt:'escaped!',c:'#ffcc4d'});parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.4,img:'fx_puff',col:'#ffffff',s0:20,s1:60,a0:.7})}
        break}
      case 'boss':{const r=bossAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
    }
    e.kx*=Math.exp(-dt*9); e.ky*=Math.exp(-dt*9);
    if(e.type!=='hopper'||e.st==='idle'){e.x+=(mx+e.kx)*dt;e.y+=(my+e.ky)*dt}
    e.x=clamp(e.x,e.r,AW-e.r); e.y=clamp(e.y,e.r,AH-e.r);
    if(!ending&&e.dmg>0&&e.z<12&&d<e.r+P.r-4)hurtPlayer(e.dmg,e);
  }
  const n=enemies.length;
  for(let i=0;i<n;i++){const a=enemies[i];if(a.dead||a.z>5)continue;for(let j=i+1;j<n;j++){const b=enemies[j];if(b.dead||b.z>5)continue;const dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;const dd=dx*dx+dy*dy;if(dd<rr*rr&&dd>.01){const D=Math.sqrt(dd),o=(rr-D)*.5,ux=dx/D,uy=dy/D;const wa=a.def.heavy&&!b.def.heavy?.2:b.def.heavy&&!a.def.heavy?1.8:1;a.x-=ux*o*wa;a.y-=uy*o*wa;b.x+=ux*o*(2-wa);b.y+=uy*o*(2-wa)}}}
}
function bossAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0;
  const cycle=['radial','charge','summon','radial','charge','spiral'];
  switch(e.st){
    case 'chase': mx=nx*e.spd*(ph2?1.35:1);my=ny*e.spd*(ph2?1.35:1); if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];e.stT=e.st==='charge'?.8:e.st==='summon'?.9:2.4;e.vol=0;e.volT=0} break;
    case 'radial': e.volT-=dt; if(e.volT<=0){e.volT=ph2?.38:.5;const k=ph2?20:14;const off=e.vol*.2;for(let i=0;i<k;i++){const a=off+i/k*TAU;ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*190,vy:Math.sin(a)*190,r:9,dmg:6,t:0,c:'#ff6b9d'})}e.vol++;e.sq=1;shake=Math.max(shake,3)} if(e.stT<=0){e.st='chase';e.stT=ph2?1.4:2} break;
    case 'spiral': e.volT-=dt; if(e.volT<=0){e.volT=.07;e.vol++;const k=ph2?3:2;for(let s=0;s<k;s++){const a=e.vol*.31+s*TAU/k;ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*170,vy:Math.sin(a)*170,r:8,dmg:6,t:0,c:'#ffb3d1'})}} if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'charge': if(!e.cd0){e.cd0=1;e.da=Math.atan2(ny,nx)} if(e.stT>0){e.da=angLerp(e.da,Math.atan2(ny,nx),dt*3);e.shk=1}else{e.shk=0;const sp=ph2?720:620;mx=Math.cos(e.da)*sp;my=Math.sin(e.da)*sp;if(Math.random()<.6)parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,c:e.def.col,s:e.r*.5,fade:1});if(e.stT<-.65||e.x<=e.r+2||e.x>=AW-e.r-2||e.y<=e.r+2||e.y>=AH-e.r-2){if(e.stT<-.1){shake=12;sfx('boom');fx.push({k:'ring',x:e.x,y:e.y,r0:30,r1:160,t:0,life:.35,c:'#ff6b9d',w:6})}e.st='chase';e.stT=ph2?1.2:1.8;e.cd0=0}} break;
    case 'summon': if(e.stT<=0){const k=ph2?7:5;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(pick(['grub','grub','dasher','bomber']),clamp(e.x+Math.cos(a)*110,40,AW-40),clamp(e.y+Math.sin(a)*110,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}

/* ================= wave flow ================= */
function showBanner(txt,sub,life=1.6,col='#ffffff'){banner={txt,sub,t:0,life,col}}
function startWave(n){
  run.wave=n; const def=WAVES[n-1];
  run.timer=def.dur; run.spawnT=.5; run.eliteDone=false; run.bugT=def.bug?rand(def.dur*.25,def.dur*.6):-1; run.bossT=def.boss?1.5:-1; run.boss=null;
  run.combo=0; run.comboT=0; run.rerolls=0;
  enemies=[];bullets=[];ebullets=[];gems=[];pickups=[];parts=[];texts=[];fx=[];spawns=[];booms=[];
  dctx.clearRect(0,0,AW,AH);
  P.x=AW/2;P.y=AH/2;P.vx=P.vy=0;P.hp=maxHp();P.iframes=1;run.hpTrail=P.hp;
  run.weapons.forEach(w=>{w.cd=rand(.2,.6);w.thrust=null;w.ext=0;w.spin=0});
  state='wave'; showUI(null);
  showBanner('WAVE '+n,def.boss?'Final wave':n===1?'Survive '+def.dur+' seconds':'',1.6,'#ffffff'); sfx('wave');
}
function endWave(){
  state='waveEnd'; run.endT=0;
  for(const e of enemies)if(!e.dead)e.popT=rand(.05,.75);
  for(const b of ebullets)parts.push({x:b.x,y:b.y,vx:0,vy:0,t:0,life:.25,c:b.c,s:b.r,fade:1});
  ebullets=[];spawns=[];bullets=[];booms=[];
  for(const g of gems)g.vac=true;
  showBanner('WAVE CLEARED','',1.4,'#7bd35a'); sfx('clear');
}
function afterWave(){
  if(S.harvest>0){run.mats+=Math.round(S.harvest);run.totalMats+=Math.round(S.harvest);S.harvest=Math.round(S.harvest*1.05*10)/10}
  const best=store.get('bd_best',0); if(run.wave>best)store.set('bd_best',run.wave);
  nextStep();
}
function nextStep(){if(run.pendingLv>0)showLevelUp();else if(run.crates>0)showCrate();else openShop()}
function die(){state='dying';run.endT=0;timeScale=.3;sfx('boom');for(let i=0;i<40;i++){const a=rand(0,TAU),s=rand(100,500);parts.push({x:P.x,y:P.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.5,1.2),c:pick(['#e0336f','#9c1d4f','#7bd35a']),s:rand(3,8),g:200,drag:2})}parts.push({x:P.x,y:P.y,vx:0,vy:0,t:0,life:.8,img:'fx_puff',col:'#e9d8ef',s0:30,s1:110,a0:.7})}
function bossDown(e){
  state='winning';run.endT=0;timeScale=.25;shake=20;freezeT=.15;
  for(const o of enemies)if(!o.dead&&o!==e)o.popT=rand(.1,.8);
  ebullets=[];spawns=[];
  for(let k=0;k<6;k++)booms.push({x:e.x+rand(-70,70),y:e.y+rand(-70,70),t:k*.12+.05,r:90,dmg:0,safe:true});
  showBanner('BROOD SMASHED','',2.5,'#ffcc4d');
}

/* ================= update ================= */
function getMove(){
  let x=0,y=0;
  if(keys.KeyA||keys.ArrowLeft)x-=1; if(keys.KeyD||keys.ArrowRight)x+=1; if(keys.KeyW||keys.ArrowUp)y-=1; if(keys.KeyS||keys.ArrowDown)y+=1;
  if(joy.active){x+=joy.x;y+=joy.y}
  const l=Math.hypot(x,y); if(l>1){x/=l;y/=l} return{x,y};
}
function update(dt){
  run.time+=dt; run.lsCd-=dt; run.matBump=Math.max(0,run.matBump-dt*5);
  if(state!=='dying'){
    const mv=getMove(); const spd=230*(1+clamp(S.speed,-60,150)/100);
    const k=1-Math.exp(-dt*16); P.vx=lerp(P.vx,mv.x*spd,k); P.vy=lerp(P.vy,mv.y*spd,k);
    P.x=clamp(P.x+P.vx*dt,P.r,AW-P.r); P.y=clamp(P.y+P.vy*dt,P.r,AH-P.r);
    P.moving=Math.hypot(mv.x,mv.y)>.1; if(P.moving){P.walk+=dt;P.lx=mv.x;P.ly=mv.y}
    if(P.moving&&Math.random()<dt*10)parts.push({x:P.x+rand(-6,6),y:P.y+P.r,vx:-P.vx*.1,vy:rand(-20,-5),t:0,life:.4,img:'fx_puff',col:'#c8b4cc',s0:6,s1:16,rot:rand(0,TAU),a0:.35});
  }
  P.iframes-=dt; P.blink-=dt; if(P.blink<-.12)P.blink=rand(2,4.5);
  if(state==='wave'&&S.regen>0){P.regenAcc+=dt*S.regen*.12;while(P.regenAcc>=1){P.regenAcc-=1;heal(1)}}
  run.hpTrail=P.hp<run.hpTrail?lerp(run.hpTrail,P.hp,1-Math.exp(-dt*4)):P.hp;
  if(state==='wave'){
    if(!WAVES[run.wave-1].boss){run.timer-=dt;if(run.timer<=0){run.timer=0;endWave()}}else run.timer+=dt;
    updateSpawning(dt);
    if(run.char.aura){run.auraT-=dt;if(run.auraT<=0){run.auraT=.5;const ad=Math.round(2+run.wave*.5+S.melee*.5);for(const e of enemies){if(e.dead||e.popT!=null)continue;if(Math.hypot(e.x-P.x,e.y-P.y)<80+e.r)hurtEnemy(e,ad,false,Math.atan2(e.y-P.y,e.x-P.x),3)}}}
  }
  if(state==='wave'||state==='winning')updateWeapons(dt);
  for(let i=booms.length-1;i>=0;i--){const b=booms[i];b.t-=dt;if(b.t<=0){booms.splice(i,1);explode(b.x,b.y,b.r,b.dmg,18,b.safe?0:0)}}
  // bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(b.lob){b.t+=dt;const p=Math.min(1,b.t/b.T);b.x=lerp(b.sx,b.tx,p);b.y=lerp(b.sy,b.ty,p);b.z=Math.sin(p*Math.PI)*90;b.rot+=dt*12;if(p>=1){bullets.splice(i,1);explode(b.tx,b.ty,b.def.blast,b.dmg,b.def.knock)}continue}
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.trav+=b.spd*dt;
    let gone=b.trav>b.range||b.x<-20||b.x>AW+20||b.y<-20||b.y>AH+20;
    if(!gone)for(const e of enemies){
      if(e.dead||e.popT!=null||b.hit.has(e)||e.z>20)continue;
      const rr=e.r+b.r; if(d2(b.x,b.y,e.x,e.y)<rr*rr){
        if(b.rocket){explode(b.x,b.y,b.def.blast,b.dmg,b.def.knock);gone=true;break}
        b.hit.add(e); dealHit(e,b.dmg,b.def,b.a,b.def.knock);
        if(b.bounce>0){const nx=nearestEnemy(b.x,b.y,260,b.hit);if(nx){b.bounce--;const a=Math.atan2(nx.y-b.y,nx.x-b.x);b.vx=Math.cos(a)*b.spd;b.vy=Math.sin(a)*b.spd;b.a=a;b.trav=Math.max(0,b.range-300);sfx('bounce');parts.push({x:b.x,y:b.y,vx:0,vy:0,t:0,life:.15,img:'fx_glow',col:'#ffe066',s0:12,s1:36,add:1});break}}
        if(--b.pierce<0){gone=true;break}
      }
    }
    if(gone){if(b.rocket&&b.trav>b.range)explode(b.x,b.y,b.def.blast,b.dmg,b.def.knock);bullets.splice(i,1)}
    else if(b.rocket&&Math.random()<.7)parts.push({x:b.x,y:b.y,vx:rand(-20,20),vy:rand(-20,20),t:0,life:.4,img:'fx_puff',col:'#9a8a9a',s0:6,s1:18,rot:rand(0,TAU),a0:.5});
  }
  updateEnemies(dt);
  for(let i=ebullets.length-1;i>=0;i--){const b=ebullets[i];b.t+=dt;b.x+=b.vx*dt;b.y+=b.vy*dt;
    if(b.t>7||b.x<-30||b.x>AW+30||b.y<-30||b.y>AH+30){ebullets.splice(i,1);continue}
    if(state==='wave'&&d2(b.x,b.y,P.x,P.y)<(b.r+P.r-5)*(b.r+P.r-5)&&P.iframes<=0){hurtPlayer(b.dmg,null);ebullets.splice(i,1)}}
  const pr=85*(1+S.pickup/100);
  for(let i=gems.length-1;i>=0;i--){
    const g=gems[i]; g.t+=dt; g.spin+=dt*4;
    const dx=P.x-g.x,dy=P.y-g.y,d=Math.hypot(dx,dy)||1;
    if(!g.mag&&(g.vac||(d<pr&&g.t>.2))){g.mag=true;g.sp=g.vac?250:120}
    if(g.mag){g.sp=Math.min(1600,g.sp+dt*(g.vac?3000:2200));g.x+=dx/d*g.sp*dt;g.y+=dy/d*g.sp*dt}
    else{g.vx*=Math.exp(-dt*6);g.vy*=Math.exp(-dt*6);g.x=clamp(g.x+g.vx*dt,6,AW-6);g.y=clamp(g.y+g.vy*dt,6,AH-6)}
    if(d<P.r+8&&g.t>.08){gems.splice(i,1);collectGem(g)}
  }
  for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.t+=dt;p.vx*=Math.exp(-dt*5);p.vy*=Math.exp(-dt*5);p.x=clamp(p.x+p.vx*dt,10,AW-10);p.y=clamp(p.y+p.vy*dt,10,AH-10);
    const d=Math.hypot(P.x-p.x,P.y-p.y)||1;
    if(d<(state==='waveEnd'?2000:60)&&p.t>.3){const s=state==='waveEnd'?900:300;p.x+=(P.x-p.x)/d*s*dt;p.y+=(P.y-p.y)/d*s*dt}
    if(d<P.r+14&&p.t>.3){pickups.splice(i,1);
      if(p.k==='fruit'){heal(3+Math.round(maxHp()*.08));sfx('heal');for(let k=0;k<4;k++)parts.push({x:P.x+rand(-14,14),y:P.y-10,vx:rand(-20,20),vy:rand(-90,-50),t:0,life:.7,img:'fx_heart',col:'#7bd35a',s0:14,s1:8,add:1})}
      else{run.crates++;sfx('crate');texts.push({x:P.x,y:P.y-44,vy:-60,t:0,life:1,s:22,txt:'+CRATE',c:'#ffcc4d'});fx.push({k:'ring',x:P.x,y:P.y,r0:10,r1:90,t:0,life:.4,c:'#ffcc4d',w:5})}}}
  if(run.comboT>0){run.comboT-=dt;if(run.comboT<=0)run.combo=0}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;if(p.t>=p.life){parts.splice(i,1);continue}if(p.drag){p.vx*=Math.exp(-dt*p.drag);p.vy*=Math.exp(-dt*p.drag)}if(p.g)p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.vr)p.rot+=p.vr*dt}
  if(parts.length>700)parts.splice(0,parts.length-700);
  for(let i=texts.length-1;i>=0;i--){const t=texts[i];t.t+=dt;t.y+=t.vy*dt;t.vy*=Math.exp(-dt*4);if(t.t>=t.life)texts.splice(i,1)}
  if(texts.length>80)texts.splice(0,texts.length-80);
  for(let i=fx.length-1;i>=0;i--){fx[i].t+=dt;if(fx[i].t>=fx[i].life)fx.splice(i,1)}
  enemies=enemies.filter(e=>!e.dead);
  if(state==='waveEnd'){run.endT+=dt;if(run.endT>1.4&&enemies.length===0&&gems.length===0&&pickups.length===0){state='between';afterWave()}}
}
function collectGem(g){
  run.mats+=g.val; run.totalMats+=g.val; run.matBump=1;
  run.gemChain=run.time-run.lastGem<.35?run.gemChain+1:0; run.lastGem=run.time;
  sfx('gem',run.gemChain); addXp(g.val);
}
function addXp(v){
  P.xp+=v;
  while(P.xp>=xpNeed(P.level)){
    P.xp-=xpNeed(P.level); P.level++; run.pendingLv++; S.maxHp+=1; P.hp+=1;
    texts.push({x:P.x,y:P.y-58,vy:-50,t:0,life:1.2,s:26,txt:'LEVEL UP!',c:'#ffcc4d'});
    fx.push({k:'ring',x:P.x,y:P.y,r0:10,r1:130,t:0,life:.5,c:'#ffcc4d',w:6});
    parts.push({x:P.x,y:P.y,vx:0,vy:0,t:0,life:.6,img:'fx_magic',col:'#ffd24d',s0:40,s1:150,add:1,rot:0,vr:2});
    for(let i=0;i<14;i++){const a=i/14*TAU;parts.push({x:P.x,y:P.y,vx:Math.cos(a)*260,vy:Math.sin(a)*260,t:0,life:.5,img:'fx_star',col:'#ffcc4d',s0:16,s1:4,drag:4,add:1})}
    sfx('levelup');
  }
}

/* ================= drawing ================= */
function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath()}

/* veg hero: 3D-rendered sprite + live eyes/feet */
function drawVeg(c,ch,x,y,r,o){
  const im=IMG['veg_'+ch.id]; if(!im||!im.width)return;
  const t=o.t||0, bob=o.moving?Math.sin((o.walk||0)*16):0;
  const Hs=r*ch.k, Ws=Hs*im.width/im.height;
  c.save(); c.translate(x,y+r*.95);
  c.fillStyle='rgba(0,0,0,.28)'; c.beginPath(); c.ellipse(0,0,r*1.05,r*.33,0,0,TAU); c.fill();
  c.fillStyle='#2a1420';
  const f1=o.moving?bob*4:0;
  c.beginPath();c.ellipse(-r*.42,-r*.08-Math.max(0,f1),r*.26,r*.16,0,0,TAU);c.fill();
  c.beginPath();c.ellipse(r*.42,-r*.08-Math.max(0,-f1),r*.26,r*.16,0,0,TAU);c.fill();
  const sq=o.moving?Math.abs(bob)*.06:Math.sin(t*3)*.02; const hs=o.hit?.1:0;
  c.translate(0,-Math.abs(bob)*3-r*.12);
  c.scale((1+sq*.7+hs)*(o.lx<-.2?-1:1),1-sq-hs*.6);
  if(o.flash)c.globalAlpha=.45+.55*(Math.sin(t*60)>0?1:0);
  c.drawImage(im,-Ws/2,-Hs,Ws,Hs);
  if(o.hit){c.globalAlpha=.85;c.drawImage(tinted('veg_'+ch.id,'#ffffff'),-Ws/2,-Hs,Ws,Hs);c.globalAlpha=1}
  // face
  const fy=-Hs*(1-ch.fy), es=Hs*ch.es, er=Hs*ch.ez;
  const lx=(o.lx||0)*er*.35*(o.lx<-.2?-1:1), ly=(o.ly||0)*er*.3;
  const blink=o.blink!=null&&o.blink<0;
  for(const s of [-1,1]){
    if(blink){c.strokeStyle='#1a0a12';c.lineWidth=Math.max(1.5,er*.35);c.beginPath();c.moveTo(s*es-er*.8,fy);c.lineTo(s*es+er*.8,fy);c.stroke();continue}
    c.fillStyle='#fff'; c.strokeStyle='#1a0a12'; c.lineWidth=Math.max(1.2,er*.22);
    c.beginPath(); c.ellipse(s*es,fy,er,er*1.2,0,0,TAU); c.fill(); c.stroke();
    c.fillStyle='#1a0a12'; c.beginPath(); c.arc(s*es+lx,fy+ly+er*.1,er*.55,0,TAU); c.fill();
    c.fillStyle='#fff'; c.beginPath(); c.arc(s*es+lx+er*.2,fy+ly-er*.15,er*.2,0,TAU); c.fill();
  }
  c.strokeStyle='#1a0a12'; c.lineWidth=Math.max(1.5,er*.3); c.beginPath();
  if(o.hit){c.fillStyle='#4a0b26';c.ellipse(0,fy+er*2.1,er*.5,er*.6,0,0,TAU);c.fill()}else{c.arc(0,fy+er*1.5,er*.7,.3,Math.PI-.3);c.stroke()}
  c.restore();
}

function drawWeaponSprite(c,id,tier,len){
  const im=IMG['w_'+id]; if(!im||!im.width)return; const def=WEAPONS[id];
  const w=len, h=w*im.height/im.width;
  if(tier>0){c.save();c.globalAlpha=.5+.1*tier;c.globalCompositeOperation='lighter';const g=tinted('fx_glow',RAR[tier].c);c.drawImage(g,-w*def.pv-6,-h*.9,w+12,h*1.8);c.restore()}
  c.drawImage(im,-w*def.pv,-h*.5,w,h);
}
function weaponIcon(id,tier){const cv=document.createElement('canvas');cv.width=128;cv.height=80;const c=cv.getContext('2d');const def=WEAPONS[id];c.translate(64-(.5-def.pv)*100,42);c.rotate(-.2);drawWeaponSprite(c,id,tier,100);return cv}

function drawEnemy(c,e,t){
  const im=IMG['e_'+e.type]; const meta=A['e_'+e.type]; if(!im||!meta)return;
  let x=e.x,y=e.y;
  if(e.st==='wind'||e.shk||e.st==='fuse'){x+=rand(-2.5,2.5);y+=rand(-2.5,2.5)}
  const shR=e.r*(1-Math.min(.5,e.z/150));
  c.fillStyle='rgba(0,0,0,.28)';c.beginPath();c.ellipse(e.x,e.y+e.r*.85,shR*.95,shR*.3,0,0,TAU);c.fill();
  y-=e.z;
  const s=e.r*1.12/meta.br*(e.def.vs||1)*(e.born<.25?.4+e.born*2.4:1);
  const wob=Math.sin(t*7+e.wob), sq=e.sq*.18;
  let sw=e.swell>0?1+(.45-e.swell)*.7:1; if(e.st==='fuse')sw=1+(.85-e.stT)*.45;
  c.save(); c.translate(x,y+e.r*.9);
  c.scale((1+wob*.05+sq)*sw*(P.x<e.x?-1:1),(1-wob*.05-sq*.7)*sw);
  c.translate(0,-e.r*.9);
  const dw=meta.w*s, dh=meta.h*s, ox=-meta.cx*s, oy=-meta.cy*s;
  if(e.elite){c.globalCompositeOperation='lighter';c.globalAlpha=.55+.35*Math.sin(t*6);const g=tinted('fx_glow','#ffcc4d');c.drawImage(g,-e.r*2,-e.r*2,e.r*4,e.r*4);c.globalAlpha=1;c.globalCompositeOperation='source-over'}
  c.drawImage(im,ox,oy,dw,dh);
  let tint=null,ta=0;
  if(e.flash>0){tint='#ffffff';ta=.9}
  else if((e.st==='wind'||e.st==='fuse')&&Math.sin(t*40)>0){tint='#ff2a2a';ta=.6}
  else if(e.type==='boss'&&e.hp<e.maxHp*.5){tint='#ff0040';ta=.18+.12*Math.sin(t*8)}
  if(tint){c.globalAlpha=ta;c.drawImage(tinted('e_'+e.type,tint),ox,oy,dw,dh);c.globalAlpha=1}
  c.restore();
}
function drawP(c,p){
  const k=1-p.t/p.life;
  if(p.img){
    const im=tinted(p.img,p.col); const s=lerp(p.s1,p.s0,k); const a=(p.a0||1)*(p.add?k:Math.min(1,k*1.6));
    c.globalAlpha=a; c.save(); c.translate(p.x,p.y); if(p.rot)c.rotate(p.rot); c.drawImage(im,-s/2,-s/2*im.height/im.width,s,s*im.height/im.width); c.restore(); return;
  }
  c.globalAlpha=p.fade?k*.6:Math.min(1,k*2); c.fillStyle=p.c; const s=p.fade?p.s:p.s*(.4+.6*k);
  c.beginPath(); c.arc(p.x,p.y,s,0,TAU); c.fill();
}

function render(){
  const t=performance.now()/1000;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.fillStyle='#0e0812'; ctx.fillRect(0,0,W,H);
  if(!run)return;
  const vw=W/SC, vh=H/SC;
  let tx=P.x, ty=P.y;
  tx=vw>=AW+120?AW/2:clamp(tx,vw/2-60,AW-vw/2+60);
  ty=vh>=AH+120?AH/2:clamp(ty,vh/2-60,AH-vh/2+60);
  cam.x=lerp(cam.x,tx,.14); cam.y=lerp(cam.y,ty,.14);
  const sx=shake>0?rand(-shake,shake):0, sy=shake>0?rand(-shake,shake):0;
  ctx.translate(W/2+sx,H/2+sy); ctx.scale(SC,SC); ctx.translate(-cam.x,-cam.y);
  const vx0=cam.x-vw/2-60,vx1=cam.x+vw/2+60,vy0=cam.y-vh/2-60,vy1=cam.y+vh/2+60;
  const vis=(x,y,r)=>x+r>vx0&&x-r<vx1&&y+r>vy0&&y-r<vy1;
  ctx.fillStyle='#120a16'; ctx.fillRect(-600,-600,AW+1200,AH+1200);
  ctx.save();ctx.strokeStyle='rgba(224,51,111,.06)';ctx.lineWidth=14;for(let k=-AH-600;k<AW+600;k+=60){ctx.beginPath();ctx.moveTo(k,-600);ctx.lineTo(k+AH+1200,AH+600);ctx.stroke()}ctx.restore();
  ctx.drawImage(floor,0,0); ctx.drawImage(decal,0,0);
  ctx.strokeStyle='#5c3a5e'; ctx.lineWidth=10; ctx.strokeRect(-5,-5,AW+10,AH+10);
  ctx.strokeStyle='rgba(224,51,111,.35)'; ctx.lineWidth=2; ctx.strokeRect(-11,-11,AW+22,AH+22);
  // spawn telegraphs
  for(const s of spawns){const p=s.t/s.life;const R=(s.type==='boss'?50:s.elite?24:13)*(1+Math.sin(t*20)*.08);ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=.4+.6*p;ctx.strokeStyle=s.elite||s.type==='boss'?'#ffcc4d':'#ff3b5c';ctx.lineWidth=s.type==='boss'?8:4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-R,-R);ctx.lineTo(R,R);ctx.moveTo(R,-R);ctx.lineTo(-R,R);ctx.stroke();ctx.globalAlpha=.25*p;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(0,0,R*1.4*p,0,TAU);ctx.fill();ctx.restore()}
  // onion aura
  if(run.char.aura&&(state==='wave'||state==='waveEnd')){const g=tinted('fx_ring','#9be36a');const R=80+Math.sin(t*4)*4;ctx.save();ctx.translate(P.x,P.y);ctx.rotate(t*.6);ctx.globalAlpha=.35;ctx.drawImage(g,-R,-R,R*2,R*2);ctx.globalAlpha=.08;ctx.fillStyle='#9be36a';ctx.beginPath();ctx.arc(0,0,R*.92,0,TAU);ctx.fill();ctx.restore();ctx.globalAlpha=1}
  // gems
  const glowG=tinted('fx_glow','#5ef2b0');
  for(const g of gems){if(!vis(g.x,g.y,10))continue;const s=g.val>1?8:5.5;ctx.globalAlpha=.55;ctx.drawImage(glowG,g.x-s*2.6,g.y-s*2.6,s*5.2,s*5.2);ctx.globalAlpha=1;ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.spin);ctx.fillStyle=g.val>1?'#c8ffe6':'#5ef2b0';ctx.strokeStyle='#1d7a55';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.8,0);ctx.lineTo(0,s);ctx.lineTo(-s*.8,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
  // pickups
  for(const p of pickups){const b=Math.sin(t*5+p.x)*3;const im=IMG[p.k==='fruit'?'p_apple':'p_crate'];const s=p.k==='fruit'?22:40;
    if(p.k==='crate'){ctx.globalAlpha=.4+.2*Math.sin(t*6);ctx.drawImage(tinted('fx_glow','#ffcc4d'),p.x-40,p.y-40,80,80);ctx.globalAlpha=1}
    ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(p.x,p.y+s*.45,s*.45,s*.15,0,0,TAU);ctx.fill();
    if(im&&im.width)ctx.drawImage(im,p.x-s/2,p.y-s/2+b-4,s,s*im.height/im.width)}
  // enemies (y-sorted with player)
  const drawList=[];
  for(const e of enemies)if(vis(e.x,e.y,e.r*2))drawList.push(e);
  const showP=state!=='dying'&&state!=='over';
  if(showP)drawList.push(P);
  drawList.sort((a,b)=>a.y-b.y);
  for(const e of drawList){if(e===P)drawPlayer(t);else drawEnemy(ctx,e,t)}
  // bullets
  ctx.lineCap='round';
  const fireImg=tinted('fx_fire','#ff9a3c');
  for(const b of bullets){
    if(b.lob){ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(b.x,b.y+4,8,3,0,0,TAU);ctx.fill();const im=IMG.p_grenade;ctx.save();ctx.translate(b.x,b.y-b.z);ctx.rotate(b.rot);if(im&&im.width)ctx.drawImage(im,-9,-11,18,22);ctx.restore();continue}
    if(b.flame){const p=b.trav/b.range;const s=lerp(14,46,p);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.max(0,1-p)*.8;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot+p*3);ctx.drawImage(fireImg,-s/2,-s/2,s,s);ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';continue}
    if(b.rocket){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);ctx.fillStyle='#e63946';ctx.strokeStyle='#120a14';ctx.lineWidth=2;rr(ctx,-9,-4,16,8,3);ctx.fill();ctx.stroke();ctx.fillStyle='#ffcc4d';ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(-16-Math.random()*6,0);ctx.lineTo(-9,3);ctx.fill();ctx.restore();continue}
    const L=Math.min(b.trav,b.spd>1500?60:26);const col=b.bounce?'rgba(255,224,102,.6)':'rgba(255,230,140,.5)';ctx.strokeStyle=col;ctx.lineWidth=b.r*1.6;ctx.beginPath();ctx.moveTo(b.x-b.vx/b.spd*L,b.y-b.vy/b.spd*L);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.fillStyle=b.bounce?'#ffe066':'#fff7d1';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();
  }
  for(const b of ebullets){const pu=1+Math.sin(t*15+b.t*10)*.12;ctx.globalAlpha=.5;ctx.drawImage(tinted('fx_glow',b.c),b.x-b.r*2.6*pu,b.y-b.r*2.6*pu,b.r*5.2*pu,b.r*5.2*pu);ctx.globalAlpha=1;ctx.fillStyle=b.c;ctx.beginPath();ctx.arc(b.x,b.y,b.r*pu,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x-b.r*.25,b.y-b.r*.25,b.r*.4,0,TAU);ctx.fill()}
  // fx
  for(const f of fx){const p=f.t/f.life;
    if(f.k==='ring'){ctx.strokeStyle=f.c;ctx.globalAlpha=1-p;ctx.lineWidth=f.w*(1-p)+1;ctx.beginPath();ctx.arc(f.x,f.y,lerp(f.r0,f.r1,1-Math.pow(1-p,3)),0,TAU);ctx.stroke();ctx.globalAlpha=1}
    else if(f.k==='zap'){ctx.globalAlpha=1-p;ctx.strokeStyle='#6fe3ff';ctx.lineWidth=7;ctx.beginPath();f.pts.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=2.5;ctx.stroke();ctx.globalCompositeOperation='lighter';const g=tinted('fx_glow','#6fe3ff');for(const q of f.nodes)ctx.drawImage(g,q.x-26,q.y-26,52,52);ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1}
    else if(f.k==='muzzle'){const im=tinted('fx_muzzle','#fff0a8');const h=34*f.s,w=h*im.width/im.height;ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a+Math.PI/2);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-p;ctx.drawImage(im,-w/2,-h*.92,w,h);ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'}
    else if(f.k==='slash'){const im=tinted('fx_slash','#ffffff');const h=f.s,w=h*im.width/im.height;ctx.save();ctx.translate(f.x,f.y);ctx.rotate(f.a);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=(1-p)*.9;ctx.scale(1+p*.3,1+p*.3);ctx.drawImage(im,-w/2,-h/2,w,h);ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over'}
  }
  // particles (normal then additive)
  for(const p of parts){if(p.add||!vis(p.x,p.y,40))continue;drawP(ctx,p)}
  ctx.globalCompositeOperation='lighter';
  for(const p of parts){if(!p.add||!vis(p.x,p.y,80))continue;drawP(ctx,p)}
  ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1;
  // texts
  ctx.textAlign='center';ctx.textBaseline='middle';
  for(const q of texts){const p=q.t/q.life;const pop=p<.15?1+(1-p/.15)*.6:1;ctx.globalAlpha=p>.7?(1-p)/.3:1;ctx.font=`${Math.round(q.s*pop)}px ${FD}`;ctx.lineWidth=4;ctx.strokeStyle='rgba(20,6,16,.85)';ctx.strokeText(q.txt,q.x,q.y);ctx.fillStyle=q.c;ctx.fillText(q.txt,q.x,q.y)}
  ctx.globalAlpha=1;
  ctx.setTransform(DPR,0,0,DPR,0,0);
  if(hurtFlash>0){const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.max(W,H)*.75);g.addColorStop(0,'rgba(255,0,40,0)');g.addColorStop(1,`rgba(255,0,40,${.45*hurtFlash})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
  if(state==='wave'&&P.hp/maxHp()<.3){const a=.18+.12*Math.sin(t*6);const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.35,W/2,H/2,Math.max(W,H)*.75);g.addColorStop(0,'rgba(255,0,40,0)');g.addColorStop(1,`rgba(255,0,40,${a})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H)}
  if(['wave','waveEnd','dying','winning','paused','between'].includes(state))drawHUD(t);
  if(joy.active){ctx.globalAlpha=.35;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(joy.ox,joy.oy,58,0,TAU);ctx.fill();ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(joy.ox+joy.x*58,joy.oy+joy.y*58,26,0,TAU);ctx.fill();ctx.globalAlpha=1}
}
function drawPlayer(t){
  const n=run.weapons.length; const behind=[],front=[];
  run.weapons.forEach(w=>{if(w.sx==null){const sp=slotPos(run.weapons.indexOf(w),n);w.sx=sp.x;w.sy=sp.y}(w.sy<P.y-2?behind:front).push(w)});
  const drawW=w=>{
    const def=WEAPONS[w.id]; ctx.save();
    let ox=w.sx,oy=w.sy,a=w.aim;
    if(w.thrust){
      if(def.sweep){a=w.thrust.cur;const R=wRange(def)*.35*w.ext;ox+=Math.cos(a)*R;oy+=Math.sin(a)*R}
      else{a=w.thrust.a;ox+=Math.cos(a)*w.thrust.d*w.ext;oy+=Math.sin(a)*w.thrust.d*w.ext;
        ctx.save();ctx.globalAlpha=.25*w.ext;ctx.strokeStyle='#ffffff';ctx.lineCap='round';ctx.lineWidth=def.line?8:16;ctx.beginPath();ctx.moveTo(w.sx,w.sy);ctx.lineTo(ox,oy);ctx.stroke();ctx.restore()}
    }else{ox-=Math.cos(a)*w.recoil*5;oy-=Math.sin(a)*w.recoil*5}
    ctx.translate(ox,oy);ctx.rotate(a);if(Math.cos(a)<0)ctx.scale(1,-1);
    drawWeaponSprite(ctx,w.id,w.tier,def.len);
    if(def.spin&&w.spin>.3){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=w.spin*.5;ctx.drawImage(tinted('fx_glow','#ff9a3c'),def.len*(1-def.pv)-14,-14,28,28)}
    if(w.flash>0){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=w.flash;ctx.drawImage(tinted('fx_glow',RAR[w.tier].c),-30,-30,60,60)}
    ctx.restore()};
  behind.forEach(drawW);
  drawVeg(ctx,run.char,P.x,P.y,P.r,{t,moving:P.moving,walk:P.walk,lx:P.lx,ly:P.ly,blink:P.blink,hit:P.iframes>.6&&state==='wave',flash:P.iframes>0&&P.iframes<=.6&&state==='wave'});
  front.forEach(drawW);
}

function drawHUD(t){
  const x0=16+SAFE.l, y0=14+SAFE.t;
  const bw=Math.min(240,W*.42);
  const m=maxHp();
  ctx.fillStyle='rgba(14,8,18,.75)';rr(ctx,x0-3,y0-3,bw+6,30,9);ctx.fill();
  ctx.fillStyle='#3a1424';rr(ctx,x0,y0,bw,24,7);ctx.fill();
  ctx.fillStyle='#ffffff';rr(ctx,x0,y0,Math.max(0,bw*clamp(run.hpTrail/m,0,1)),24,7);ctx.fill();
  const hg=ctx.createLinearGradient(0,y0,0,y0+24);hg.addColorStop(0,'#ff5d7a');hg.addColorStop(1,'#c0183f');ctx.fillStyle=hg;
  if(P.hp>0){rr(ctx,x0,y0,Math.max(14,bw*clamp(P.hp/m,0,1)),24,7);ctx.fill()}
  ctx.font=`17px ${FD}`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=3;ctx.strokeStyle='rgba(20,6,16,.8)';
  const hpT=Math.ceil(P.hp)+' / '+m;ctx.strokeText(hpT,x0+bw/2,y0+13);ctx.fillStyle='#fff';ctx.fillText(hpT,x0+bw/2,y0+13);
  const y1=y0+32;ctx.fillStyle='rgba(14,8,18,.75)';rr(ctx,x0-3,y1-3,bw+6,18,7);ctx.fill();
  ctx.fillStyle='#1d3320';rr(ctx,x0,y1,bw,12,5);ctx.fill();
  ctx.fillStyle='#7bd35a';const xp=clamp(P.xp/xpNeed(P.level),0,1);if(xp>0){rr(ctx,x0,y1,Math.max(10,bw*xp),12,5);ctx.fill()}
  ctx.font=`13px ${FD}`;ctx.textAlign='left';ctx.strokeText('LV '+P.level,x0+bw+10,y1+6);ctx.fillStyle='#d6ffbf';ctx.fillText('LV '+P.level,x0+bw+10,y1+6);
  const y2=y1+30;const sc=1+run.matBump*.25;
  ctx.save();ctx.translate(x0+10,y2+2);ctx.scale(sc,sc);ctx.rotate(Math.PI/4);ctx.fillStyle='#5ef2b0';ctx.shadowColor='#5ef2b0';ctx.shadowBlur=10;ctx.fillRect(-6,-6,12,12);ctx.restore();
  ctx.font=`${Math.round(22*sc)}px ${FD}`;ctx.textAlign='left';ctx.strokeText(run.mats,x0+26,y2+3);ctx.fillStyle='#fff';ctx.fillText(run.mats,x0+26,y2+3);
  if(run.crates>0){const im=IMG.p_crate;const cx=x0+26+ctx.measureText(String(run.mats)).width+14;if(im&&im.width)ctx.drawImage(im,cx,y2-10,24,24*im.height/im.width);ctx.font=`15px ${FD}`;ctx.fillStyle='#ffcc4d';ctx.lineWidth=3;ctx.strokeStyle='rgba(20,6,16,.8)';ctx.strokeText('x'+run.crates,cx+30,y2+2);ctx.fillText('x'+run.crates,cx+30,y2+2)}
  const cx=W/2; const boss=WAVES[run.wave-1].boss; const narrow=W<640; const ty0=narrow?y0+52:y0;
  ctx.textAlign='center';ctx.lineWidth=5;ctx.strokeStyle='rgba(20,6,16,.85)';
  ctx.font=`16px ${FD}`;ctx.strokeText('WAVE '+run.wave+' / '+LAST_WAVE,cx,ty0+8);ctx.fillStyle='#cdb8da';ctx.fillText('WAVE '+run.wave+' / '+LAST_WAVE,cx,ty0+8);
  if(!boss){
    const tm=Math.ceil(run.timer);const low=tm<=5&&state==='wave';const s=low?1+.15*Math.abs(Math.sin(t*Math.PI)):1;
    ctx.font=`${Math.round(44*s)}px ${FD}`;ctx.strokeText(tm,cx,ty0+42);ctx.fillStyle=low?'#ff5d6c':'#ffffff';ctx.fillText(tm,cx,ty0+42);
  }else if(run.boss&&!run.boss.dead){
    const bw2=narrow?W*.6:Math.min(420,W-2*(bw+60));const bx=cx-bw2/2,by=ty0+28;const e=run.boss;
    ctx.fillStyle='rgba(14,8,18,.8)';rr(ctx,bx-3,by-3,bw2+6,22,8);ctx.fill();ctx.fillStyle='#3a0a24';rr(ctx,bx,by,bw2,16,6);ctx.fill();
    ctx.fillStyle='#ff4d8d';rr(ctx,bx,by,Math.max(8,bw2*e.hp/e.maxHp),16,6);ctx.fill();
    ctx.font=`13px ${FD}`;ctx.lineWidth=3;ctx.strokeText('BROOD QUEEN',cx,by+9);ctx.fillStyle='#fff';ctx.fillText('BROOD QUEEN',cx,by+9);
  }
  if(run.combo>=5&&state==='wave'){const s=1+Math.min(.5,run.combo/200);const a=clamp(run.comboT/.5,0,1);ctx.globalAlpha=a;ctx.font=`${Math.round(20*s)}px ${FD}`;ctx.lineWidth=4;ctx.strokeText(run.combo+' COMBO',cx,ty0+(boss?66:76));ctx.fillStyle=run.combo>=50?'#ff6b3d':run.combo>=25?'#ffcc4d':'#5ef2b0';ctx.fillText(run.combo+' COMBO',cx,ty0+(boss?66:76));
    ctx.fillStyle='rgba(255,255,255,.5)';ctx.fillRect(cx-40,ty0+(boss?80:90),80*clamp(run.comboT/1.4,0,1),3);ctx.globalAlpha=1}
  if(run.wave===1&&state==='wave'&&run.timer>14){ctx.globalAlpha=clamp((run.timer-14)/1.5,0,1);ctx.font=`17px ${FD}`;ctx.lineWidth=4;const tx='Move to dodge. Your weapons fire on their own.';ctx.strokeText(tx,cx,H-40-SAFE.b);ctx.fillStyle='#fff';ctx.fillText(tx,cx,H-40-SAFE.b);ctx.globalAlpha=1}
  if(banner){const b=banner;const p=b.t/b.life;if(p>=1)banner=null;else{
    const s=p<.12?2.2-1.2*(p/.12):1+(p-.12)*.08;ctx.globalAlpha=p>.75?(1-p)/.25:Math.min(1,p/.06);
    ctx.save();ctx.translate(W/2,H*.36);ctx.scale(s,s);ctx.rotate(-.03);
    const fs=Math.min(72,W/9);ctx.font=`${fs}px ${FD}`;ctx.lineWidth=10;ctx.strokeStyle='rgba(20,6,16,.9)';ctx.strokeText(b.txt,0,0);ctx.fillStyle=b.col;ctx.fillText(b.txt,0,0);
    if(b.sub){ctx.font=`${Math.round(fs*.32)}px ${FD}`;ctx.lineWidth=5;ctx.strokeText(b.sub,0,fs*.68);ctx.fillStyle='#e9dcf0';ctx.fillText(b.sub,0,fs*.68)}
    ctx.restore();ctx.globalAlpha=1}}
}

/* ================= loop ================= */
let last=performance.now();
function loop(now){
  let dt=Math.min(.05,(now-last)/1000); last=now;
  if(banner)banner.t+=dt;
  shake=Math.max(0,shake-dt*40); hurtFlash=Math.max(0,hurtFlash-dt*2.5);
  if(run&&['wave','waveEnd','dying','winning'].includes(state)){
    if(freezeT>0)freezeT-=dt; else update(dt*timeScale);
    if(state==='dying'){run.endT+=dt;if(run.endT>1.8){timeScale=1;gameOver(false)}}
    if(state==='winning'){run.endT+=dt;timeScale=lerp(timeScale,1,dt*.8);if(run.endT>3){timeScale=1;gameOver(true)}}
  }
  render();
  requestAnimationFrame(loop);
}

/* ================= UI ================= */
const overlays=['menu','lvl','shop','pause','over'];
function showUI(id){overlays.forEach(o=>$(o).hidden=o!==id);$('hudBtns').hidden=!(id===null||id==='shop');$('btnPause').hidden=id==='shop'}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(()=>t.style.opacity=0,1500)}
function modLines(mods){const out=[];for(const k in mods){if(!STAT[k])continue;const v=mods[k];out.push([(v>0?'+':'')+v+(STAT[k][0]==='%'?'':' ')+STAT[k],v>0?'pos':'neg'])}return out}
function fmtLines(lines){return lines.map(([t,c])=>`<li class="${c}">${t}</li>`).join('')}

function buildMenu(){
  const box=$('chars'); box.innerHTML='';
  CHARS.forEach(ch=>{
    const b=document.createElement('button'); b.className='char';
    const cv=document.createElement('canvas'); cv.width=280; cv.height=200;
    const c=cv.getContext('2d'); const r=Math.min(40,150/ch.k);
    drawVeg(c,ch,120,190-r*1.4,r,{t:1,lx:.3,ly:.2});
    c.save();c.translate(170,150);c.rotate(-.35);drawWeaponSprite(c,ch.weapon,0,WEAPONS[ch.weapon].len*1.6);c.restore();
    const lines=modLines(ch.mods).concat(ch.lines).concat([['Starts with '+WEAPONS[ch.weapon].name,'neu']]);
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend',`<span class="role">${ch.role}</span><b>${ch.name}</b><p>${ch.desc}</p><ul>${fmtLines(lines)}</ul>`);
    b.onclick=()=>{audioInit();sfx('click');startRun(ch)};
    box.appendChild(b);
  });
  const best=store.get('bd_best',0); $('best').textContent=best?`Best run: wave ${best}${best>=LAST_WAVE?' (Queen smashed)':''}`:'';
}
function startRun(ch){newRun(ch);startWave(1)}

function rollRarity(bonus=0){
  const L=1+Math.max(-50,S.luck)/100, w=run.wave+bonus;
  const p3=Math.max(0,(w-5)*.018)*L, p2=Math.max(0,(w-2)*.04)*L, p1=Math.min(.6,(.05+w*.06)*L);
  const r=Math.random(); if(r<p3)return 3; if(r<p3+p2)return 2; if(r<p3+p2+p1)return 1; return 0;
}
function randomItem(r){for(let k=r;k>=0;k--){const pool=ITEMS.filter(i=>i.r===k&&(!i.max||(run.items[i.id]||0)<i.max));if(pool.length)return pick(pool)}return ITEMS[0]}

function showLevelUp(){
  state='levelup'; showUI('lvl');
  $('lvlTitle').textContent='LEVEL UP!'; $('lvlTitle').style.color='';
  $('lvlSub').textContent=run.pendingLv>1?`Pick one (${run.pendingLv} upgrades waiting)`:'Pick one';
  const box=$('lvlCards'); box.innerHTML=''; $('lvlBtns').innerHTML=''; box.style.gridTemplateColumns='';
  const used=new Set();
  for(let i=0;i<4;i++){
    let u; do{u=pick(UPG)}while(used.has(u[0])); used.add(u[0]);
    const r=rollRarity(); const v=u[1][r];
    const card=document.createElement('button'); card.className='card pickable r'+r;
    card.innerHTML=`<div class="ic">${iconHTML(UPG_IC[u[0]],u[2],u[3])}</div><div class="ct">${RAR[r].n}</div><div class="cn">${STAT[u[0]].replace('% ','')}</div><ul><li class="pos">+${v}${STAT[u[0]][0]==='%'?'':' '}${STAT[u[0]]}</li></ul>`;
    card.onclick=()=>{S[u[0]]+=v;if(u[0]==='maxHp')P.hp+=v;run.pendingLv--;sfx('buy');nextStep()};
    box.appendChild(card);
  }
}
function showCrate(){
  state='levelup'; showUI('lvl');
  $('lvlTitle').textContent='CRATE!'; $('lvlTitle').style.color='#ffcc4d';
  $('lvlSub').textContent=run.crates>1?`${run.crates} crates to open`:'Something rattles inside';
  const it=randomItem(Math.min(3,rollRarity(2))); const box=$('lvlCards'); box.innerHTML=''; box.style.gridTemplateColumns='minmax(0,230px)';
  box.appendChild(itemCard(it));
  const rec=Math.max(1,Math.round(iPrice(it)*.45));
  const bx=$('lvlBtns'); bx.innerHTML='';
  const take=document.createElement('button');take.className='big';take.textContent='Take it';take.onclick=()=>{applyItem(it);run.crates--;sfx('crate');nextStep()};
  const rc=document.createElement('button');rc.className='ghost';rc.innerHTML=`Recycle for ${rec} <i class="gemI" style="width:10px;height:10px"></i>`;rc.onclick=()=>{run.mats+=rec;run.crates--;sfx('gem',8);nextStep()};
  bx.append(take,rc);
}
function applyItem(it){run.items[it.id]=(run.items[it.id]||0)+1;for(const k in it.mods){S[k]+=it.mods[k];if(k==='maxHp'&&it.mods[k]>0)P.hp+=it.mods[k]}}
function itemCard(it){
  const card=document.createElement('div'); card.className='card r'+it.r;
  const lines=modLines(it.mods); if(it.extra)lines.unshift([it.extra,'neu']);
  card.innerHTML=`<div class="ic">${itemIcon(it)}</div><div class="ct">${RAR[it.r].n} item${run.items[it.id]?` · own ${run.items[it.id]}`:''}</div><div class="cn">${it.name}</div><ul>${fmtLines(lines)}</ul>`;
  return card;
}
function wStatLine(def,tier){return `${Math.round(wDmg(def,tier))}${def.pellets?'×'+(def.pellets+S.extraProj):''} dmg · ${wCd(def,tier).toFixed(2)}s · ${Math.round(wRange(def))} range`}
function weaponCard(id,tier){
  const def=WEAPONS[id]; const card=document.createElement('div'); card.className='card r'+tier;
  const ic=document.createElement('div'); ic.className='ic'; ic.appendChild(weaponIcon(id,tier)); card.appendChild(ic);
  const owned=run.weapons.some(w=>w.id===id&&w.tier===tier);
  card.insertAdjacentHTML('beforeend',`<div class="ct">Tier ${TIERN[tier]} ${def.melee?'melee':'ranged'} weapon${owned&&tier<3?' · merges':''}</div><div class="cn">${def.name}</div><ul><li>${def.desc}</li><li class="neu">${wStatLine(def,tier)}</li></ul>`);
  return card;
}
function rollShop(fresh){
  const out=run.shop.filter(s=>s.locked&&!s.sold);
  let guard=0;
  while(out.length<4&&guard++<60){
    const r=rollRarity(); let o;
    if(Math.random()<.4){const owned=run.weapons.map(w=>w.id);const id=(owned.length&&Math.random()<.35)?pick(owned):pick(Object.keys(WEAPONS));o={kind:'w',id,tier:Math.min(3,r),locked:false,sold:false}}
    else{const it=randomItem(r);o={kind:'i',id:it.id,locked:false,sold:false}}
    if(guard<50&&out.some(x=>x.kind===o.kind&&x.id===o.id))continue;
    out.push(o);
  }
  if(fresh)out.forEach(s=>{s.locked=false});
  run.shop=out;
}
function rerollCost(){const base=Math.max(1,Math.round(run.wave*.75))+run.rerolls*Math.max(1,Math.round(run.wave*.5));return run.char.cheapReroll?Math.max(1,Math.ceil(base/2)):base}
let selW=-1;
function openShop(){state='shop';run.rerolls=0;selW=-1;rollShop(true);showUI('shop');renderShop();$('shop').scrollTop=0}
function renderShop(){
  $('shopMats').textContent=run.mats; $('shopLv').textContent=P.level;
  $('shopSub').textContent=`Wave ${run.wave} cleared · ${run.kills} kills`;
  $('btnGo').textContent=run.wave+1===LAST_WAVE?'Fight the Queen':`Start Wave ${run.wave+1}`;
  const rc=rerollCost(); const rb=$('btnReroll'); rb.innerHTML=`Reroll · ${rc} <i class="gemI" style="width:10px;height:10px"></i>`; rb.disabled=run.mats<rc; rb.style.opacity=run.mats<rc?.5:1;
  const box=$('shopCards'); box.innerHTML='';
  run.shop.forEach(s=>{
    let card,price,ok=true,why='';
    if(s.kind==='w'){card=weaponCard(s.id,s.tier);price=wPrice(s.id,s.tier);if(!canAddWeapon(s.id,s.tier)){ok=false;why='Slots full'}}
    else{const it=ITEM_BY[s.id];card=itemCard(it);price=iPrice(it)}
    if(s.sold)card.classList.add('sold');
    const foot=document.createElement('div');foot.className='foot';
    const buy=document.createElement('button');buy.className='buy';buy.innerHTML=ok?`${price} <i class="gemI" style="width:10px;height:10px;box-shadow:none;background:#14260b"></i>`:why;
    buy.disabled=!ok||run.mats<price||s.sold;
    buy.onclick=()=>{
      if(run.mats<price||!ok){sfx('deny');return}
      run.mats-=price; s.sold=true;
      if(s.kind==='w'){const merged=run.weapons.length>=6;addWeapon(s.id,s.tier);if(merged)toast(`Merged into ${WEAPONS[s.id].name} ${TIERN[s.tier+1]}`)}
      else applyItem(ITEM_BY[s.id]);
      sfx('buy'); renderShop();
    };
    const lock=document.createElement('button');lock.className='lock'+(s.locked?' on':'');lock.textContent=s.locked?'HELD':'HOLD';lock.title='Keep this offer for the next shop';
    lock.onclick=()=>{s.locked=!s.locked;sfx('click');renderShop()};
    foot.append(buy,lock); card.appendChild(foot); box.appendChild(card);
  });
  $('wcount').textContent=`${run.weapons.length}/6`;
  const ws=$('wslots'); ws.innerHTML='';
  for(let i=0;i<6;i++){
    const w=run.weapons[i]; const b=document.createElement('button'); b.className='ws';
    if(!w){b.classList.add('empty');b.disabled=true;ws.appendChild(b);continue}
    b.classList.add('t'+w.tier); if(i===selW)b.classList.add('sel');
    b.appendChild(weaponIcon(w.id,w.tier)); b.title=WEAPONS[w.id].name+' '+TIERN[w.tier];
    if(w.tier<3&&run.weapons.some((o,j)=>j!==i&&o.id===w.id&&o.tier===w.tier))b.insertAdjacentHTML('beforeend','<span class="mg">MERGE</span>');
    b.onclick=()=>{selW=selW===i?-1:i;sfx('click');renderShop()};
    ws.appendChild(b);
  }
  const pop=$('wpop');
  if(selW>=0&&run.weapons[selW]){
    const w=run.weapons[selW],def=WEAPONS[w.id]; pop.hidden=false;
    const sell=Math.max(1,Math.round(wPrice(w.id,w.tier)*.3));
    const mate=run.weapons.findIndex((o,j)=>j!==selW&&o.id===w.id&&o.tier===w.tier);
    pop.innerHTML=`<div class="wt">${def.name} <span style="color:${RAR[w.tier].c}">${TIERN[w.tier]}</span></div><div class="ws2">${def.desc}<br>${wStatLine(def,w.tier)} · ${def.crit+S.crit}% crit</div><div class="row"></div>`;
    const row=pop.querySelector('.row');
    if(mate>=0&&w.tier<3){const mb=document.createElement('button');mb.className='buy';mb.style.flex='0 0 auto';mb.style.padding='9px 16px';mb.textContent=`Merge → ${TIERN[w.tier+1]}`;mb.onclick=()=>{w.tier++;w.flash=1;run.weapons.splice(mate,1);selW=-1;sfx('levelup');toast(`${def.name} is now tier ${TIERN[w.tier]}`);renderShop()};row.appendChild(mb)}
    const sb=document.createElement('button');sb.className='ghost';sb.textContent=`Sell for ${sell}`;sb.disabled=run.weapons.length<=1;sb.style.opacity=run.weapons.length<=1?.5:1;
    sb.onclick=()=>{if(run.weapons.length<=1)return;run.weapons.splice(selW,1);run.mats+=sell;selW=-1;sfx('gem',6);renderShop()};
    row.appendChild(sb);
  }else pop.hidden=true;
  const oi=$('ownedItems'); const ids=Object.keys(run.items);
  oi.innerHTML=ids.length?ids.map(id=>{const it=ITEM_BY[id];return `<span class="oi" title="${it.name}">${itemIcon(it)}${it.name}${run.items[id]>1?' ×'+run.items[id]:''}</span>`}).join(''):'<span class="none">Nothing yet. Items stack.</span>';
  $('statList').innerHTML=STAT_ORDER.map(k=>{let v=S[k];if(k==='maxHp')v=maxHp();v=Math.round(v*10)/10;const c=v>0?'pos':v<0?'neg':'';return `<dt>${STAT[k].replace('% ','')}${STAT[k].startsWith('%')?' %':''}</dt><dd class="${k==='maxHp'?'':c}">${v}</dd>`}).join('');
}
function gameOver(win){
  state='over'; showUI('over');
  $('overTitle').textContent=win?'YOU WIN!':'PICKLED';
  $('overTitle').style.color=win?'#7bd35a':'';
  $('overSub').textContent=win?`${run.char.name} smashed the Brood Queen and the crater is quiet again.`:`${run.char.name} fell on wave ${run.wave}.`;
  $('overStats').innerHTML=`<div><b>${run.wave}</b>wave</div><div><b>${run.kills}</b>kills</div><div><b>${run.bestCombo}</b>best combo</div><div><b>${run.totalMats}</b>materials</div><div><b>${P.level}</b>level</div>`;
  const best=store.get('bd_best',0); if(run.wave>best)store.set('bd_best',run.wave);
}

/* ================= input ================= */
window.addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)&&state!=='menu')e.preventDefault();
  if(e.code==='Escape'||e.code==='KeyP'){if(state==='wave'||state==='waveEnd')pause();else if(state==='paused')resume()}
  if(e.code==='KeyM')setMuted(!AU.muted);
});
window.addEventListener('keyup',e=>{keys[e.code]=false});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;if(state==='wave')pause()});
cvs.addEventListener('pointerdown',e=>{
  audioInit();
  if(!['wave','waveEnd'].includes(state)||joy.id!==null)return;
  joy.id=e.pointerId; joy.ox=e.clientX; joy.oy=e.clientY; joy.x=joy.y=0; joy.active=true;
  try{cvs.setPointerCapture(e.pointerId)}catch(_){}
});
cvs.addEventListener('pointermove',e=>{if(e.pointerId!==joy.id)return;let dx=e.clientX-joy.ox,dy=e.clientY-joy.oy;const l=Math.hypot(dx,dy),R=58;if(l>R){joy.ox+=dx/l*(l-R);joy.oy+=dy/l*(l-R);dx=dx/l*R;dy=dy/l*R}joy.x=dx/R;joy.y=dy/R;if(Math.hypot(joy.x,joy.y)<.15){joy.x*=.2;joy.y*=.2}});
const endJoy=e=>{if(e.pointerId!==joy.id)return;joy.id=null;joy.active=false;joy.x=joy.y=0};
cvs.addEventListener('pointerup',endJoy); cvs.addEventListener('pointercancel',endJoy);
document.addEventListener('pointerdown',()=>audioInit(),{once:true});

let pausedFrom=null;
function pause(){pausedFrom=state;state='paused';showUI('pause');joy.active=false;joy.id=null}
function resume(){state=pausedFrom||'wave';showUI(null);last=performance.now()}
$('btnPause').onclick=()=>{if(state==='wave'||state==='waveEnd')pause()};
$('btnSound').onclick=()=>{audioInit();setMuted(!AU.muted)};
$('btnResume').onclick=resume;
$('btnQuit').onclick=()=>{run=null;state='menu';buildMenu();showUI('menu')};
$('btnReroll').onclick=()=>{const c=rerollCost();if(run.mats<c){sfx('deny');return}run.mats-=c;run.rerolls++;run.shop.forEach(s=>{if(s.sold)s.locked=false});rollShop();sfx('click');renderShop();document.querySelectorAll('#shopCards .card').forEach(c=>c.classList.add('pop'))};
$('btnGo').onclick=()=>{sfx('click');startWave(run.wave+1)};
$('btnAgain').onclick=()=>{startRun(run.char)};
$('btnMenu').onclick=()=>{run=null;state='menu';buildMenu();showUI('menu')};
setMuted(AU.muted);

/* ================= boot ================= */
showUI('menu');
loadAssets().then(()=>{
  buildFloor(); state='menu'; buildMenu();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(state==='menu')buildMenu()});
});
requestAnimationFrame(loop);
window.BD={get run(){return run},get P(){return P},get S(){return S},get state(){return state},get enemies(){return enemies},get eb(){return ebullets},startRun,CHARS,WEAPONS,startWave,endWave,addWeapon};
