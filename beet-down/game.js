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
const STAT={maxHp:'Max HP',regen:'HP Regen',lifesteal:'% Life Steal',dmg:'% Damage',melee:'Melee Damage',ranged:'Ranged Damage',atkSpd:'% Attack Speed',crit:'% Crit Chance',range:'Range',armor:'Armor',dodge:'% Dodge',speed:'% Speed',luck:'Luck',harvest:'Harvesting',pickup:'% Pickup Range',boom:'% Death Explosions',thorns:'Thorns',blast:'% Explosion Size'};
const STAT_ORDER=['maxHp','regen','lifesteal','dmg','melee','ranged','atkSpd','crit','range','armor','dodge','speed','luck','harvest'];

const WEAPONS={
  hammer:{name:'Hammer',sets:['blunt','heavy'],melee:true,dmg:15,cd:.9,range:120,hitR:34,knock:30,crit:3,critMul:2,price:22,len:46,pv:.14,desc:'Heavy bonk with huge knockback.'},
  spear:{name:'Spear',sets:['blade','precise'],melee:true,line:true,dmg:11,cd:1.05,range:195,hitR:16,knock:12,crit:5,critMul:2.2,price:26,len:68,pv:.2,desc:'Long thrust that skewers a whole line.'},
  axe:{name:'Axe',sets:['blade','blunt'],melee:true,sweep:1.15,dmg:17,cd:1.15,range:125,knock:22,crit:5,critMul:2,price:30,len:48,pv:.14,desc:'Wide swing that cleaves everything in front.'},
  sword:{name:'Sword',sets:['blade'],melee:true,sweep:.8,dmg:12,cd:.72,range:140,knock:12,crit:8,critMul:2,price:28,len:52,pv:.16,desc:'Fast slashing arc. Reliable all-rounder.'},
  knife:{name:'Chef Knife',sets:['blade','kitchen'],melee:true,dmg:6,cd:.38,range:100,hitR:18,knock:4,crit:25,critMul:2.5,price:20,len:40,pv:.22,desc:'Rapid stabs with 25% base crit chance.'},
  pan:{name:'Frying Pan',sets:['blunt','kitchen'],melee:true,bonk:true,dmg:13,cd:1,range:112,hitR:38,knock:50,crit:12,critMul:2.5,price:24,len:46,pv:.14,desc:'Sends aliens flying. Crits go BONK.'},
  pistol:{name:'Pistol',sets:['precise'],dmg:11,cd:.75,range:400,speed:980,pierce:1,knock:8,crit:5,critMul:2,price:20,len:36,pv:.32,desc:'Reliable shot. Pierces 1 enemy.'},
  smg:{name:'SMG',sets:['rapid'],dmg:4,cd:.16,range:340,speed:980,spread:.24,knock:3,crit:2,critMul:2,price:26,len:42,pv:.32,desc:'Sprays a stream of bullets.'},
  shotgun:{name:'Shotgun',sets:['heavy'],dmg:6,cd:1.2,range:290,speed:880,pellets:5,spread:.6,pierce:1,knock:16,crit:3,critMul:2,price:30,len:50,pv:.32,desc:'Five piercing pellets. Best up close.'},
  rocket:{name:'Rocket',sets:['explosive','heavy'],dmg:16,cd:1.7,range:440,speed:520,blast:78,knock:22,crit:3,critMul:2,price:36,len:54,pv:.36,desc:'Explodes on impact, hitting everything nearby.'},
  zapper:{name:'Zapper',sets:['elemental'],dmg:9,cd:.95,range:330,chains:3,knock:4,crit:5,critMul:2,price:32,len:44,pv:.32,desc:'Lightning that jumps between enemies.'},
  sniper:{name:'Sniper',sets:['precise'],dmg:30,cd:1.1,range:650,speed:1900,pierce:4,knock:14,crit:15,critMul:2.5,price:38,len:62,pv:.32,desc:'Huge range. Pierces 4 enemies.'},
  minigun:{name:'Minigun',sets:['rapid','heavy'],spin:true,dmg:3.5,cd:.07,range:330,speed:1000,spread:.3,knock:2,crit:2,critMul:2,price:40,len:50,pv:.32,desc:'Spins up into a bullet storm.'},
  flamer:{name:'Flamer',sets:['rapid','elemental'],flame:true,dmg:2.2,cd:.085,range:185,speed:430,spread:.3,knock:1,crit:0,critMul:2,price:34,len:46,pv:.32,desc:'Short-range fire that burns through crowds.'},
  bouncer:{name:'Bouncer',sets:['precise','elemental'],bounce:2,dmg:9,cd:.8,range:360,speed:720,knock:6,crit:5,critMul:2,price:30,len:42,pv:.32,desc:'Shots ricochet to 2 more enemies (+1 per tier).'},
  lobber:{name:'Lobber',sets:['explosive'],lob:true,dmg:18,cd:2,range:380,blast:88,knock:24,crit:3,critMul:2,price:38,len:50,pv:.32,desc:'Lobs grenades over the crowd. Big boom.'},
  rolling:{name:'Rolling Pin',sets:['kitchen','blunt'],boomer:true,dmg:16,cd:1.3,range:300,speed:560,knock:12,crit:5,critMul:2,price:30,len:46,pv:.5,desc:'Thrown like a boomerang. Hits everything going out and coming back.'},
  tender:{name:'Tenderizer',sets:['blunt','kitchen'],melee:true,tender:true,dmg:7,cd:.45,range:105,hitR:22,knock:6,crit:5,critMul:2,price:28,len:44,pv:.15,desc:'Each hit makes aliens take 12% more damage for 4s (stacks 3x).'},
  laser:{name:'Laser',sets:['precise','elemental'],beam:true,dmg:2,cd:.14,range:380,knock:1,crit:3,critMul:2,price:38,len:46,pv:.32,desc:'Rapid beam that hits every alien in a line.'},
  rail:{name:'Railgun',sets:['precise','heavy'],rail:true,dmg:50,cd:2.6,range:720,knock:30,crit:10,critMul:2.5,price:44,len:54,pv:.32,desc:'Slow, huge piercing beam across the arena.'},
  mines:{name:'Mine Layer',sets:['explosive'],mine:true,dmg:40,cd:1.1,range:260,blast:80,knock:22,crit:3,critMul:2,price:34,len:48,pv:.32,desc:'Drops mines that explode when aliens step on them.'},
  guzi:{name:'Golden Uzi',sets:['rapid'],gold:true,dmg:4,cd:.16,range:340,speed:980,spread:.2,knock:3,crit:3,critMul:2,price:44,len:40,pv:.35,desc:'Kills have a 30% chance to drop 2 extra materials.'},
  pizza:{name:'Pizza Cutter',sets:['kitchen','blade'],disc:true,dmg:10,cd:1.05,range:380,speed:600,knock:5,crit:8,critMul:2,price:32,len:40,pv:.5,desc:'Throws a spinning blade that bounces off the walls and slices through aliens.'},
  pick:{name:'Pickaxe',sets:['blunt','heavy'],melee:true,quake:true,dmg:20,cd:1.25,range:115,hitR:36,knock:26,crit:12,critMul:3,price:32,len:48,pv:.14,desc:'Slow, brutal swings. Crits deal 3x and crack the ground around the target.'},
  cane:{name:'Candy Cane',sets:['blunt'],melee:true,sweep:.95,dmg:11,cd:.85,range:150,knock:-9,crit:5,critMul:2,price:28,len:50,pv:.14,desc:'Hooking swing that pulls aliens in toward you.'},
  scythe:{name:'Scythe',sets:['blade'],melee:true,sweep:3.15,dmg:15,cd:1.2,range:125,knock:14,crit:6,critMul:2.2,price:36,len:54,pv:.16,desc:'Spins all the way around, cutting every alien nearby.'},
  silencer:{name:'Silenced Pistol',sets:['precise'],exec:.25,dmg:13,cd:.75,range:420,speed:1100,pierce:1,knock:6,crit:8,critMul:2,price:32,len:40,pv:.32,desc:'Pierces 1. Instantly finishes any non-boss alien below 25% health.'},
  pepper:{name:'Pepper Mill',sets:['kitchen','elemental'],flame:true,pepper:true,dmg:2,cd:.12,range:175,speed:380,spread:.55,knock:1,crit:0,critMul:2,price:34,len:44,pv:.3,desc:'Sprays a cloud of pepper that poisons aliens it touches.'},
  cluster:{name:'Cluster Launcher',sets:['explosive','heavy'],cluster:4,dmg:14,cd:2.2,range:420,speed:480,blast:70,knock:18,crit:3,critMul:2,price:42,len:56,pv:.36,desc:'Rockets burst into 4 extra bomblets.'},
};
/* Weapon sets: bonuses unlock at 2, 4 and 6 weapons of a set (duplicates count). Each tier replaces the one before. */
const SETS={
  blade:{name:'Blade',col:'#ff6b8a',tiers:[[2,{crit:5}],[4,{crit:10,lifesteal:3}],[6,{crit:16,lifesteal:6}]]},
  blunt:{name:'Blunt',col:'#c9c2d6',tiers:[[2,{armor:2}],[4,{armor:4,melee:3}],[6,{armor:7,melee:6}]]},
  kitchen:{name:'Kitchen',col:'#ffb36b',tiers:[[2,{harvest:8,regen:2}],[4,{harvest:16,regen:4}],[6,{harvest:30,regen:7}]]},
  precise:{name:'Precise',col:'#9fd0ff',tiers:[[2,{range:30,crit:3}],[4,{range:60,crit:6}],[6,{range:110,crit:12}]]},
  rapid:{name:'Rapid',col:'#6fe3ff',tiers:[[2,{atkSpd:6}],[4,{atkSpd:14}],[6,{atkSpd:25}]]},
  explosive:{name:'Explosive',col:'#ff8a3d',tiers:[[2,{blast:20}],[4,{blast:40,dmg:8}],[6,{blast:70,dmg:15}]]},
  elemental:{name:'Elemental',col:'#c08bff',tiers:[[2,{dmg:8}],[4,{dmg:16,speed:5}],[6,{dmg:25,speed:10}]]},
  heavy:{name:'Heavy',col:'#e0b84f',tiers:[[2,{maxHp:4}],[4,{maxHp:10,armor:2}],[6,{maxHp:18,armor:4,speed:-5}]]},
};
for(const k in WEAPONS)WEAPONS[k].id=k;
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
  {id:'anvil',name:'Iron Anvil',r:0,price:16,sym:'■',col:'#b8b8c8',mods:{maxHp:7,armor:1,speed:-3}},
  {id:'glasses',name:'Reading Glasses',r:0,price:15,sym:'◎',col:'#9fd0ff',mods:{crit:4,range:20}},
  {id:'juice',name:'Juice Box',r:0,price:14,sym:'▮',col:'#ff9ad0',mods:{regen:2,maxHp:3}},
  {id:'gift',name:'Gift Box',r:0,price:18,sym:'✚',col:'#ff5a5a',mods:{freeReroll:1},extra:'One free reroll every shop',max:3},
  {id:'piggy',name:'Piggy Bank',r:1,price:28,sym:'●',col:'#ff9ad0',mods:{interest:10},extra:'Earn 10% interest on unspent materials after each wave (up to 30)',max:2},
  {id:'frost',name:'Frost Flake',r:1,price:32,sym:'✻',col:'#9fe8ff',mods:{freeze:10},extra:'Hits have a 10% chance to freeze aliens for 1s',max:3},
  {id:'poison',name:'Poison Vial',r:1,price:32,sym:'▲',col:'#7dff4a',mods:{poison:4},extra:'Hits poison aliens for 4 damage per second, stacking up to 3 times',max:3},
  {id:'cat',name:'Lucky Cat',r:1,price:26,sym:'✤',col:'#ffcc4d',mods:{luck:15,lootMul:100},extra:'Healing fruit drops twice as often',max:2},
  {id:'rage',name:'Rage Soda',r:1,price:30,sym:'ϟ',col:'#ff5d3d',mods:{rage:30},extra:'+30% attack speed for 4s after you get hit'},
  {id:'panic',name:'Panic Button',r:1,price:28,sym:'✹',col:'#ff8a3d',mods:{panic:30,armor:1},extra:'Explode for 30 damage when you get hit'},
  {id:'rod',name:'Storm Lantern',r:2,price:58,sym:'ϟ',col:'#6fe3ff',mods:{strike:1},extra:'Lightning strikes a random alien every 2.5s'},
  {id:'fshield',name:'Force Shield',r:2,price:60,sym:'◈',col:'#6fe3ff',mods:{shield:1},extra:'Blocks one hit, then recharges for 8s',max:2},
  {id:'urn',name:'Treasure Urn',r:2,price:52,sym:'♦',col:'#ffcc4d',mods:{matChance:25,harvest:6},extra:'25% chance kills drop an extra material'},
  {id:'missile',name:'Missile Pod',r:3,price:95,sym:'➶',col:'#7bd35a',mods:{missile:1},extra:'Every 7 kills, fire a homing missile (sooner with more pods)',max:3},
  {id:'chrono',name:'Chrono Crystal',r:3,price:90,sym:'✦',col:'#6fa8ff',mods:{slow:15,atkSpd:5},extra:'All aliens move 15% slower',max:2},
  {id:'bag',name:'Shopping Bag',r:0,price:16,sym:'$',col:'#d9b26b',mods:{shopDisc:10},extra:'Shop prices 10% cheaper',max:3},
  {id:'cap',name:'Thinking Cap',r:0,price:14,sym:'?',col:'#ff6b3d',mods:{xpPct:20},extra:'+20% experience'},
  {id:'rice',name:'Rice Ball',r:0,price:14,sym:'●',col:'#ffffff',mods:{maxHp:4,regen:2}},
  {id:'orb',name:'Static Orb',r:1,price:30,sym:'ϟ',col:'#4fb3ff',mods:{critZap:50,crit:3},extra:'Critical hits zap a nearby alien for 50% damage'},
  {id:'drone',name:'Buddy Drone',r:1,price:34,sym:'✈',col:'#b8b8c8',mods:{drone:1},extra:'A drone orbits you and shoots nearby aliens',max:2},
  {id:'target',name:"Hunter's Target",r:1,price:28,sym:'◎',col:'#ff5d3d',mods:{bossDmg:25},extra:'+25% damage to elites and bosses'},
  {id:'wheel',name:'Prize Wheel',r:1,price:28,sym:'✺',col:'#ffcc4d',mods:{comboDmg:1},extra:'+1% damage per 5 combo (up to +30%)',max:1},
  {id:'saws',name:'Sawblades',r:2,price:56,sym:'✹',col:'#c8d0e0',mods:{saws:2},extra:'Two sawblades orbit you, cutting aliens they touch',max:2},
  {id:'bombs',name:'Bomb Bag',r:2,price:52,sym:'●',col:'#3a3a48',mods:{bombs:1},extra:'Tosses a bomb at the nearest alien every 6s',max:2},
  {id:'trophy',name:"Champion's Trophy",r:2,price:50,sym:'♛',col:'#ffcc4d',mods:{extraChoice:1,luck:10},extra:'+1 level-up choice',max:1},
  {id:'candle',name:'Spirit Candle',r:3,price:88,sym:'✦',col:'#a8b8ff',mods:{revive:1},extra:'Once per wave, survive a deadly hit with half your HP',max:1},
  {id:'jelly',name:'Royal Jelly',r:2,price:48,sym:'♥',col:'#ffb53d',mods:{regen:3,maxHp:6}},
  {id:'lolly',name:'Sugar Lollipop',r:1,price:30,sym:'◉',col:'#e88bd8',mods:{atkSpd:10,speed:4,maxHp:-3}},
  {id:'donut',name:'Sprinkle Donut',r:1,price:32,sym:'○',col:'#ff9ad0',mods:{luck:12,harvest:5}},
  {id:'icecream',name:'Brain Freeze',r:2,price:50,sym:'✻',col:'#ffb3e0',mods:{freeze:8,atkSpd:5},extra:'Hits have an 8% chance to freeze aliens',max:3},
  {id:'glassball',name:'Glass Cannonball',r:3,price:85,sym:'●',col:'#6fe3ff',mods:{dmg:40,maxHpPct:-35},extra:'-35% Max HP',max:1},
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
  {id:'cabbage',name:'Cabbage',role:'Layered',desc:'Peel one layer, find another.',weapon:'spear',mods:{shield:1,maxHp:10,speed:-8},lines:[['Built-in shield blocks a hit every 8s','pos']],k:2.3,fy:.55,es:.13,ez:.065},
  {id:'cauli',name:'Cauliflower',role:'Big Brain',desc:'Thinks its way out of every swarm.',weapon:'zapper',mods:{dmg:-12},lines:[['+50% experience','pos'],['Level-ups offer 5 choices','pos']],xpMul:1.5,choices:5,k:2.3,fy:.62,es:.12,ez:.06},
  {id:'lemon',name:'Lemon',role:'Sour',desc:'Every hit leaves a bitter taste.',weapon:'smg',mods:{poison:2,crit:5,maxHp:-4},lines:[['Every hit poisons aliens','pos']],k:2.6,fy:.5,es:.11,ez:.06},
  {id:'banana',name:'Banana',role:'Slippery',desc:'Hard to catch, easy to bruise.',weapon:'knife',mods:{dodge:25,speed:15,maxHp:-8},lines:[],k:3.4,fy:.48,fx:.04,es:.065,ez:.042},
  {id:'melon',name:'Watermelon',role:'Heavyweight',desc:'Only needs a few weapons. Swings them hard.',weapon:'shotgun',mods:{dmg:100,maxHp:10,speed:-5},maxW:3,lines:[['Only 3 weapon slots','neg']],k:2.3,fy:.55,es:.14,ez:.065},
  {id:'grapes',name:'Grapes',role:'Bunch',desc:'There are always more of us.',weapon:'pistol',startW:['pistol','pistol'],mods:{dmg:-25},maxW:8,lines:[['8 weapon slots','pos'],['Starts with two Pistols','neu']],k:3,fy:.42,es:.1,ez:.055},
  {id:'tomato',name:'Tomato',role:'Ketchup',desc:'Leaves a sticky mess wherever it goes.',weapon:'rolling',mods:{maxHp:5,harvest:5},lines:[['Kills can leave ketchup that slows aliens','pos']],ketchup:true,k:2.3,fy:.58,es:.14,ez:.065},
  {id:'pineapple',name:'Pineapple',role:'Spiky',desc:'Touch it and regret it.',weapon:'sword',mods:{thorns:8,armor:2,melee:2,speed:-5},lines:[['Fires a ring of spines when hit','pos']],spines:true,k:3.3,fy:.72,es:.07,ez:.045},
  {id:'strawberry',name:'Strawberry',role:'Sweet Tooth',desc:'Knows every bargain in the crater.',weapon:'pistol',mods:{shopDisc:25,harvest:15,dmg:-15},lines:[['Shop prices 25% cheaper','pos']],k:2.8,fy:.6,es:.1,ez:.055},
  {id:'cherries',name:'Cherries',role:'Twins',desc:'Two of everything, half the punch.',weapon:'smg',mods:{extraProj:1,dmg:-30},lines:[['Guns fire +1 projectile','pos']],k:2.6,fy:.84,es:.25,ez:.06,noMouth:true},
  {id:'egg',name:'Egg',role:'Hatchling',desc:'Fragile now. Terrifying later.',weapon:'knife',mods:{dmg:-35},lines:[['+7% damage and +2 Max HP every wave','pos']],grow:true,k:2.6,fy:.5,es:.1,ez:.06},
  {id:'coconut',name:'Coconut',role:'Hard Shell',desc:'Nothing gets through in one piece.',weapon:'hammer',mods:{armor:5,maxHp:8,speed:-10,dodge:-10},lines:[['No single hit takes more than 15% of your Max HP','pos']],capHit:.15,k:2.3,fy:.56,es:.12,ez:.065},
  {id:'pear',name:'Pear',role:'Slippery',desc:'Hard to pin down, harder to stop.',weapon:'smg',mods:{dodge:12,speed:8,maxHp:-4},lines:[['Dodging gives +60% Attack Speed for 2s','pos']],slip:true,k:2.6,fy:.66,es:.09,ez:.055},
  {id:'leek',name:'Leek',role:'Lancer',desc:'Keeps every alien at arm\'s length.',weapon:'spear',mods:{melee:2,maxHp:3},lines:[['Melee weapons reach 50% farther','pos']],meleeRange:1.5,k:4.6,fy:.76,es:.045,ez:.03},
];

/* Unlocks: progress is kept in this browser (localStorage). Characters not listed start unlocked. */
const UNLOCKS={
  carrot:{txt:'Reach wave 5',goal:5,val:p=>p.best},
  corn:{txt:'Collect 500 materials across runs',goal:500,val:p=>p.mats},
  eggplant:{txt:'Hit a 100-kill combo',goal:100,val:p=>p.combo},
  broccoli:{txt:'Heal 150 HP across runs',goal:150,val:p=>p.heal},
  pepper:{txt:'Unlock a 4-weapon set bonus',goal:1,val:p=>p.set4},
  mushroom:{txt:'Defeat 1,500 aliens across runs',goal:1500,val:p=>p.kills},
  pumpkin:{txt:'Defeat a final boss',goal:1,val:p=>p.wins},
  cabbage:{txt:'Take 1,000 damage across runs',goal:1000,val:p=>p.dmgTaken||0},
  cauli:{txt:'Reach level 20 in one run',goal:20,val:p=>p.maxLevel||0},
  lemon:{txt:'Land 1,000 critical hits',goal:1000,val:p=>p.crits},
  banana:{txt:'Dodge 50 attacks across runs',goal:50,val:p=>p.dodges||0},
  melon:{txt:'Win a run on Danger 2 or higher',goal:1,val:p=>Object.values(p.medals).some(v=>v>=2)?1:0},
  grapes:{txt:'Win a Full 20-wave run',goal:1,val:p=>Object.keys(p.fmedals).length?1:0},
  tomato:{txt:'Defeat 3,000 aliens across runs',goal:3000,val:p=>p.kills},
  pineapple:{txt:'Get hit 300 times across runs',goal:300,val:p=>p.hitsTaken||0},
  strawberry:{txt:'Spend 5,000 materials in the shop',goal:5000,val:p=>p.spent||0},
  cherries:{txt:'Carry 8 weapons at once',goal:1,val:p=>p.full8||0},
  egg:{txt:'Reach wave 15 in a Full run',goal:15,val:p=>p.best},
  leek:{txt:'Defeat 1,000 aliens with melee weapons',goal:1000,val:p=>p.meleeK},
  coconut:{txt:'Take 2,000 damage across runs',goal:2000,val:p=>p.dmgTaken||0},
  pear:{txt:'Dodge 500 attacks',goal:500,val:p=>p.dodges||0},
};
const profDefaults=()=>({best:0,kills:0,mats:0,heal:0,combo:0,set4:0,wins:0,unlocked:[],seen:[],danger:0,dsel:0,medals:{},fmedals:{},len:10,wunlocked:[],wseen:[],eseen:[],crits:0,hitsTaken:0,spent:0,full8:0,ek:{},dmgTaken:0,maxLevel:0,dodges:0,meleeK:0,boomK:0,full6:0,elites:0,wk:{}});
const PROF=Object.assign(profDefaults(),{best:store.get('bd_best',0)},store.get('bd_prof',{}));
/* Danger levels stack: each one includes every level below it. Win on your highest unlocked level to open the next. */
const DANGERS=[
  {name:'Mild',col:'#7bd35a',desc:'The standard run.'},
  {name:'Spicy',col:'#ffcc4d',desc:'Enemies have +20% HP and deal +20% damage.'},
  {name:'Hot',col:'#ff9a3c',desc:'25% more enemies, and an elite joins every wave from wave 3.'},
  {name:'Scorching',col:'#ff6b3d',desc:'Enemies move 12% faster and their shots fly 25% faster.'},
  {name:'Inferno',col:'#ff3b5c',desc:'Shop prices +25% and bosses have +40% HP.'},
  {name:'Meltdown',col:'#c43bff',desc:'The final wave brings TWO different bosses.'},
];
const DZ=n=>!!run&&run.danger>=n;
function saveProf(){store.set('bd_prof',PROF)}
function resetProgress(){for(const k of Object.keys(PROF))delete PROF[k];Object.assign(PROF,profDefaults());saveProf();store.set('bd_best',0)}
const isUnlocked=id=>!UNLOCKS[id]||PROF.unlocked.includes(id);
/* Weapons not listed here are in the shop from the start. A veggie's starting weapon can always appear in its own shop. */
const WUNLOCKS={
  knife:{txt:'Land 200 critical hits',goal:200,val:p=>p.crits},
  axe:{txt:'Defeat 300 aliens with melee weapons',goal:300,val:p=>p.meleeK},
  sniper:{txt:'Defeat 250 aliens with the Pistol',goal:250,val:p=>p.wk.pistol||0},
  minigun:{txt:'Defeat 400 aliens with the SMG',goal:400,val:p=>p.wk.smg||0},
  flamer:{txt:'Defeat 250 aliens with the Zapper',goal:250,val:p=>p.wk.zapper||0},
  rocket:{txt:'Defeat 150 aliens with explosions',goal:150,val:p=>p.boomK},
  bouncer:{txt:'Carry 6 weapons at once',goal:1,val:p=>p.full6},
  lobber:{txt:'Defeat 10 elite aliens',goal:10,val:p=>p.elites},
  rolling:{txt:'Defeat 300 aliens with Kitchen weapons',goal:300,val:p=>(p.wk.knife||0)+(p.wk.pan||0)+(p.wk.tender||0)},
  tender:{txt:'Defeat 300 aliens with Blunt weapons',goal:300,val:p=>(p.wk.hammer||0)+(p.wk.pan||0)+(p.wk.axe||0)},
  laser:{txt:'Defeat 400 aliens with Elemental weapons',goal:400,val:p=>(p.wk.zapper||0)+(p.wk.flamer||0)+(p.wk.bouncer||0)},
  rail:{txt:'Defeat 150 aliens with the Sniper',goal:150,val:p=>p.wk.sniper||0},
  mines:{txt:'Defeat 40 bombers',goal:40,val:p=>(p.ek||{}).bomber||0},
  guzi:{txt:'Collect 3,000 materials across runs',goal:3000,val:p=>p.mats},
  pizza:{txt:'Defeat 600 aliens with Kitchen weapons',goal:600,val:p=>['knife','pan','tender','rolling'].reduce((a,k)=>a+(p.wk[k]||0),0)},
  pick:{txt:'Land 3,000 critical hits',goal:3000,val:p=>p.crits},
  cane:{txt:'Defeat 100 Blinkers or Phantoms',goal:100,val:p=>((p.ek||{}).blinker||0)+((p.ek||{}).phantom||0)},
  scythe:{txt:'Defeat 600 Gnats',goal:600,val:p=>(p.ek||{}).gnat||0},
  silencer:{txt:'Defeat 600 aliens with Precise weapons',goal:600,val:p=>['pistol','sniper','spear','bouncer','laser','rail'].reduce((a,k)=>a+(p.wk[k]||0),0)},
  pepper:{txt:'Defeat 400 aliens with the Flamer',goal:400,val:p=>p.wk.flamer||0},
  cluster:{txt:'Defeat 400 aliens with explosions',goal:400,val:p=>p.boomK},
};
const wUnlocked=id=>!WUNLOCKS[id]||PROF.wunlocked.includes(id);
function creditKill(def){PROF.wk[def.id]=(PROF.wk[def.id]||0)+1;if(def.melee)PROF.meleeK++}
function checkUnlocks(){
  for(const id in WUNLOCKS){const u=WUNLOCKS[id];if(PROF.wunlocked.includes(id)||u.val(PROF)<u.goal)continue;
    PROF.wunlocked.push(id); saveProf(); const nm=WEAPONS[id].name;
    if(run){(run.newWeapons=run.newWeapons||[]).push(id)}
    if(state==='wave'||state==='waveEnd'||state==='winning'){showBanner('NEW WEAPON!',nm+' added to the shop',2.2,'#4fb3ff');sfx('crate')}
    else if(state==='shop'){toast(`New weapon unlocked: ${nm}!`);sfx('crate')}}
  for(const id in UNLOCKS){const u=UNLOCKS[id];if(PROF.unlocked.includes(id)||u.val(PROF)<u.goal)continue;
    PROF.unlocked.push(id); saveProf(); const ch=CHARS.find(c=>c.id===id);
    if(run){(run.newUnlocks=run.newUnlocks||[]).push(id)}
    if(state==='wave'||state==='waveEnd'||state==='winning'){showBanner('NEW VEGGIE!',ch.name+' unlocked',2.2,'#7bd35a');sfx('crate')}
    else if(state==='shop'){toast(`New veggie unlocked: ${ch.name}!`);sfx('crate')}}
}
window.addEventListener('pagehide',saveProf);

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
  gnat:{hp:3,spd:170,dmg:2,r:9,mats:0,mc:.35,col:'#45d6e8',dark:'#1d7584',vs:1.15},
  oozer:{hp:24,spd:58,dmg:4,r:18,mats:2,col:'#3cd46f',dark:'#1d7a3e'},
  mole:{hp:20,spd:115,dmg:7,r:15,mats:2,col:'#7a6250',dark:'#2e2219'},
  medic:{hp:16,spd:80,dmg:2,r:15,mats:2,col:'#f2eef0',dark:'#8a8090'},
  hive:{hp:140,spd:0,dmg:4,r:30,mats:8,col:'#ffc21f',dark:'#9a6f00',heavy:true},
  bulwark:{hp:30,spd:58,dmg:6,r:22,mats:4,col:'#6b5444',dark:'#2e2219'},
  spotter:{hp:12,spd:75,dmg:9,r:15,mats:3,col:'#ff4d6d',dark:'#9c1f37'},
  blinker:{hp:10,spd:95,dmg:4,r:14,mats:2,col:'#f2eef0',dark:'#8a8090'},
  phantom:{hp:16,spd:110,dmg:4,r:15,mats:3,col:'#f2eef0',dark:'#8a8090'},
  pulser:{hp:20,spd:65,dmg:6,r:17,mats:3,col:'#ffc21f',dark:'#9a6f00'},
  rhino:{hp:36,spd:65,dmg:8,r:22,mats:5,col:'#6b5444',dark:'#2e2219',heavy:true,armor:3},
  bee:{hp:9,spd:120,dmg:4,r:13,mats:1,col:'#ffc21f',dark:'#9a6f00'},
  webber:{hp:14,spd:75,dmg:4,r:16,mats:2,col:'#f2eef0',dark:'#8a8090'},
  thief:{hp:12,spd:150,dmg:2,r:14,mats:2,col:'#ffc21f',dark:'#9a6f00'},
  sentry:{hp:24,spd:70,dmg:5,r:16,mats:3,col:'#6b5444',dark:'#2e2219'},
  roller:{hp:22,spd:70,dmg:6,r:17,mats:2,col:'#3cd46f',dark:'#1d7a3e'},
  shielder:{hp:18,spd:72,dmg:3,r:16,mats:3,col:'#45d6e8',dark:'#1d7584'},
  berserker:{hp:44,spd:50,dmg:7,r:21,mats:4,col:'#ff4d6d',dark:'#9c1f37',heavy:true},
  boss:{hp:7500,spd:70,dmg:10,r:62,mats:60,col:'#ff4d6d',dark:'#7a1530',heavy:true,isBoss:true},
  bking:{hp:7000,spd:80,dmg:10,r:60,mats:60,col:'#7a6250',dark:'#2e2219',heavy:true,isBoss:true,riseR:110},
  otitan:{hp:8400,spd:50,dmg:10,r:66,mats:60,col:'#3cd46f',dark:'#1d7a3e',heavy:true,isBoss:true},
  slord:{hp:6600,spd:120,dmg:9,r:56,mats:60,col:'#45d6e8',dark:'#1d7584',heavy:true,isBoss:true},
  warden:{hp:7000,spd:55,dmg:11,r:64,mats:60,col:'#6b5444',dark:'#2e2219',heavy:true,isBoss:true},
  wraith:{hp:6800,spd:95,dmg:9,r:58,mats:60,col:'#e8e0ff',dark:'#8a8090',heavy:true,isBoss:true},
  hqueen:{hp:7600,spd:80,dmg:10,r:62,mats:60,col:'#ffc21f',dark:'#9a6f00',heavy:true,isBoss:true},
  wmother:{hp:7400,spd:85,dmg:10,r:60,mats:60,col:'#6b5444',dark:'#2e2219',heavy:true,isBoss:true},
  fortress:{hp:7200,spd:45,dmg:10,r:60,mats:60,col:'#f2eef0',dark:'#8a8090',heavy:true,isBoss:true},
  rampager:{hp:7400,spd:72,dmg:10,r:62,mats:60,col:'#ff4d6d',dark:'#9c1f37',heavy:true,isBoss:true},
  watcher:{hp:7200,spd:45,dmg:10,r:60,mats:60,col:'#45d6e8',dark:'#1d7584',heavy:true,isBoss:true},
};
const WAVES=[
  {dur:20,int:1.5,grp:[2,4],mix:{grub:1}},
  {dur:25,int:1.45,grp:[2,4],mix:{grub:3,dasher:1}},
  {dur:30,int:1.4,grp:[3,4],mix:{grub:3,dasher:1,spitter:1,gnat:.5},bug:true},
  {dur:35,int:1.35,grp:[3,5],mix:{grub:3,dasher:1,spitter:1,splitter:1,bomber:.5,gnat:.6,oozer:.4,blinker:.5,thief:.4}},
  {dur:40,int:1.2,grp:[4,6],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.4,bomber:.6,gnat:.7,oozer:.6,bulwark:.3,blinker:.5,thief:.4,webber:.4,roller:.4},elite:true,bug:true},
  {dur:45,int:1.1,grp:[4,6],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.6,bomber:.7,hopper:1,gnat:.7,oozer:.6,mole:.6,medic:.4,bulwark:.3,blinker:.5,spotter:.5,pulser:.4,thief:.4,webber:.4,roller:.4,sentry:.4,shielder:.3}},
  {dur:45,int:1.05,grp:[5,7],mix:{grub:3,dasher:1.2,spitter:1,splitter:1,brute:.6,bomber:.8,hopper:1.2,gnat:.8,oozer:.6,mole:.7,medic:.5,bulwark:.3,blinker:.5,spotter:.5,pulser:.5,phantom:.5,thief:.4,webber:.4,roller:.4,sentry:.4,shielder:.35,berserker:.3,bee:.5},bug:true,hive:1},
  {dur:50,int:1,grp:[5,7],mix:{grub:3,dasher:1.4,spitter:1.2,splitter:1.2,brute:.8,bomber:.9,hopper:1.3,gnat:.8,oozer:.7,mole:.8,medic:.5,bulwark:.35,blinker:.5,spotter:.5,pulser:.5,phantom:.5,rhino:.3,thief:.4,webber:.45,roller:.45,sentry:.45,shielder:.4,berserker:.35,bee:.5},elite:true},
  {dur:55,int:.95,grp:[6,8],mix:{grub:3,dasher:1.5,spitter:1.3,splitter:1.3,brute:1,bomber:1,hopper:1.4,gnat:.9,oozer:.8,mole:.9,medic:.6,bulwark:.35,blinker:.6,spotter:.6,pulser:.6,phantom:.6,rhino:.35,thief:.45,webber:.5,roller:.5,sentry:.5,shielder:.4,berserker:.4,bee:.6},bug:true,hive:1},
  {dur:0,int:2.6,grp:[3,5],mix:{grub:2,dasher:1,spitter:1,hopper:1,gnat:1},boss:true},
];
const LAST_WAVE=WAVES.length;
/* Full run: the same first nine waves, then ten longer, denser waves and a tougher Brood Queen on wave 20. */
const MIXL={grub:2.5,dasher:1.5,spitter:1.3,splitter:1.3,brute:1.2,bomber:1.1,hopper:1.5,gnat:1.2,oozer:.9,mole:.9,medic:.6,bulwark:.45,blinker:.6,spotter:.6,pulser:.6,phantom:.6,rhino:.45,thief:.45,webber:.5,roller:.5,sentry:.5,shielder:.45,berserker:.5,bee:.6};
const WAVES_FULL=WAVES.slice(0,9).concat([
  {dur:0,int:1.6,grp:[4,6],mix:MIXL,boss:true,mid:true,half:true},
  {dur:55,int:.98,grp:[5,7],mix:MIXL},
  {dur:60,int:.95,grp:[5,8],mix:MIXL,elite:1,bug:true},
  {dur:60,int:.93,grp:[6,8],mix:{...MIXL,brute:1.5},hive:1},
  {dur:60,int:.9,grp:[6,8],mix:{...MIXL,bomber:1.6},bug:true},
  {dur:60,int:.88,grp:[6,9],mix:{...MIXL,brute:1.6},elite:2,hive:1},
  {dur:60,int:.86,grp:[6,9],mix:{...MIXL,hopper:2},bug:true},
  {dur:60,int:.84,grp:[7,9],mix:{...MIXL,brute:1.8,bomber:1.6},hive:1},
  {dur:60,int:.82,grp:[7,10],mix:{...MIXL,brute:2},elite:2,bug:true},
  {dur:60,int:.8,grp:[7,10],mix:{...MIXL,brute:2,dasher:2,hopper:2},elite:1,hive:1},
  {dur:0,int:2.2,grp:[4,6],mix:{grub:2,dasher:1,spitter:1,hopper:1,brute:.5,bomber:.5},boss:true},
]);
const ENEMY_INFO={bee:['Honeybee','Darts in to sting. Leaves sticky honey'],webber:['Webber','Lobs sticky webs that slow you down'],thief:['Thief','Steals your materials and runs. Catch it!'],sentry:['Sentry','Plants itself and fires bursts'],roller:['Roller','Curls up and bounces around the arena'],shielder:['Shielder','Gives nearby aliens a bubble that blocks a hit'],berserker:['Berserker','Gets faster the more you hurt it'],bulwark:['Bulwark','Its shield blocks shots from the front. Flank it'],spotter:['Spotter','Aims a red laser, then fires. Sidestep the line'],blinker:['Blinker','Teleports right next to you'],phantom:['Phantom','Turns ghostly and untouchable. Hit it when solid'],pulser:['Pulser','Sends out shockwave rings. Keep your distance'],rhino:['Rhino','Armored and charges. Big hits get through'],gnat:['Gnats','Fast swarmers that arrive in flocks'],oozer:['Oozer',"Leaves acid puddles. Don't stand in them"],mole:['Mole','Tunnels underground, then bursts up under you'],medic:['Medic','Heals nearby aliens. Take it out first'],hive:['Hive','Spawns gnats until you destroy it']};
const BOSSES={hqueen:{name:'The Hive Queen',sub:'Long live the queen! Swat the swarm'},wmother:{name:'The Web Mother',sub:'Stay out of the webs. Watch where she lands'},fortress:{name:'The Fortress',sub:'Slip between the spinning bullet spokes'},rampager:{name:'The Rampager',sub:'It gets angrier as it gets hurt'},warden:{name:'The Iron Warden',sub:'Flank it, or break its shield'},wraith:{name:'The Wraith',sub:'Watch where it reappears'},watcher:{name:'The Watcher',sub:'Walk around the sweeping beam'},boss:{name:'The Brood Queen',sub:'Bullet rings, charges and summons'},bking:{name:'The Burrow King',sub:'Watch the ground beneath you'},otitan:{name:'The Ooze Titan',sub:'Keep moving. The ground is acid'},slord:{name:'The Swarm Lord',sub:'Dodge the dashes'}};
const bossName=t=>BOSSES[t]?BOSSES[t].name:'Boss';
const RUN_LENS={10:{name:'Quick',waves:WAVES},20:{name:'Full',waves:WAVES_FULL}};

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
const GAP={laser:70,rail:120,shoot:45,smg:55,hit:28,crit:40,kill:22,gem:22,swing:60,zap:60,boom:50,shotgun:60,rocket:60,dodge:80,flame:90,sniper:80,bounce:50,lob:80,bonk:60,fuse:120};
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
    case 'laser': blip(2100,1500,.05,'square',.014); break;
    case 'rail': blip(320,60,.4,'sawtooth',.1); nz(.3,.15,6000,300); break;
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
let run=null, P=null, S=null, B=null; // B = permanent stats, S = B + weapon set bonuses
let webs=[],kpools=[],rings=[],mines=[],marks=[],pools=[],enemies=[],bullets=[],ebullets=[],gems=[],pickups=[],parts=[],texts=[],fx=[],spawns=[],booms=[];
let cam={x:AW/2,y:AH/2},shake=0,freezeT=0,timeScale=1,hurtFlash=0,banner=null;
const keys={}; const joy={id:null,ox:0,oy:0,x:0,y:0,active:false};

function newRun(ch){
  B={maxHp:20,regen:0,lifesteal:0,dmg:0,melee:0,ranged:0,atkSpd:0,crit:0,range:0,armor:0,dodge:0,speed:0,luck:0,harvest:0,pickup:0,extraProj:0,thorns:0,boom:0,blast:0,freeReroll:0,interest:0,freeze:0,poison:0,lootMul:0,rage:0,panic:0,strike:0,shield:0,matChance:0,missile:0,slow:0,shopDisc:0,xpPct:0,critZap:0,drone:0,bossDmg:0,comboDmg:0,saws:0,bombs:0,extraChoice:0,revive:0,maxHpPct:0};
  for(const k in ch.mods)B[k]+=ch.mods[k];
  S=Object.assign({},B);
  const len=RUN_LENS[PROF.len]?PROF.len:10;
  run={char:ch,len,waves:RUN_LENS[len].waves,last:RUN_LENS[len].waves.length,danger:Math.min(PROF.dsel,PROF.danger),bosses:[],wave:0,mats:0,kills:0,pendingLv:0,crates:0,items:{},weapons:[],shop:[],rerolls:0,combo:0,comboT:0,bestCombo:0,gemChain:0,lastGem:0,lsCd:0,matBump:0,hpTrail:S.maxHp,time:0,totalMats:0,auraT:0};
  P={x:AW/2,y:AH/2,vx:0,vy:0,r:ch.r||18,hp:S.maxHp,iframes:0,walk:0,moving:false,lx:1,ly:0,level:0,xp:0,regenAcc:0,blink:2};
  const bl=Object.keys(BOSSES); run.finalBoss=pick(bl); const others=bl.filter(x=>x!==run.finalBoss); run.midBoss=pick(others); run.twinBoss=pick(others);
  run.setLv={}; (ch.startW||[ch.weapon]).forEach(w=>addWeapon(w,0));
}
function setCounts(){const c={};for(const w of run.weapons)for(const k of WEAPONS[w.id].sets)c[k]=(c[k]||0)+1;return c}
function setTier(set,n){let t=-1;SETS[set].tiers.forEach(([need],i)=>{if(n>=need)t=i});return t}
function recalc(){
  const c=setCounts(); const next=Object.assign({},B); const fresh=[];
  for(const k in SETS){const t=setTier(k,c[k]||0);if(t>=0)for(const [st,v] of Object.entries(SETS[k].tiers[t][1]))next[st]=(next[st]||0)+v;
    if(t>(run.setLv[k]??-1))fresh.push([k,t]); run.setLv[k]=t; if(t>=1&&!PROF.set4){PROF.set4=1;checkUnlocks()}}
  S=next; if(P)P.hp=Math.min(P.hp,maxHp());
  if(fresh.length&&state==='shop'){const [k,t]=fresh[fresh.length-1];toast(`${SETS[k].name} set (${SETS[k].tiers[t][0]}): ${bonusText(SETS[k].tiers[t][1])}`);sfx('levelup')}
}
function bonusText(m){return Object.entries(m).map(([k,v])=>(v>0?'+':'')+v+(STAT[k][0]==='%'?'':' ')+STAT[k]).join(', ')}
const maxHp=()=>Math.max(1,Math.round(S.maxHp*(1+(S.maxHpPct||0)/100)));
const xpNeed=l=>(l+3)*(l+3);

/* ================= weapons ================= */
const maxW=()=>(run&&run.char.maxW)||6;
function addWeapon(id,tier){
  if(run.weapons.length>=maxW()){const m=run.weapons.find(w=>w.id===id&&w.tier===tier&&tier<3);if(!m)return false;m.tier++;m.flash=1;recalc();return true}
  run.weapons.push({id,tier,cd:rand(.1,.5),aim:-Math.PI/2,ext:0,thrust:null,recoil:0,flash:0,spin:0}); recalc(); if(run.weapons.length>=8&&!PROF.full8){PROF.full8=1;checkUnlocks()} if(run.weapons.length>=6&&!PROF.full6){PROF.full6=1;checkUnlocks()} return true;
}
function canAddWeapon(id,tier){return run.weapons.length<maxW()||run.weapons.some(w=>w.id===id&&w.tier===tier&&tier<3)}
function wDmg(def,t){const base=def.dmg*TIER_DMG[t]+(def.melee?S.melee:S.ranged)*(def.flame||def.spin||def.beam?.4:1);const mul=(1+S.dmg/100)*(def.melee?1:(run.char.rangedMul||1));const cb=S.comboDmg&&run?Math.min(30,Math.floor(run.combo/5)*S.comboDmg)/100:0;return Math.max(1,base*mul*(1+cb))}
function wCd(def,t){const as=S.atkSpd+(run&&run.rageT>0?S.rage:0)+(run&&run.slipT>0?60:0);const a=as>=0?1+as/100:1/(1-as/100);return def.cd*TIER_CD[t]/a}
function wRange(def){return Math.max(60,(def.range+S.range*(def.melee?.5:1))*(def.melee&&run?(run.char.meleeRange||1):1))}
const priceMul=()=>(DZ(4)?1.25:1)*(1-Math.min(45,S.shopDisc||0)/100);
function wPrice(id,t){return Math.round(WEAPONS[id].price*TIER_PRICE[t]*(1+.1*run.wave)*priceMul())}
function iPrice(it){return Math.round(it.price*(1+.1*run.wave)*priceMul())}
function slotPos(i,n){if(n===1)return{x:P.x+P.r+8,y:P.y+4};const a=-Math.PI/2+i/n*TAU+Math.PI/n;const R=P.r+18;return{x:P.x+Math.cos(a)*R,y:P.y+Math.sin(a)*R*.85+4}}
function nearestEnemy(x,y,R,exclude){let best=null,bd=R*R;for(const e of enemies){if(e.dead||e.popT!=null||e.under||(exclude&&exclude.has(e)))continue;const dd=d2(x,y,e.x,e.y)-e.r*e.r;if(dd<bd){bd=dd;best=e}}return best}
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
          for(const e of enemies){if(e.dead||e.popT!=null||e.under)continue;const dd=Math.hypot(e.x-sp.x,e.y-sp.y);if(dd<R+e.r&&angDiff(T.a,Math.atan2(e.y-sp.y,e.x-sp.x))<def.sweep+.15)dealHit(e,T.dmg,def,Math.atan2(e.y-sp.y,e.x-sp.x),def.knock)}
          if(def.sweep>3)fx.push({k:'ring',x:sp.x,y:sp.y,r0:R*.4,r1:R+10,t:0,life:.22,c:'#e8f0ff',w:7});else fx.push({k:'slash',x:sp.x+Math.cos(T.a)*R*.6,y:sp.y+Math.sin(T.a)*R*.6,a:T.a,t:0,life:.18,s:R*1.25})}
      }else{
        w.ext=p<.35?1-Math.pow(1-p/.35,3):Math.max(0,1-(p-.35)/.65);
        const tx=sp.x+Math.cos(T.a)*T.d*w.ext, ty=sp.y+Math.sin(T.a)*T.d*w.ext;
        if(p<.6)for(const e of enemies){
          if(e.dead||e.popT!=null||e.under||T.hit.has(e))continue; let hit=false;
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
  if(def.beam||def.rail){
    const x2=mx+Math.cos(a)*R, y2=my+Math.sin(a)*R, w=def.rail?18:6;
    for(const e of enemies){if(e.dead||e.popT!=null||e.under||e.z>20)continue;if(segDist(e.x,e.y,mx,my,x2,y2)<e.r+w){dealHit(e,dmg,def,a,def.knock);if(def.rail)parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.25,img:'fx_glint',col:'#ffb3c8',s0:20,s1:50,add:1})}}
    fx.push({k:'beam',x1:mx,y1:my,x2,y2,w:def.rail?16:4,col:def.rail?'#ff5d8a':'#7dff6a',t:0,life:def.rail?.32:.09});
    if(def.rail){shake=Math.max(shake,4);muzzle(mx,my,a,1.6)} sfx(def.rail?'rail':'laser'); return;
  }
  if(def.mine){mines.push({x:P.x+rand(-14,14),y:P.y+P.r*.6+rand(-8,8),t:0,arm:.5,life:14,dmg,def});if(mines.length>12)mines.shift();sfx('click');return}
  if(def.disc){const n=1+S.extraProj;for(let i=0;i<n;i++){const ang=a+(n>1?(i/(n-1)-.5)*.5:0);bullets.push({disc:true,x:mx,y:my,vx:Math.cos(ang)*def.speed,vy:Math.sin(ang)*def.speed,dmg,def,life:1.6+.25*w.tier+S.range/400,t:0,hcd:new Map(),r:13,rot:0,bnc:0})}sfx('swing');return}
  if(def.boomer){bullets.push({boomer:true,x:mx,y:my,vx:Math.cos(a)*def.speed,vy:Math.sin(a)*def.speed,spd:def.speed,dmg,def,range:R,trav:0,ret:false,hit:new Set(),r:12,rot:0,a});sfx('swing');return}
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
    bullets.push({x:mx,y:my,vx:Math.cos(ang)*sp2,vy:Math.sin(ang)*sp2,spd:sp2,dmg,def,range:R+40,trav:0,pierce:def.flame?99:(def.pierce||0),hit:new Set(),r:def.blast?7:def.flame?10:4.5,rocket:!!def.blast,cluster:def.cluster||0,flame:!!def.flame,pepper:!!def.pepper,bounce:def.bounce?def.bounce+w.tier:0,a:ang,rot:rand(0,TAU)});
  }
  if(def.flame){sfx(def.pepper?'swing':'flame');return}
  muzzle(mx,my,a,def.pellets?1.4:def.speed>1500?1.5:1);
  sfx({smg:'smg',minigun:'smg',shotgun:'shotgun',rocket:'rocket',cluster:'rocket',sniper:'sniper',bouncer:'bounce'}[w.id]||'shoot');
}
function muzzle(x,y,a,s){
  fx.push({k:'muzzle',x,y,a,t:0,life:.06,s});
  for(let i=0;i<3;i++)parts.push({x,y,vx:Math.cos(a+rand(-.5,.5))*rand(100,260),vy:Math.sin(a+rand(-.5,.5))*rand(100,260),t:0,life:rand(.06,.14),c:'#fff3b0',s:rand(2,4)});
}
function jag(pts){const out=[pts[0]];for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i];for(let k=1;k<4;k++){const t=k/4;out.push({x:lerp(a.x,b.x,t)+rand(-9,9),y:lerp(a.y,b.y,t)+rand(-9,9)})}out.push(b)}return out}

/* ================= combat ================= */
function dealHit(e,dmg,def,ang,knock){
  const crit=Math.random()*100<(def.crit+S.crit); if(crit)PROF.crits++;
  if(crit&&S.critZap){const o=nearestEnemy(e.x,e.y,170,new Set([e]));if(o){const zd=Math.max(1,Math.round(dmg*def.critMul*S.critZap/100));fx.push({k:'zap',pts:jag([{x:e.x,y:e.y},{x:o.x,y:o.y}]),nodes:[{x:o.x,y:o.y}],t:0,life:.15});hurtEnemy(o,zd,false,Math.atan2(o.y-e.y,o.x-e.x),3,false,true)}}
  if(def.exec&&!e.def.isBoss&&e.hp>0&&e.hp<=e.maxHp*def.exec){const was=!e.dead;texts.push({x:e.x,y:e.y-e.r-14,vy:-70,t:0,life:.7,s:20,txt:'EXECUTE',c:'#c9b3ff'});parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,img:'fx_glint',col:'#c9b3ff',s0:24,s1:60,add:1});hurtEnemy(e,Math.ceil(e.hp)+9999,true,ang,knock,false,true);if(was&&e.dead)creditKill(def);return}
  const was=!e.dead; hurtEnemy(e,Math.max(1,Math.round(dmg*(crit?def.critMul:1))),crit,ang,knock,crit&&def.bonk);
  if(crit&&def.quake){booms.push({x:e.x,y:e.y,t:.01,r:75,dmg:Math.round(dmg*.8),knock:14,safe:true,def});shake=Math.max(shake,5)}
  if(def.pepper&&!e.dead&&!e.under){e.psn=Math.max(e.psn||0,2.5);e.psnD=Math.max(e.psnD||0,dmg*2.2)}
  if(def.tender&&!e.dead){e.tendS=Math.min(3,(e.tendT>0?e.tendS:0)+1);e.tendT=4}
  if(was&&e.dead){creditKill(def);if(def.gold&&Math.random()<.3){dropGem(e.x,e.y,1);dropGem(e.x,e.y,1);parts.push({x:e.x,y:e.y,vx:0,vy:-30,t:0,life:.5,img:'fx_glint',col:'#ffd24d',s0:24,s1:56,add:1})}}
}
function hurtEnemy(e,d,crit,ang,knock,bonk,noProc){
  if(e.dead||e.popT!=null)return;
  if(e.bub){e.bub=0;fx.push({k:'ring',x:e.x,y:e.y,r0:e.r*1.2,r1:e.r*2.4,t:0,life:.25,c:'#7fe8ff',w:4});texts.push({x:e.x,y:e.y-e.r,vy:-70,t:0,life:.5,s:16,txt:'POP',c:'#7fe8ff'});sfx('click');return}
  if(e.tendT>0)d=Math.round(d*(1+.12*e.tendS));
  if(S.bossDmg&&(e.elite||e.def.isBoss))d=Math.round(d*(1+S.bossDmg/100));
  if(e.def.armor&&!noProc)d=Math.max(1,Math.ceil(d*.5),d-Math.round(e.def.armor+(e.def.isBoss?0:run.wave*.4)));  // armor never removes more than half a hit
  e.hp-=d; if(!(e.flashCd>0)){e.flash=.07;e.flashCd=.14}
  const kr=e.def.heavy?(e.def.isBoss?.08:.3):1; e.kx+=Math.cos(ang)*knock*kr*14*(bonk?2:1); e.ky+=Math.sin(ang)*knock*kr*14*(bonk?2:1);
  e.sq=1;
  texts.push({x:e.x+rand(-8,8),y:e.y-e.r,vy:-90,t:0,life:crit?.8:.6,s:bonk?30:crit?26:17,txt:bonk?'BONK!':crit?d+'!':''+d,c:bonk?'#ff8a3d':crit?'#ffcc4d':'#ffffff'});
  for(let i=0;i<(crit?6:2);i++)parts.push({x:e.x,y:e.y,vx:Math.cos(ang+rand(-.8,.8))*rand(80,260),vy:Math.sin(ang+rand(-.8,.8))*rand(80,260),t:0,life:rand(.2,.4),c:e.def.col,s:rand(2,4.5),g:300});
  if(crit){parts.push({x:e.x+rand(-6,6),y:e.y-e.r*.4,vx:0,vy:0,t:0,life:.3,img:'fx_glint',col:'#fff4b0',s0:20,s1:46,rot:rand(0,1),add:1});shake=Math.max(shake,2.5)}
  sfx(bonk?'bonk':crit?'crit':'hit');
  if(S.lifesteal>0&&run.lsCd<=0&&Math.random()*100<S.lifesteal){heal(1);run.lsCd=.12}
  if(!noProc&&e.hp>0){
    if(S.freeze&&Math.random()*100<S.freeze){if(!(e.frz>0))parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,img:'fx_glint',col:'#bff4ff',s0:20,s1:50,add:1});e.frz=e.def.isBoss?.5:1}
    if(S.poison){e.psnS=e.psn>0?Math.min(3,(e.psnS||1)+1):1;e.psn=3;e.psnD=S.poison*(1+S.dmg/100)*e.psnS}
  }
  if(e.hp<=0)killEnemy(e,true);
}
function heal(n){const m=maxHp();if(P.hp>=m)return;const h=Math.min(n,m-P.hp);P.hp+=h;PROF.heal+=h;texts.push({x:P.x,y:P.y-34,vy:-70,t:0,life:.7,s:16,txt:'+'+h,c:'#7bd35a'})}

function killEnemy(e,drops){
  if(e.dead)return; e.dead=true;
  const big=e.r>24;
  for(let i=0;i<(big?26:14);i++){const a=rand(0,TAU),s=rand(80,big?420:300);parts.push({x:e.x,y:e.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.3,.7),c:Math.random()<.6?e.def.col:e.def.dark,s:rand(3,big?9:6),g:200,drag:3})}
  for(let i=0;i<(big?4:2);i++)parts.push({x:e.x+rand(-8,8),y:e.y+rand(-8,8),vx:rand(-40,40),vy:rand(-60,-10),t:0,life:rand(.4,.6),img:'fx_puff',col:e.def.col,s0:e.r*1.2,s1:e.r*3,rot:rand(0,TAU),vr:rand(-2,2),a0:.55});
  fx.push({k:'ring',x:e.x,y:e.y,r0:e.r*.6,r1:e.r*2.4,t:0,life:.28,c:e.def.col,w:4});
  splat(e.x,e.y,e.r,e.def.dark);
  sfx('kill');
  if(e.type==='bomber')booms.push({x:e.x,y:e.y,t:.05,r:80,dmg:28+run.wave*3,safe:true});
  if(e.type==='bee'&&webs.length<40)webs.push({honey:1,dmg:0,x:e.x,y:e.y,sx:e.x,sy:e.y,t:0,land:0,life:4,r:36,rot:0,landed:1});
  if(e.loot){let n=e.loot;e.loot=0;while(n>0){const v=Math.min(3,n);n-=v;dropGem(e.x,e.y,v)}texts.push({x:e.x,y:e.y-24,vy:-50,t:0,life:1,s:18,txt:'loot back!',c:'#ffcc4d'})}
  if(!drops)return;
  run.kills++; PROF.kills++; run.combo++; run.comboT=1.4; run.bestCombo=Math.max(run.bestCombo,run.combo); PROF.combo=Math.max(PROF.combo,run.combo);
  if(run.combo%25===0){
    const bonus=Math.floor(run.combo/25)*3;
    for(let i=0;i<bonus;i++)dropGem(P.x+rand(-40,40),P.y+rand(-40,40),1,true);
    texts.push({x:P.x,y:P.y-56,vy:-50,t:0,life:1.2,s:24,txt:run.combo+' COMBO! +'+bonus,c:'#5ef2b0'});
    fx.push({k:'ring',x:P.x,y:P.y,r0:10,r1:140,t:0,life:.4,c:'#5ef2b0',w:5}); sfx('combo');
  }
  let m=e.mats; if(e.def.mc&&Math.random()<e.def.mc)m++; if(S.matChance&&Math.random()*100<S.matChance)m++;
  if(run.char.ketchup&&Math.random()<.3){kpools.push({x:e.x,y:e.y,r:46,t:0,life:3.5,rot:rand(0,TAU)});if(kpools.length>30)kpools.shift()}
  if(S.missile){run.mk=(run.mk||0)+1;if(run.mk>=Math.max(3,8-S.missile)){run.mk=0;fireMissile()}} if(m&&Math.random()<S.luck/200)m++;
  if(m>=8){const b5=Math.floor(m/5);for(let i=0;i<b5;i++)dropGem(e.x,e.y,5);m-=b5*5}
  for(let i=0;i<m;i++)dropGem(e.x,e.y,1);
  if(Math.random()<.025*(1+S.luck/100)*(1+S.lootMul/100))pickups.push({k:'fruit',x:e.x,y:e.y,t:0,vx:rand(-60,60),vy:rand(-60,60)});
  if(e.elite)PROF.elites++;
  PROF.ek=PROF.ek||{}; PROF.ek[e.type]=(PROF.ek[e.type]||0)+1;
  if(e.crate)pickups.push({k:'crate',x:e.x,y:e.y,t:0,vx:0,vy:0});
  if(S.boom>0&&Math.random()*100<S.boom)booms.push({x:e.x,y:e.y,t:.07,r:55,dmg:8+S.dmg*.1+run.wave,safe:true});
  if(e.type==='splitter')for(let k=0;k<2;k++){const m2=makeEnemy('mini',e.x+rand(-6,6),e.y+rand(-6,6));const a=rand(0,TAU);m2.kx=Math.cos(a)*260;m2.ky=Math.sin(a)*260;enemies.push(m2)}
  if(big||e.elite){freezeT=Math.max(freezeT,.06);shake=Math.max(shake,8)}
  if(e.def.isBoss){if(run.bosses.every(b=>b.dead)){if((run.waves[run.wave-1]||{}).mid)midBossDown(e);else bossDown(e)}else{showBanner('ONE DOWN','One more to go',1.6,'#ffcc4d');shake=16;freezeT=.12;for(let k=0;k<4;k++)booms.push({x:e.x+rand(-60,60),y:e.y+rand(-60,60),t:k*.1+.05,r:80,dmg:20,safe:true})}}
}
function stamp(name,col,x,y,size,alpha,rot){const im=tinted(name,col);dctx.save();dctx.globalAlpha=alpha;dctx.translate(x,y);dctx.rotate(rot);dctx.drawImage(im,-size/2,-size/2*im.height/im.width,size,size*im.height/im.width);dctx.restore()}
function splat(x,y,r,col){stamp('fx_splat',col,x,y,r*rand(3,4),.6,rand(0,TAU))}
function clusterPop(b){if(!b.cluster)return;for(let k=0;k<b.cluster;k++){const a=k/b.cluster*TAU+rand(-.4,.4),d=rand(55,85);booms.push({x:b.x+Math.cos(a)*d,y:b.y+Math.sin(a)*d,t:.12+k*.06,r:48,dmg:Math.round(b.dmg*.35),knock:10,safe:true,def:b.def})}}
function explode(x,y,R,dmg,knock,hurtsPlayer,def){
  if(!hurtsPlayer)R*=1+(S.blast||0)/100;
  for(const e of enemies){if(e.dead||e.under)continue;const dd=Math.sqrt(d2(x,y,e.x,e.y));if(dd<R+e.r){const crit=Math.random()*100<S.crit+3;const was=!e.dead;hurtEnemy(e,Math.max(1,Math.round(dmg*(crit?2:1))),crit,Math.atan2(e.y-y,e.x-x),knock);if(was&&e.dead&&dmg>0){PROF.boomK++;if(def)creditKill(def)}}}
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
function fireMissile(){
  const a=rand(0,TAU), def={id:'missilepod',blast:70,knock:16,crit:5,critMul:2,dmg:0};
  bullets.push({x:P.x,y:P.y-10,vx:Math.cos(a)*300,vy:Math.sin(a)*300,spd:520,dmg:Math.round(40*(1+S.dmg/100)+run.wave*3),def,range:1600,trav:0,pierce:0,hit:new Set(),r:7,rocket:true,homing:true,a});
  sfx('rocket');
}
function hurtPlayer(d,src){
  if(P.iframes>0||state!=='wave')return;
  if(Math.random()*100<Math.min(60,S.dodge)){P.iframes=.25;texts.push({x:P.x,y:P.y-34,vy:-80,t:0,life:.6,s:18,txt:'DODGE',c:'#9fd0ff'});sfx('dodge');PROF.dodges=(PROF.dodges||0)+1;if(run.char.slip)run.slipT=2;return}
  if(S.shield&&run.shieldReady){run.shieldReady=false;run.shieldT=8;P.iframes=.5;texts.push({x:P.x,y:P.y-34,vy:-80,t:0,life:.7,s:20,txt:'BLOCKED',c:'#6fe3ff'});fx.push({k:'ring',x:P.x,y:P.y,r0:P.r*1.6,r1:P.r*4,t:0,life:.35,c:'#6fe3ff',w:6});sfx('dodge');return}
  const ar=S.armor; const mul=ar>=0?15/(15+ar):1+(-ar)/15;
  d=Math.max(1,Math.round(d*mul)); if(run.char.capHit)d=Math.min(d,Math.max(1,Math.round(maxHp()*run.char.capHit)));
  run.dmgBy=run.dmgBy||{}; const dk=src?src.type:'shot'; run.dmgBy[dk]=(run.dmgBy[dk]||0)+d;
  PROF.dmgTaken=(PROF.dmgTaken||0)+d;
  if(src&&src.type==='thief'&&!src.dead&&!src.loot){const n=Math.min(run.mats,4+run.wave);if(n>0){run.mats-=n;src.loot=n;src.flee=6;texts.push({x:P.x,y:P.y-56,vy:-60,t:0,life:1,s:20,txt:'-'+n+' MATS',c:'#ffcc4d'});sfx('swing')}}
  P.hp-=d; P.iframes=.75; hurtFlash=1; shake=Math.max(shake,11); freezeT=Math.max(freezeT,.07);
  texts.push({x:P.x,y:P.y-34,vy:-80,t:0,life:.8,s:22,txt:'-'+d,c:'#ff5d6c'});
  for(let i=0;i<12;i++){const a=rand(0,TAU),s=rand(80,240);parts.push({x:P.x,y:P.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.3,.5),c:'#c2185b',s:rand(3,6),g:300})}
  sfx('hurt');
  PROF.hitsTaken=(PROF.hitsTaken||0)+1;
  if(run.char.spines){const sd=Math.round((8+S.thorns*.5)*(1+S.dmg/100)),def={id:'spines',crit:5,critMul:2,knock:8};for(let k=0;k<10;k++){const a=k/10*TAU+rand(0,.3);bullets.push({x:P.x,y:P.y,vx:Math.cos(a)*600,vy:Math.sin(a)*600,spd:600,dmg:sd,def,range:260,trav:0,pierce:1,hit:new Set(),r:4,a})}}
  if(S.rage)run.rageT=4;
  if(S.panic)booms.push({x:P.x,y:P.y,t:.02,r:95,dmg:Math.round(S.panic*(1+S.dmg/100)),safe:true});
  if(S.thorns>0&&src&&!src.dead)hurtEnemy(src,Math.round(S.thorns*(1+S.dmg/200)),false,Math.atan2(src.y-P.y,src.x-P.x),18);
  if(P.hp<=0&&S.revive&&(run.revUsed||0)<S.revive){run.revUsed=(run.revUsed||0)+1;P.hp=Math.ceil(maxHp()*.5);P.iframes=2;showBanner('SECOND WIND','The Spirit Candle flickers',1.4,'#a8b8ff');fx.push({k:'ring',x:P.x,y:P.y,r0:10,r1:180,t:0,life:.6,c:'#a8b8ff',w:8});parts.push({x:P.x,y:P.y,vx:0,vy:0,t:0,life:.7,img:'fx_magic',col:'#a8b8ff',s0:40,s1:160,add:1});sfx('levelup')}
  if(P.hp<=0){P.hp=0;die()}
}

/* ================= enemies ================= */
function waveMul(){const w=run.wave;if(run.len===20)return{hp:1+.32*(w-1)+.018*(w-1)*(w-1),dmg:1+.14*(w-1)};return{hp:1+.36*(w-1)+.035*(w-1)*(w-1),dmg:1+.17*(w-1)}}
function makeEnemy(type,x,y,elite){
  const def=ENEMIES[type]; const m=def.isBoss?{hp:1,dmg:1}:waveMul();
  const e={type,def,x,y,z:0,kx:0,ky:0,hp:def.hp*m.hp,dmg:Math.round(def.dmg*m.dmg),r:def.r,spd:def.spd*rand(.92,1.08),flash:0,t:0,wob:rand(0,TAU),st:'chase',stT:rand(.4,1.2),cool:rand(1,2.5),dead:false,mats:def.mats,sq:0,popT:null,born:0};
  if(elite){e.elite=true;e.hp*=7;e.r*=1.55;e.dmg=Math.round(e.dmg*1.5);e.mats=20;e.crate=true;e.spd*=.9}
  if(type==='lootbug'){e.crate=true;e.life=11}
  if(def.isBoss){e.hp=def.hp;e.st='chase';e.stT=2.5;e.phaseIdx=0;if(run.waves[run.wave-1]&&run.waves[run.wave-1].mid){e.crate=true;e.mats=40}}
  if(type==='hopper'){e.st='idle';e.stT=rand(.3,.9)}
  if(type==='mole'){e.st='under';e.under=true;e.stT=rand(1.5,2.5)}
  if(type==='hive'){e.cool=1.5}
  if(type==='medic'){e.cool=rand(1.5,2.5)}
  if(type==='bulwark'){e.face=Math.atan2(P.y-y,P.x-x)}
  if(['spotter','blinker','phantom','pulser','rhino','webber','sentry','roller','shielder'].includes(type)){e.cool=rand(1.2,2.5);e.st='move';e.stT=rand(1.5,3)}
  if(DZ(1)){e.hp*=1.2;e.dmg=Math.round(e.dmg*1.2)}
  if(DZ(3))e.spd*=1.12;
  if(def.isBoss&&DZ(4))e.hp*=1.4;
  if(def.isBoss&&run.len===20&&!(run.waves[run.wave-1]||{}).mid){e.hp*=2.5;e.dmg=Math.round(e.dmg*1.8)}
  e.maxHp=e.hp; return e;
}
function spawnPoint(minD){for(let i=0;i<30;i++){const x=rand(60,AW-60),y=rand(60,AH-60);if(d2(x,y,P.x,P.y)>minD*minD)return{x,y}}return{x:P.x<AW/2?AW-80:80,y:P.y<AH/2?AH-80:80}}
function introEnemy(type){const inf=ENEMY_INFO[type];if(!inf||PROF.eseen.includes(type))return;PROF.eseen.push(type);saveProf();showBanner('NEW ALIEN: '+inf[0].toUpperCase(),inf[1],2.2,'#45d6e8')}
function blocks(e,x,y){if(e.type!=='bulwark'&&e.type!=='warden')return false;if(e.shDown>0)return false;return angDiff(e.face,Math.atan2(y-e.y,x-e.x))<(e.type==='warden'?1.1:.9)}
function shieldHit(e,dmg){if(e.type!=='warden')return;e.shHp=(e.shHp??250)-dmg;if(e.shHp<=0){e.shDown=6;e.shHp=250;shake=Math.max(shake,8);sfx('boom');texts.push({x:e.x,y:e.y-e.r-10,vy:-50,t:0,life:1.2,s:24,txt:'SHIELD BROKEN!',c:'#9fd0ff'});for(let k=0;k<18;k++){const a=e.face+rand(-1,1);parts.push({x:e.x+Math.cos(e.face)*e.r,y:e.y+Math.sin(e.face)*e.r,vx:Math.cos(a)*rand(100,300),vy:Math.sin(a)*rand(100,300),t:0,life:.6,c:pick(['#b8c4d8','#e8f0ff','#5a6478']),s:rand(3,6),g:300})}}}
function blockFx(x,y){parts.push({x,y,vx:0,vy:0,t:0,life:.18,img:'fx_glint',col:'#cfe8ff',s0:14,s1:34,add:1});for(let k=0;k<3;k++)parts.push({x,y,vx:rand(-120,120),vy:rand(-120,120),t:0,life:.2,c:'#e0e8ff',s:2});sfx('bounce')}
function queueSpawn(type,x,y,elite,delay=.9){spawns.push({type,x,y,elite,t:0,life:delay})}
function updateSpawning(dt){
  const def=run.waves[run.wave-1];
  run.spawnT-=dt;
  const alive=enemies.length+spawns.length;
  if(run.spawnT<=0){
    run.spawnT=def.int*rand(.8,1.2)*(alive>110?2:1);
    const c=spawnPoint(260); const n=Math.round(randi(def.grp[0],def.grp[1])*(DZ(2)?1.25:1));
    for(let i=0;i<n;i++){const t=weighted(def.mix);const k=t==='gnat'?6:1;for(let j=0;j<k;j++)queueSpawn(t,clamp(c.x+rand(-70,70),40,AW-40),clamp(c.y+rand(-70,70),40,AH-40),false,.9+i*.05+j*.03)}
  }
  const ne=(def.elite===true?1:(def.elite||0))+(DZ(2)&&run.wave>=3&&!def.boss&&!def.elite?1:0);
  if(run.eliteN<ne&&run.timer<def.dur*(1-(run.eliteN+1)/(ne+1))){run.eliteN++;const c=spawnPoint(300);queueSpawn('brute',c.x,c.y,true,1.4);showBanner('ELITE INCOMING','Drops a crate',.9,'#ffcc4d')}
  if(def.hive&&run.hiveN<def.hive&&run.timer<def.dur*(1-(run.hiveN+1)/(def.hive+1.5))){run.hiveN++;const c=spawnPoint(320);queueSpawn('hive',c.x,c.y,false,1.4)}
  if(def.bug&&run.bugT>0){run.bugT-=dt;if(run.bugT<=0){const c=spawnPoint(250);queueSpawn('lootbug',c.x,c.y,false,.6)}}
  if(def.boss&&run.bossT>0){run.bossT-=dt;if(run.bossT<=0){
    const list=def.mid?[run.midBoss]:DZ(5)?[run.finalBoss,run.twinBoss]:[run.finalBoss];
    list.forEach((t,k)=>queueSpawn(t,list.length>1?AW*(.3+.4*k):AW/2,AH*.25,false,2+k*.3));
    const b=BOSSES[list[0]];
    showBanner(list.length>1?'DOUBLE TROUBLE':b.name.toUpperCase(),list.length>1?list.map(bossName).join(' + '):def.mid?'Halfway boss! '+b.sub:b.sub,1.8,'#ff6b9d');sfx('roar');shake=14}}
  for(let i=spawns.length-1;i>=0;i--){const s=spawns[i];s.t+=dt;if(s.t>=s.life){spawns.splice(i,1);const e=makeEnemy(s.type,s.x,s.y,s.elite);enemies.push(e);introEnemy(s.type);if(e.def.isBoss){run.boss=e;run.bosses.push(e)}parts.push({x:s.x,y:s.y,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#d8c8e0',s0:e.r*1.5,s1:e.r*3.2,rot:rand(0,TAU),a0:.5})}}
}
function updateEnemies(dt){
  const ending=state!=='wave';
  for(const e of enemies){
    if(e.dead)continue;
    e.t+=dt; e.born+=dt; e.flash-=dt; e.flashCd-=dt; e.sq=Math.max(0,e.sq-dt*6);
    if(e.popT!=null){e.popT-=dt;e.flash=.05;if(e.popT<=0)killEnemy(e,false);continue}
    if(e.psn>0){e.psn-=dt;e.psnT=(e.psnT||0)-dt;if(e.psnT<=0){e.psnT=.5;if(Math.random()<.6)parts.push({x:e.x+rand(-e.r,e.r)*.6,y:e.y-e.r*.3,vx:0,vy:-40,t:0,life:.5,c:'#7dff4a',s:3,fade:1});hurtEnemy(e,Math.max(1,Math.round(e.psnD*.5)),false,0,0,false,true);if(e.dead)continue}}
    const frozen=e.frz>0; if(frozen)e.frz-=dt;
    if(e.tendT>0)e.tendT-=dt;
    const dx=P.x-e.x,dy=P.y-e.y,d=Math.hypot(dx,dy)||1,nx=dx/d,ny=dy/d;
    let mx=0,my=0;
    if(!ending&&!frozen)switch(e.type){
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
      case 'bking':{const r=bkingAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'otitan':{const r=otitanAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'slord':{const r=slordAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'warden':{const r=wardenAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'wraith':{const r=wraithAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'watcher':{const r=watcherAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'hqueen':{const r=hqueenAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'wmother':{const r=wmotherAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'fortress':{const r=fortressAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'rampager':{const r=rampagerAI(e,dt,nx,ny,d);mx=r[0];my=r[1];break}
      case 'gnat':{const w=Math.sin(e.t*7+e.wob)*.85;mx=(nx-ny*w)*e.spd;my=(ny+nx*w)*e.spd;break}
      case 'oozer':
        mx=nx*e.spd;my=ny*e.spd;e.cool-=dt;
        if(e.cool<=0){e.cool=.55;pools.push({x:e.x+rand(-4,4),y:e.y+e.r*.4,r:24,t:0,life:4,dmg:Math.max(2,Math.round(e.dmg*.8)),rot:rand(0,TAU)})}
        break;
      case 'mole':
        if(e.st==='under'){e.under=true;mx=nx*e.spd;my=ny*e.spd;e.stT-=dt;if(Math.random()<.6)parts.push({x:e.x+rand(-10,10),y:e.y+rand(-4,8),vx:rand(-40,40),vy:rand(-70,-20),t:0,life:.4,c:pick(['#6b5444','#4a3828','#8a7060']),s:rand(2,4),g:300});if(d<30||e.stT<=0){e.st='rise';e.stT=.7;sfx('fuse')}}
        else if(e.st==='rise'){e.stT-=dt;if(e.stT<=0){e.st='up';e.under=false;e.stT=2.8;e.sq=1;shake=Math.max(shake,5);sfx('hop');
          fx.push({k:'ring',x:e.x,y:e.y,r0:10,r1:70,t:0,life:.3,c:'#a08060',w:6});parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.45,img:'fx_puff',col:'#8a7060',s0:30,s1:90,rot:rand(0,TAU),a0:.6});
          if(state==='wave'&&Math.hypot(P.x-e.x,P.y-e.y)<62+P.r)hurtPlayer(e.dmg,e)}}
        else{mx=nx*e.spd*.35;my=ny*e.spd*.35;e.stT-=dt;if(e.stT<=0){e.st='under';e.under=true;e.stT=rand(2,3);parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#8a7060',s0:20,s1:50,a0:.5})}}
        break;
      case 'medic':{
        const side=e.wob>Math.PI?1:-1;
        if(d>340){mx=nx*e.spd;my=ny*e.spd}else if(d<240){mx=-nx*e.spd;my=-ny*e.spd}else{mx=-ny*e.spd*.5*side;my=nx*e.spd*.5*side}
        e.cool-=dt; if(e.pulse>0)e.pulse-=dt;
        if(e.cool<=0){e.cool=2.6;e.pulse=.5;let n=0;
          for(const o of enemies){if(o===e||o.dead||o.popT!=null||o.def.isBoss||o.hp>=o.maxHp)continue;if(Math.hypot(o.x-e.x,o.y-e.y)<170){const h=Math.max(1,Math.round(o.maxHp*.25));o.hp=Math.min(o.maxHp,o.hp+h);n++;texts.push({x:o.x,y:o.y-o.r,vy:-60,t:0,life:.6,s:15,txt:'+'+h,c:'#7bd35a'});parts.push({x:o.x,y:o.y-o.r,vx:0,vy:-40,t:0,life:.6,img:'fx_heart',col:'#7bd35a',s0:12,s1:6,add:1})}}
          fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:170,t:0,life:.45,c:'#7bd35a',w:5}); if(n)sfx('heal')}
        break}
      case 'bulwark':{const want=Math.atan2(dy,dx);e.face=angLerp(e.face,want,Math.min(1,dt*1.6));mx=nx*e.spd;my=ny*e.spd;break}
      case 'spotter':
        if(e.st==='move'){e.stT-=dt;if(d>480){mx=nx*e.spd;my=ny*e.spd}else if(d<360){mx=-nx*e.spd;my=-ny*e.spd}else{const sd=e.wob>Math.PI?1:-1;mx=-ny*e.spd*.6*sd;my=nx*e.spd*.6*sd}
          if(e.stT<=0&&d<620){e.st='aim';e.stT=1.1;e.aimA=Math.atan2(dy,dx);sfx('fuse')}}
        else{e.stT-=dt;if(e.stT>.25)e.aimA=angLerp(e.aimA,Math.atan2(dy,dx),Math.min(1,dt*5));
          if(e.stT<=0){ebullets.push({x:e.x+Math.cos(e.aimA)*e.r,y:e.y+Math.sin(e.aimA)*e.r,vx:Math.cos(e.aimA)*720,vy:Math.sin(e.aimA)*720,r:6,dmg:e.dmg+3,t:0,c:'#ff3b5c'});sfx('sniper');e.st='move';e.stT=rand(2.4,3.4)}}
        break;
      case 'blinker':
        e.cool-=dt;
        if(e.st==='lunge'){e.stT-=dt;mx=nx*e.spd*1.9;my=ny*e.spd*1.9;if(e.stT<=0)e.st='move'}
        else if(e.st==='pause'){e.stT-=dt;if(e.stT<=0){e.st='lunge';e.stT=1}}
        else{mx=nx*e.spd*.6;my=ny*e.spd*.6;if(e.cool<=0&&d>110){const a=rand(0,TAU),L=rand(95,140);parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#c08bff',s0:20,s1:55,a0:.7});
          e.x=clamp(P.x+Math.cos(a)*L,e.r,AW-e.r);e.y=clamp(P.y+Math.sin(a)*L,e.r,AH-e.r);parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#c08bff',s0:20,s1:55,a0:.7});
          e.kx=e.ky=0;e.st='pause';e.stT=.4;e.cool=rand(3,4.2);sfx('hop')}}
        break;
      case 'phantom':
        e.stT-=dt; mx=nx*e.spd*(e.ghost?1.5:1); my=ny*e.spd*(e.ghost?1.5:1);
        if(e.stT<=0){e.ghost=!e.ghost;e.under=e.ghost;e.stT=e.ghost?1.6:2.6;parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#e8e0ff',s0:18,s1:44,a0:.5})}
        break;
      case 'pulser':
        e.cool-=dt;
        if(e.st==='charge'){e.stT-=dt;e.swell=Math.max(.001,e.stT*.6);if(e.stT<=0){e.st='move';e.swell=0;rings.push({x:e.x,y:e.y,r:e.r,max:240,spd:230,w:16,dmg:e.dmg,hit:false});sfx('boom');e.sq=1}}
        else{if(d>200){mx=nx*e.spd;my=ny*e.spd}if(e.cool<=0&&d<320){e.st='charge';e.stT=.7;e.cool=rand(3.6,4.6)}}
        break;
      case 'rhino':
        e.cool-=dt;
        if(e.st==='move'){mx=nx*e.spd;my=ny*e.spd;if(d<320&&e.cool<=0){e.st='wind';e.stT=.7;e.da=Math.atan2(dy,dx)}}
        else if(e.st==='wind'){e.stT-=dt;e.da=angLerp(e.da,Math.atan2(dy,dx),dt*3);if(e.stT<=0){e.st='dash';e.stT=.5}}
        else if(e.st==='dash'){e.stT-=dt;mx=Math.cos(e.da)*640;my=Math.sin(e.da)*640;if(Math.random()<.5)parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#a09080',s0:10,s1:28,a0:.4});if(e.stT<=0){e.st='rest';e.stT=.6}}
        else{e.stT-=dt;if(e.stT<=0){e.st='move';e.cool=rand(2.2,3)}}
        break;
      case 'bee':
        e.cool=(e.cool==null?rand(1,2):e.cool)-dt;
        if(e.st==='wind'){e.stT-=dt;if(e.stT<=0){e.st='dash';e.stT=.38}}
        else if(e.st==='dash'){e.stT-=dt;mx=Math.cos(e.da)*520;my=Math.sin(e.da)*520;if(e.stT<=0){e.st='move';e.cool=rand(2,2.8)}}
        else{const w=Math.sin(e.t*6+e.wob)*.9;mx=(nx-ny*w)*e.spd;my=(ny+nx*w)*e.spd;if(e.cool<=0&&d<250){e.st='wind';e.stT=.35;e.da=Math.atan2(dy,dx)}}
        break;
      case 'webber':{
        const sd=e.wob>Math.PI?1:-1; if(d>400){mx=nx*e.spd;my=ny*e.spd}else if(d<260){mx=-nx*e.spd;my=-ny*e.spd}else{mx=-ny*e.spd*.6*sd;my=nx*e.spd*.6*sd}
        e.cool-=dt; if(e.cool<=0&&d<540){e.cool=rand(3.8,4.8);e.sq=1;webs.push({dmg:Math.max(1,Math.round(e.dmg*.5)),x:clamp(P.x+P.vx*.4,30,AW-30),y:clamp(P.y+P.vy*.4,30,AH-30),sx:e.x,sy:e.y,t:0,land:.7,life:6,r:54,rot:rand(0,TAU)});sfx('lob')}
        break}
      case 'thief':
        if(e.loot){e.flee-=dt;mx=-nx*e.spd*1.05;my=-ny*e.spd*1.05;if(e.x<90)mx+=140;if(e.x>AW-90)mx-=140;if(e.y<90)my+=140;if(e.y>AH-90)my-=140;
          if(Math.random()<.3)parts.push({x:e.x+rand(-8,8),y:e.y+rand(-8,8),vx:0,vy:-20,t:0,life:.4,img:'fx_star',col:'#ffe066',s0:9,s1:2,add:1});
          if(e.flee<=0){e.dead=true;texts.push({x:e.x,y:e.y-20,vy:-40,t:0,life:1.2,s:18,txt:'got away with '+e.loot+'!',c:'#ff8a3d'});parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.4,img:'fx_puff',col:'#ffffff',s0:20,s1:60,a0:.7})}}
        else{const w=Math.sin(e.t*4+e.wob)*.4;mx=(nx-ny*w)*e.spd;my=(ny+nx*w)*e.spd}
        break;
      case 'sentry':
        if(e.st==='move'){e.stT-=dt;if(d>420){mx=nx*e.spd;my=ny*e.spd}else if(d<280){mx=-nx*e.spd;my=-ny*e.spd}else{const sd=e.wob>Math.PI?1:-1;mx=-ny*e.spd*.5*sd;my=nx*e.spd*.5*sd}
          if(e.stT<=0&&d<560){e.st='plant';e.stT=6;e.cool=.6;e.burst=0;e.sq=1;sfx('hop');parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#a09080',s0:e.r,s1:e.r*2.4,a0:.45})}}
        else{e.kx=e.ky=0;e.stT-=dt;e.cool-=dt;e.bT=(e.bT||0)-dt;
          if(e.cool<=0){e.cool=2.2;e.burst=3}
          if(e.burst>0&&e.bT<=0){e.burst--;e.bT=.14;const a=Math.atan2(dy,dx)+rand(-.06,.06);ebullets.push({x:e.x+Math.cos(a)*e.r,y:e.y+Math.sin(a)*e.r,vx:Math.cos(a)*420,vy:Math.sin(a)*420,r:7,dmg:e.dmg,t:0,c:'#ff9a3d'});sfx('shoot');e.sq=.6}
          if(e.stT<=0){e.st='move';e.stT=rand(1.5,2.5)}}
        break;
      case 'roller':
        e.cool-=dt;
        if(e.st==='move'){mx=nx*e.spd;my=ny*e.spd;if(e.cool<=0&&d<420){e.st='wind';e.stT=.6}}
        else if(e.st==='wind'){e.stT-=dt;if(e.stT<=0){const a=Math.atan2(dy,dx);e.st='roll';e.stT=2.4;e.rvx=Math.cos(a)*470;e.rvy=Math.sin(a)*470;sfx('swing')}}
        else if(e.st==='roll'){e.stT-=dt;e.kx=e.ky=0;
          if(e.x<=e.r+1&&e.rvx<0||e.x>=AW-e.r-1&&e.rvx>0){e.rvx=-e.rvx;e.sq=1;sfx('bounce')}
          if(e.y<=e.r+1&&e.rvy<0||e.y>=AH-e.r-1&&e.rvy>0){e.rvy=-e.rvy;e.sq=1;sfx('bounce')}
          mx=e.rvx;my=e.rvy;if(Math.random()<.4)parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#9adf9a',s0:8,s1:22,a0:.4});
          if(e.stT<=0){e.st='rest';e.stT=.8}}
        else{e.stT-=dt;if(e.stT<=0){e.st='move';e.cool=rand(2.5,3.5)}}
        break;
      case 'shielder':{
        const sd=e.wob>Math.PI?1:-1; if(d>330){mx=nx*e.spd;my=ny*e.spd}else if(d<220){mx=-nx*e.spd;my=-ny*e.spd}else{mx=-ny*e.spd*.5*sd;my=nx*e.spd*.5*sd}
        e.cool-=dt; if(e.pulse>0)e.pulse-=dt;
        if(e.cool<=0){e.cool=4;e.pulse=.5;let n=0;const near=enemies.filter(o=>o!==e&&!o.dead&&o.popT==null&&!o.def.isBoss&&o.type!=='shielder'&&!o.bub&&Math.hypot(o.x-e.x,o.y-e.y)<200).sort((a,b)=>d2(a.x,a.y,e.x,e.y)-d2(b.x,b.y,e.x,e.y));
          for(const o of near.slice(0,4)){o.bub=1;n++;parts.push({x:o.x,y:o.y,vx:0,vy:0,t:0,life:.3,img:'fx_glow',col:'#7fe8ff',s0:o.r,s1:o.r*2.6,add:1})}
          fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:200,t:0,life:.45,c:'#7fe8ff',w:5}); if(n)sfx('zap')}
        break}
      case 'berserker':{
        const rage=1-Math.max(0,e.hp)/e.maxHp; const k=1+rage*1.8; mx=nx*e.spd*k; my=ny*e.spd*k;
        if(rage>.5&&Math.random()<.25)parts.push({x:e.x+rand(-10,10),y:e.y-e.r*.8,vx:rand(-20,20),vy:rand(-80,-40),t:0,life:.4,img:'fx_puff',col:'#ff6a6a',s0:6,s1:16,a0:.5});
        break}
      case 'hive':
        e.kx=e.ky=0; e.cool-=dt;
        if(e.cool<=0){e.cool=3.4;e.sq=1;if(enemies.length<130)for(let k=0;k<3;k++){const g=makeEnemy('gnat',e.x+rand(-15,15),e.y+rand(-15,15));const a=rand(0,TAU);g.kx=Math.cos(a)*240;g.ky=Math.sin(a)*240;enemies.push(g)}
          parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#ffd96a',s0:20,s1:60,a0:.5});introEnemy('gnat')}
        break;
    }
    if(S.slow){const k=1-Math.min(50,S.slow)/100;mx*=k;my*=k}
    if(kpools.length&&!e.def.isBoss){for(const q of kpools){if(d2(q.x,q.y,e.x,e.y)<q.r*q.r){mx*=.55;my*=.55;break}}}
    e.kx*=Math.exp(-dt*9); e.ky*=Math.exp(-dt*9);
    if(e.type!=='hopper'||e.st==='idle'){e.x+=(mx+e.kx)*dt;e.y+=(my+e.ky)*dt}
    e.x=clamp(e.x,e.r,AW-e.r); e.y=clamp(e.y,e.r,AH-e.r);
    if(!ending&&!frozen&&e.dmg>0&&e.z<12&&!e.under&&d<e.r+P.r-4)hurtPlayer(e.dmg,e);
  }
  const n=enemies.length;
  for(let i=0;i<n;i++){const a=enemies[i];if(a.dead||a.z>5||a.under)continue;for(let j=i+1;j<n;j++){const b=enemies[j];if(b.dead||b.z>5||b.under)continue;const dx=b.x-a.x,dy=b.y-a.y,rr=a.r+b.r;if(dx>rr||dx<-rr||dy>rr||dy<-rr)continue;const dd=dx*dx+dy*dy;if(dd<rr*rr&&dd>.01){const D=Math.sqrt(dd),o=(rr-D)*.5,ux=dx/D,uy=dy/D;const wa=a.def.heavy&&!b.def.heavy?.2:b.def.heavy&&!a.def.heavy?1.8:1;a.x-=ux*o*wa;a.y-=uy*o*wa;b.x+=ux*o*(2-wa);b.y+=uy*o*(2-wa)}}}
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
  if(run.char.grow&&n>1){B.dmg+=7;B.maxHp+=2;recalc()}
  PROF.best=Math.max(PROF.best,n); store.set('bd_best',PROF.best);
  run.wave=n; const def=run.waves[n-1];
  run.timer=def.dur; run.spawnT=.5; run.shieldReady=true; run.shieldT=0; run.revUsed=0; run.droneT=0; run.bombT=3; run.sawA=0; run.rageT=0; run.rodT=1.5; run.eliteN=0; run.hiveN=0; run.bugT=def.bug?rand(def.dur*.25,def.dur*.6):-1; run.bossT=def.boss?1.5:-1; run.boss=null; run.bosses=[];
  run.combo=0; run.comboT=0; run.rerolls=0;
  webs=[];kpools=[];rings=[];mines=[];marks=[];pools=[];enemies=[];bullets=[];ebullets=[];gems=[];pickups=[];parts=[];texts=[];fx=[];spawns=[];booms=[];
  dctx.clearRect(0,0,AW,AH);
  P.x=AW/2;P.y=AH/2;P.vx=P.vy=0;P.hp=maxHp();P.iframes=1;run.hpTrail=P.hp;
  run.weapons.forEach(w=>{w.cd=rand(.2,.6);w.thrust=null;w.ext=0;w.spin=0});
  state='wave'; showUI(null);
  showBanner('WAVE '+n,def.mid?'Halfway boss!':def.boss?'Final wave':n===1?'Survive '+def.dur+' seconds':'',1.6,'#ffffff'); sfx('wave');
}
function endWave(){
  state='waveEnd'; run.endT=0;
  for(const e of enemies)if(!e.dead)e.popT=rand(.05,.75);
  for(const b of ebullets)parts.push({x:b.x,y:b.y,vx:0,vy:0,t:0,life:.25,c:b.c,s:b.r,fade:1});
  ebullets=[];spawns=[];bullets=[];booms=[];for(const q of pools)q.life=Math.min(q.life,q.t+.4);marks=[];mines=[];rings=[];kpools=[];webs=[];
  for(const g of gems)g.vac=true;
  showBanner('WAVE CLEARED','',1.4,'#7bd35a'); sfx('clear');
}
function afterWave(){
  if(S.harvest>0){run.mats+=Math.round(S.harvest);run.totalMats+=Math.round(S.harvest);B.harvest=Math.round(B.harvest*1.05*10)/10;recalc()}
  run.lastInterest=0; if(S.interest>0){const g=Math.min(30*(run.items.piggy||1),Math.floor(run.mats*S.interest/100));run.mats+=g;run.totalMats+=g;run.lastInterest=g}
  saveProf(); checkUnlocks();
  nextStep();
}
function nextStep(){if(run.pendingLv>0)showLevelUp();else if(run.crates>0)showCrate();else openShop()}
function die(){state='dying';run.endT=0;timeScale=.3;sfx('boom');for(let i=0;i<40;i++){const a=rand(0,TAU),s=rand(100,500);parts.push({x:P.x,y:P.y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,t:0,life:rand(.5,1.2),c:pick(['#e0336f','#9c1d4f','#7bd35a']),s:rand(3,8),g:200,drag:2})}parts.push({x:P.x,y:P.y,vx:0,vy:0,t:0,life:.8,img:'fx_puff',col:'#e9d8ef',s0:30,s1:110,a0:.7})}
function ring(e,k,spd,r,dmg,col,off=0){for(let i=0;i<k;i++){const a=off+i/k*TAU;ebullets.push({x:e.x+Math.cos(a)*e.r*.8,y:e.y+Math.sin(a)*e.r*.8,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,r,dmg,t:0,c:col})}}
function fan(e,k,spr,spd,r,dmg,col){const a0=Math.atan2(P.y-e.y,P.x-e.x);for(let i=0;i<k;i++){const a=a0+(i-(k-1)/2)*spr;ebullets.push({x:e.x+Math.cos(a)*e.r*.7,y:e.y+Math.sin(a)*e.r*.7,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,r,dmg,t:0,c:col})}}
function bkingAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['burrow','rocks','burrow','summon'];
  switch(e.st){
    case 'chase': mx=nx*e.spd;my=ny*e.spd;
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='burrow'){e.under=true;e.stT=ph2?2:2.6;parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.5,img:'fx_puff',col:'#8a7060',s0:60,s1:160,a0:.6});sfx('hop')}
        else if(e.st==='rocks'){e.stT=2;e.volT=.2}else e.stT=.9}
      break;
    case 'burrow': mx=nx*e.spd*2.3;my=ny*e.spd*2.3;
      if(Math.random()<.8)parts.push({x:e.x+rand(-30,30),y:e.y+rand(-6,12),vx:rand(-60,60),vy:rand(-110,-40),t:0,life:.45,c:pick(['#6b5444','#4a3828','#8a7060']),s:rand(3,6),g:350});
      if(e.stT<=0||d<40){e.st='rise';e.stT=e.riseT0=.9;sfx('fuse')}
      break;
    case 'rise': if(e.stT<=0){e.under=false;e.sq=1;shake=16;sfx('boom');
        fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:150,t:0,life:.4,c:'#a08060',w:9});parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.55,img:'fx_puff',col:'#8a7060',s0:80,s1:230,rot:rand(0,TAU),a0:.7});
        if(state==='wave'&&Math.hypot(P.x-e.x,P.y-e.y)<110+P.r)hurtPlayer(e.dmg+4,e);
        ring(e,ph2?24:18,240,9,7,'#b0906e',rand(0,1)); e.st='chase';e.stT=ph2?1.4:2}
      break;
    case 'rocks': e.volT-=dt; if(e.volT<=0){e.volT=ph2?.4:.5;fan(e,ph2?9:7,.15,290,10,7,'#b0906e');e.sq=1;sfx('shotgun')} if(e.stT<=0){e.st='chase';e.stT=1.8} break;
    case 'summon': if(e.stT<=0){const k=ph2?5:4;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn('mole',clamp(e.x+Math.cos(a)*130,40,AW-40),clamp(e.y+Math.sin(a)*130,40,AH-40),false,.5)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function otitanAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['rain','wave','summon','rain','wave'];
  e.poolT=(e.poolT||0)-dt; if(e.poolT<=0){e.poolT=ph2?.3:.42;pools.push({x:e.x+rand(-24,24),y:e.y+e.r*.5,r:40,t:0,life:5,dmg:6,rot:rand(0,TAU)})}
  switch(e.st){
    case 'chase': mx=nx*e.spd*(ph2?1.3:1);my=ny*e.spd*(ph2?1.3:1);
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='rain'){const k=ph2?10:8;for(let i=0;i<k;i++){const x=i?P.x+rand(-170,170):P.x,y=i?P.y+rand(-130,130):P.y;marks.push({x:clamp(x,30,AW-30),y:clamp(y,30,AH-30),r:50,t:-i*.12,life:1.1,dmg:8})}e.stT=1.4;e.sq=1;sfx('lob')}
        else if(e.st==='wave'){e.stT=1.6;e.vol=0;e.volT=0}else e.stT=.9}
      break;
    case 'rain': mx=nx*e.spd*.4;my=ny*e.spd*.4; if(e.stT<=0){e.st='chase';e.stT=ph2?1.5:2.1} break;
    case 'wave': e.volT-=dt; if(e.volT<=0){e.volT=.7;ring(e,ph2?22:18,145,13,7,'#7dff4a',e.vol++*.2);e.sq=1;sfx('lob')} if(e.stT<=0){e.st='chase';e.stT=1.8} break;
    case 'summon': if(e.stT<=0){for(let i=0;i<(ph2?4:3);i++){const a=i/3*TAU;queueSpawn('oozer',clamp(e.x+Math.cos(a)*120,40,AW-40),clamp(e.y+Math.sin(a)*120,40,AH-40),false,.5)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function slordAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['dash','fan','swarm','dash','fan'];
  switch(e.st){
    case 'chase':{const side=e.wob>Math.PI?1:-1;if(d>280){mx=nx*e.spd;my=ny*e.spd}else{mx=(-ny*side*.9-nx*.2)*e.spd;my=(nx*side*.9-ny*.2)*e.spd}
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='dash'){e.dn=ph2?5:4;e.st='aim';e.stT=.55;e.da=Math.atan2(ny,nx)}
        else if(e.st==='fan'){e.stT=1.8;e.volT=.15}else e.stT=.6}
      break}
    case 'aim': e.da=angLerp(e.da,Math.atan2(ny,nx),dt*2.5);e.shk=1; if(e.stT<=0){e.st='dashing';e.stT=.42;e.shk=0;sfx('swing')} break;
    case 'dashing': mx=Math.cos(e.da)*950;my=Math.sin(e.da)*950;
      if(Math.random()<.8)parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.3,c:e.def.col,s:e.r*.45,fade:1});
      if(e.stT<=0||e.x<=e.r+2||e.x>=AW-e.r-2||e.y<=e.r+2||e.y>=AH-e.r-2){e.dn--;shake=Math.max(shake,5);if(e.dn>0){e.st='aim';e.stT=.5}else{e.st='chase';e.stT=1.8}}
      break;
    case 'fan': e.volT-=dt; if(e.volT<=0){e.volT=.45;fan(e,ph2?11:9,.13,290,8,7,'#45d6e8');e.sq=1;sfx('smg')} if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'swarm': if(e.stT<=0){const k=ph2?14:10;if(enemies.length<140)for(let i=0;i<k;i++){const g=makeEnemy('gnat',e.x+rand(-20,20),e.y+rand(-20,20));const a=i/k*TAU;g.kx=Math.cos(a)*300;g.ky=Math.sin(a)*300;enemies.push(g)}introEnemy('gnat');e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function wardenAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['slam','charge','slam','summon'];
  if(e.face==null)e.face=Math.atan2(ny,nx);
  if(e.shDown>0)e.shDown-=dt;
  if(ph2)e.face+=dt*1.8; else e.face=angLerp(e.face,Math.atan2(ny,nx),Math.min(1,dt*.8));
  switch(e.st){
    case 'chase': mx=nx*e.spd;my=ny*e.spd;
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];if(e.st==='slam'){e.stT=.8;e.n=ph2?2:1}else if(e.st==='charge'){e.stT=.8;e.da=Math.atan2(ny,nx)}else e.stT=.9}
      break;
    case 'slam': e.swell=Math.max(.001,e.stT*.5);
      if(e.stT<=0){e.swell=0;rings.push({x:e.x,y:e.y,r:e.r,max:340,spd:260,w:20,dmg:Math.round(e.dmg*.7),hit:false});shake=14;sfx('boom');e.sq=1;fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:130,t:0,life:.35,c:'#a09080',w:8});if(--e.n>0)e.stT=.5;else{e.st='chase';e.stT=1.8}}
      break;
    case 'charge':
      if(e.stT>0){e.shk=1;e.da=angLerp(e.da,Math.atan2(ny,nx),dt*2.5)}
      else{e.shk=0;mx=Math.cos(e.da)*680;my=Math.sin(e.da)*680;if(Math.random()<.6)parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#a09080',s0:20,s1:50,a0:.45});
        if(e.stT<-.6||e.x<=e.r+2||e.x>=AW-e.r-2||e.y<=e.r+2||e.y>=AH-e.r-2){shake=10;sfx('boom');e.st='chase';e.stT=1.6}}
      break;
    case 'summon': if(e.stT<=0){const k=ph2?5:4;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(i===0?'bulwark':i%2?'dasher':'grub',clamp(e.x+Math.cos(a)*140,40,AW-40),clamp(e.y+Math.sin(a)*140,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function wraithAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['fade','orbs','fade','summon','orbs'];
  switch(e.st){
    case 'chase':{const sd=e.wob>Math.PI?1:-1;if(d>300){mx=nx*e.spd;my=ny*e.spd}else{mx=-ny*e.spd*.8*sd;my=nx*e.spd*.8*sd}
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='fade'){e.ghost=true;e.under=true;e.stT=1.3;parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.4,img:'fx_puff',col:'#c08bff',s0:50,s1:130,a0:.6});sfx('hop')}
        else if(e.st==='orbs'){e.stT=1.6;e.volT=.1}else e.stT=.9}
      break}
    case 'fade': mx=nx*e.spd*.5;my=ny*e.spd*.5;
      if(e.stT<=0){const a=rand(0,TAU),L=rand(240,340);e.x=clamp(P.x+Math.cos(a)*L,e.r,AW-e.r);e.y=clamp(P.y+Math.sin(a)*L,e.r,AH-e.r);e.kx=e.ky=0;e.ghost=false;e.under=false;
        parts.push({x:e.x,y:e.y,vx:0,vy:0,t:0,life:.4,img:'fx_puff',col:'#c08bff',s0:50,s1:130,a0:.6});sfx('zap');ring(e,ph2?18:14,180,8,7,'#c08bff',rand(0,1));e.st='chase';e.stT=ph2?1.4:2}
      break;
    case 'orbs': e.volT-=dt; if(e.volT<=0){e.volT=.5;const k=ph2?5:4,a0=Math.atan2(ny,nx);for(let i=0;i<k;i++){const a=a0+(i-(k-1)/2)*.5;ebullets.push({x:e.x+Math.cos(a)*e.r*.7,y:e.y+Math.sin(a)*e.r*.7,vx:Math.cos(a)*150,vy:Math.sin(a)*150,r:10,dmg:9,t:0,c:'#c08bff',home:true})}sfx('zap');e.sq=1} if(e.stT<=0){e.st='chase';e.stT=1.8} break;
    case 'summon': if(e.stT<=0){const k=ph2?5:4;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(i%2?'blinker':'phantom',clamp(e.x+Math.cos(a)*130,40,AW-40),clamp(e.y+Math.sin(a)*130,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function hqueenAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['stinger','honey','swarm','stinger','decree'];
  const sd=e.wob>Math.PI?1:-1; if(d>330){mx=nx*e.spd;my=ny*e.spd}else if(d<220){mx=-nx*e.spd*.6;my=-ny*e.spd*.6}else{mx=-ny*e.spd*.7*sd;my=nx*e.spd*.7*sd} my+=Math.sin(e.t*2)*30;
  switch(e.st){
    case 'chase': if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='stinger'){e.stT=1.5;e.volT=.15}
        else if(e.st==='honey'){const k=ph2?7:5;for(let i=0;i<k;i++){const x=i?P.x+rand(-200,200):P.x,y=i?P.y+rand(-150,150):P.y;webs.push({honey:1,dmg:6,x:clamp(x,40,AW-40),y:clamp(y,40,AH-40),sx:e.x,sy:e.y,t:-i*.1,land:.8,life:6,r:60,rot:0})}e.stT=1.2;e.sq=1;sfx('lob')}
        else if(e.st==='decree'){e.stT=ph2?3:2.4;e.volT=0;e.vol=0;showBanner('ROYAL DECREE','',.8,'#ffcc4d');sfx('roar')}
        else e.stT=.9}
      break;
    case 'stinger': e.volT-=dt; if(e.volT<=0){e.volT=.42;fan(e,ph2?8:6,.14,420,6,6,'#ffd23d');sfx('shoot');e.sq=1} if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'honey': if(e.stT<=0){e.st='chase';e.stT=1.5} break;
    case 'swarm': if(e.stT<=0){const k=ph2?7:5;if(enemies.length<120)for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn('bee',clamp(e.x+Math.cos(a)*120,40,AW-40),clamp(e.y+Math.sin(a)*120,40,AH-40),false,.5)}if(ph2)queueSpawn('shielder',clamp(e.x,40,AW-40),clamp(e.y+150,40,AH-40),false,.6);e.st='chase';e.stT=2;sfx('roar')} break;
    case 'decree': mx*=.2;my*=.2; e.volT-=dt; if(e.volT<=0){e.volT=.09;e.vol++;const k=ph2?3:2;for(let s=0;s<k;s++){const a=e.vol*.27+s*TAU/k;ebullets.push({x:e.x,y:e.y,vx:Math.cos(a)*190,vy:Math.sin(a)*190,r:8,dmg:5,t:0,c:'#ffd23d'})}}
      if(e.stT<=0){ring(e,ph2?24:18,200,8,6,'#ffb000',rand(0,1));e.st='chase';e.stT=1.8;shake=8;sfx('boom')} break;
  }
  return[mx,my];
}
function wmotherAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['weave','pounce','silk','pounce','summon'];
  switch(e.st){
    case 'chase':{const sd=e.wob>Math.PI?1:-1;if(d>280){mx=nx*e.spd;my=ny*e.spd}else{mx=-ny*e.spd*.7*sd;my=nx*e.spd*.7*sd}
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='weave'){const k=ph2?8:6;for(let i=0;i<k;i++){const x=i?P.x+rand(-200,200):P.x,y=i?P.y+rand(-150,150):P.y;webs.push({dmg:5,x:clamp(x,40,AW-40),y:clamp(y,40,AH-40),sx:e.x,sy:e.y,t:-i*.09,land:.8,life:6.5,r:58,rot:rand(0,TAU)})}e.stT=1.3;e.sq=1;sfx('lob')}
        else if(e.st==='pounce'){e.n=ph2?2:1;e.ph='crouch';e.stT=.5;e.tx=P.x;e.ty=P.y;fx.push({k:'ring',x:e.tx,y:e.ty,r0:90,r1:25,t:0,life:1.1,c:'#ff3b5c',w:4});sfx('fuse')}
        else if(e.st==='silk'){e.stT=1.5;e.volT=.1}else e.stT=.9}
      break}
    case 'weave': if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'pounce':
      if(e.ph==='crouch'){e.shk=1;if(e.stT<=0){e.shk=0;e.ph='air';e.stT=0;e.hx0=e.x;e.hy0=e.y}}
      else{e.stT+=dt;const p=Math.min(1,e.stT/.6);e.x=lerp(e.hx0,e.tx,p);e.y=lerp(e.hy0,e.ty,p);e.z=Math.sin(p*Math.PI)*120;e.kx=e.ky=0;
        if(p>=1){e.z=0;e.sq=1;shake=16;sfx('boom');rings.push({x:e.x,y:e.y,r:e.r,max:280,spd:300,w:18,dmg:Math.round(e.dmg*.7),hit:false});fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:150,t:0,life:.35,c:'#a09080',w:8});
          parts.push({x:e.x,y:e.y+e.r*.5,vx:0,vy:0,t:0,life:.45,img:'fx_puff',col:'#a09080',s0:40,s1:130,rot:rand(0,TAU),a0:.6});
          if(state==='wave'&&Math.hypot(P.x-e.x,P.y-e.y)<e.r+P.r+10)hurtPlayer(e.dmg+4,e);
          if(--e.n>0){e.ph='crouch';e.stT=.5;e.tx=P.x;e.ty=P.y;fx.push({k:'ring',x:e.tx,y:e.ty,r0:90,r1:25,t:0,life:1.2,c:'#ff3b5c',w:4})}else{e.st='chase';e.stT=1.6}}}
      return[0,0];
    case 'silk': e.volT-=dt; if(e.volT<=0){e.volT=.38;fan(e,ph2?7:5,.2,350,8,8,'#f4f0ff');sfx('zap');e.sq=1} if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'summon': if(e.stT<=0){const k=ph2?5:4;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(i%2?'thief':i===4?'grub':'webber',clamp(e.x+Math.cos(a)*140,40,AW-40),clamp(e.y+Math.sin(a)*140,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function fortressAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['spokes','mortar','spokes','summon'];
  switch(e.st){
    case 'chase': {const cx=AW/2-e.x,cy=AH/2-e.y,cd=Math.hypot(cx,cy)||1;const tx=(nx*.6+cx/cd*.4),ty=(ny*.6+cy/cd*.4);if(d>230){mx=tx*e.spd;my=ty*e.spd}
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='spokes'){e.stT=ph2?5:4.2;e.volT=.6;e.spA=Math.atan2(ny,nx)+.4;e.sdir=Math.random()<.5?1:-1;e.sq=1;sfx('fuse')}
        else if(e.st==='mortar'){const k=ph2?9:6;for(let i=0;i<k;i++){const x=i?P.x+rand(-180,180):P.x,y=i?P.y+rand(-140,140):P.y;marks.push({x:clamp(x,30,AW-30),y:clamp(y,30,AH-30),r:55,t:-i*.15,life:1.2,dmg:9,noPool:true})}e.stT=1.8;e.sq=1;sfx('lob')}
        else e.stT=.9}
      break}
    case 'spokes': e.kx=e.ky=0;e.spA+=dt*e.sdir*(ph2?1.0:.75);e.volT-=dt;
      if(e.volT<=0){e.volT=.14;const k=ph2?6:4;for(let i=0;i<k;i++){const a=e.spA+i/k*TAU;ebullets.push({x:e.x+Math.cos(a)*e.r*.8,y:e.y+Math.sin(a)*e.r*.8,vx:Math.cos(a)*250,vy:Math.sin(a)*250,r:8,dmg:6,t:0,c:'#ff9a3d'})}if(Math.random()<.3)sfx('shoot')}
      if(e.stT<=0){e.st='chase';e.stT=1.5}
      return[0,0];
    case 'mortar': if(e.stT<=0){e.st='chase';e.stT=1.4} break;
    case 'summon': if(e.stT<=0){const k=ph2?4:3;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(i===0?'shielder':'sentry',clamp(e.x+Math.cos(a)*150,40,AW-40),clamp(e.y+Math.sin(a)*150,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function rampagerAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5, rage=1+(1-Math.max(0,e.hp)/e.maxHp)*.8; e.stT-=dt*rage; let mx=0,my=0; const cycle=['rampage','rocks','stomp','rampage','summon'];
  if(rage>1.4&&Math.random()<.2)parts.push({x:e.x+rand(-30,30),y:e.y-e.r*.8,vx:rand(-20,20),vy:rand(-90,-50),t:0,life:.5,img:'fx_puff',col:'#ff6a6a',s0:10,s1:26,a0:.5});
  switch(e.st){
    case 'chase': mx=nx*e.spd*rage;my=ny*e.spd*rage;
      if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='rampage'){e.n=ph2?4:3;e.ph='wind';e.stT=.6;e.da=Math.atan2(ny,nx)}
        else if(e.st==='rocks'){e.stT=1.4;e.volT=.1}
        else if(e.st==='stomp'){e.n=ph2?3:2;e.stT=.75}
        else e.stT=.9}
      break;
    case 'rampage':
      if(e.ph==='wind'){e.shk=1;e.da=angLerp(e.da,Math.atan2(ny,nx),dt*3);if(e.stT<=0){e.shk=0;e.ph='dash';e.stT=.95}}
      else{const sp=620*rage;mx=Math.cos(e.da)*sp;my=Math.sin(e.da)*sp;e.kx=e.ky=0;if(Math.random()<.6)parts.push({x:e.x,y:e.y+e.r*.6,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#a09080',s0:20,s1:50,a0:.45});
        const wall=e.x<=e.r+2||e.x>=AW-e.r-2||e.y<=e.r+2||e.y>=AH-e.r-2;
        if(e.stT<=0||wall){if(wall){shake=12;sfx('boom');if(ph2)ring(e,10,170,9,6,'#c09070',rand(0,1))}
          if(--e.n>0){e.ph='wind';e.stT=.45;e.da=Math.atan2(ny,nx)}else{e.st='chase';e.stT=1.7}}}
      break;
    case 'rocks': e.volT-=dt; if(e.volT<=0){e.volT=.45;fan(e,5,.22,340,11,8,'#a07850');sfx('lob');e.sq=1} if(e.stT<=0){e.st='chase';e.stT=1.5} break;
    case 'stomp': e.swell=Math.max(.001,e.stT*.5);
      if(e.stT<=0){e.swell=0;rings.push({x:e.x,y:e.y,r:e.r,max:320,spd:270,w:20,dmg:Math.round(e.dmg*.7),hit:false});shake=14;sfx('boom');e.sq=1;fx.push({k:'ring',x:e.x,y:e.y,r0:20,r1:130,t:0,life:.35,c:'#a09080',w:8});if(--e.n>0)e.stT=.5;else{e.st='chase';e.stT=1.7}}
      break;
    case 'summon': if(e.stT<=0){const k=ph2?4:3;for(let i=0;i<k;i++){const a=i/k*TAU;queueSpawn(i===0||(ph2&&i===2)?'berserker':'roller',clamp(e.x+Math.cos(a)*140,40,AW-40),clamp(e.y+Math.sin(a)*140,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
const watcherBeams=e=>e.hp<e.maxHp*.5?[e.beamA,e.beamA+Math.PI]:[e.beamA];
function watcherAI(e,dt,nx,ny,d){
  const ph2=e.hp<e.maxHp*.5; e.stT-=dt; let mx=0,my=0; const cycle=['sweep','volley','sweep','summon'];
  if(d>330){mx=nx*e.spd;my=ny*e.spd}else if(d<200){mx=-nx*e.spd;my=-ny*e.spd}
  switch(e.st){
    case 'chase': if(e.stT<=0){e.st=cycle[e.phaseIdx++%cycle.length];
        if(e.st==='sweep'){e.stT=ph2?6:5;e.bdir=Math.random()<.5?1:-1;e.beamA=Math.atan2(ny,nx)-e.bdir*1.5;e.warm=.9;sfx('fuse')}
        else if(e.st==='volley'){e.stT=1.8;e.volT=.2}else e.stT=.9}
      break;
    case 'sweep': mx*=.3;my*=.3;e.warm-=dt;e.beamA+=e.bdir*dt*(ph2?.8:.55);
      if(e.warm<=0&&state==='wave'){for(const a of watcherBeams(e))if(segDist(P.x,P.y,e.x,e.y,e.x+Math.cos(a)*950,e.y+Math.sin(a)*950)<14+P.r*.45)hurtPlayer(e.dmg,e)}
      if(e.stT<=0){e.st='chase';e.stT=1.6}
      break;
    case 'volley': e.volT-=dt; if(e.volT<=0){e.volT=.55;fan(e,ph2?7:5,.12,520,6,8,'#ff3b5c');sfx('sniper');e.sq=1} if(e.stT<=0){e.st='chase';e.stT=1.6} break;
    case 'summon': if(e.stT<=0){for(let i=0;i<4;i++){const a=i/4*TAU;queueSpawn(i===3?'pulser':'spotter',clamp(e.x+Math.cos(a)*150,40,AW-40),clamp(e.y+Math.sin(a)*150,40,AH-40),false,.6)}e.st='chase';e.stT=2;sfx('roar')} break;
  }
  return[mx,my];
}
function bossDown(e){
  state='winning';run.endT=0;timeScale=.25;shake=20;freezeT=.15;
  for(const o of enemies)if(!o.dead&&o!==e)o.popT=rand(.1,.8);
  ebullets=[];spawns=[];
  for(let k=0;k<6;k++)booms.push({x:e.x+rand(-70,70),y:e.y+rand(-70,70),t:k*.12+.05,r:90,dmg:0,safe:true});
  showBanner(bossName(e.type).toUpperCase()+' FALLS','',2.5,'#ffcc4d');
}
/* Called from inside the hit/bullet loops, so the wave ends at the end of this frame (endWave clears those arrays). */
function midBossDown(e){ run.pendingEnd={x:e.x,y:e.y}; shake=20; freezeT=.15; }
function finishMidBoss(){
  const pe=run.pendingEnd; run.pendingEnd=null; endWave();
  for(let k=0;k<5;k++)booms.push({x:pe.x+rand(-70,70),y:pe.y+rand(-70,70),t:k*.12+.05,r:90,dmg:0,safe:true});
  showBanner('BOSS DEFEATED','Halfway there!',2,'#ffcc4d');
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
    const mv=getMove(); let spd=230*(1+clamp(S.speed,-60,150)/100);
    for(const w of webs)if(w.t>w.land&&Math.hypot(P.x-w.x,(P.y-w.y)*1.3)<w.r){spd*=.5;break}
    const k=1-Math.exp(-dt*16); P.vx=lerp(P.vx,mv.x*spd,k); P.vy=lerp(P.vy,mv.y*spd,k);
    P.x=clamp(P.x+P.vx*dt,P.r,AW-P.r); P.y=clamp(P.y+P.vy*dt,P.r,AH-P.r);
    P.moving=Math.hypot(mv.x,mv.y)>.1; if(P.moving){P.walk+=dt;P.lx=mv.x;P.ly=mv.y}
    if(P.moving&&Math.random()<dt*10)parts.push({x:P.x+rand(-6,6),y:P.y+P.r,vx:-P.vx*.1,vy:rand(-20,-5),t:0,life:.4,img:'fx_puff',col:'#c8b4cc',s0:6,s1:16,rot:rand(0,TAU),a0:.35});
  }
  P.iframes-=dt; P.blink-=dt; if(P.blink<-.12)P.blink=rand(2,4.5);
  if(state==='wave'&&S.regen>0){P.regenAcc+=dt*S.regen*.12;while(P.regenAcc>=1){P.regenAcc-=1;heal(1)}}
  run.hpTrail=P.hp<run.hpTrail?lerp(run.hpTrail,P.hp,1-Math.exp(-dt*4)):P.hp;
  if(state==='wave'){
    if(!run.waves[run.wave-1].boss){run.timer-=dt;if(run.timer<=0){run.timer=0;endWave()}}else run.timer+=dt;
    updateSpawning(dt);
    if(S.strike){run.rodT-=dt;if(run.rodT<=0){run.rodT=2.5/S.strike;const pool=enemies.filter(e=>!e.dead&&e.popT==null&&!e.under&&Math.abs(e.x-P.x)<700&&Math.abs(e.y-P.y)<500);
      if(pool.length){const e=pick(pool);const sd=Math.round(20*(1+S.dmg/100)+run.wave*2);fx.push({k:'zap',pts:jag([{x:e.x+rand(-40,40),y:e.y-320},{x:e.x,y:e.y}]),nodes:[{x:e.x,y:e.y}],t:0,life:.22});hurtEnemy(e,sd,false,Math.PI/2,6);shake=Math.max(shake,2);sfx('zap')}}}
    if(S.shield&&!run.shieldReady){run.shieldT-=dt*S.shield;if(run.shieldT<=0){run.shieldReady=true;fx.push({k:'ring',x:P.x,y:P.y,r0:P.r*3,r1:P.r*1.6,t:0,life:.3,c:'#6fe3ff',w:4})}}
    if(S.drone){run.droneT-=dt;if(run.droneT<=0){run.droneT=.6/Math.min(2,S.drone);const da=run.time*2,dx=P.x+Math.cos(da)*48,dy=P.y-20+Math.sin(da)*20,tg=nearestEnemy(dx,dy,380);
      if(tg){const a=Math.atan2(tg.y-dy,tg.x-dx),def={id:'drone',crit:5,critMul:2,knock:4};bullets.push({x:dx,y:dy,vx:Math.cos(a)*900,vy:Math.sin(a)*900,spd:900,dmg:Math.round((7+S.ranged*.6)*(1+S.dmg/100)),def,range:420,trav:0,pierce:0,hit:new Set(),r:4,a});sfx('shoot')}}}
    if(S.saws){run.sawA+=dt*3.2;const n=S.saws,sd=Math.round((9+S.melee*.6)*(1+S.dmg/100));for(let k=0;k<n;k++){const a=run.sawA+k/n*TAU,sx=P.x+Math.cos(a)*72,sy=P.y+Math.sin(a)*72;
      for(const e of enemies){if(e.dead||e.popT!=null||e.under||e.z>20||(e.sawCd>0))continue;if(d2(sx,sy,e.x,e.y)<(e.r+16)*(e.r+16)){e.sawCd=.35;hurtEnemy(e,sd,false,a+Math.PI/2,8);for(let q=0;q<3;q++)parts.push({x:sx,y:sy,vx:rand(-150,150),vy:rand(-150,150),t:0,life:.2,c:'#fff3b0',s:2})}}}
      for(const e of enemies)if(e.sawCd>0)e.sawCd-=dt}
    if(S.bombs){run.bombT-=dt;if(run.bombT<=0){run.bombT=6/Math.min(2,S.bombs);const bt=nearestEnemy(P.x,P.y,320);mines.push({x:bt?bt.x:P.x,y:bt?bt.y:P.y+P.r*.5,t:0,arm:99,life:bt?.9:1.3,timed:true,dmg:Math.round((30+run.wave*2)*(1+S.dmg/100)),def:{id:'bombbag',blast:90,knock:22}});sfx('click')}}
    if(run.slipT>0){run.slipT-=dt;if(Math.random()<dt*10)parts.push({x:P.x+rand(-12,12),y:P.y-rand(0,20),vx:0,vy:-50,t:0,life:.35,c:'#b8ff8a',s:3,fade:1})}
    if(run.rageT>0){run.rageT-=dt;if(Math.random()<dt*14)parts.push({x:P.x+rand(-12,12),y:P.y-rand(0,20),vx:0,vy:-60,t:0,life:.4,c:'#ff5d3d',s:3,fade:1})}
    if(run.char.aura){run.auraT-=dt;if(run.auraT<=0){run.auraT=.5;const ad=Math.round(2+run.wave*.3+S.melee*.4);for(const e of enemies){if(e.dead||e.popT!=null||e.under)continue;if(Math.hypot(e.x-P.x,e.y-P.y)<80+e.r)hurtEnemy(e,ad,false,Math.atan2(e.y-P.y,e.x-P.x),3)}}}
  }
  if(state==='wave'||state==='winning')updateWeapons(dt);
  for(let i=booms.length-1;i>=0;i--){const b=booms[i];b.t-=dt;if(b.t<=0){booms.splice(i,1);explode(b.x,b.y,b.r,b.dmg,b.knock||18,b.safe?0:0,b.def)}}
  // bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i];
    if(b.boomer){
      b.rot+=dt*16;
      if(!b.ret){b.x+=b.vx*dt;b.y+=b.vy*dt;b.trav+=b.spd*dt;if(b.trav>=b.range){b.ret=true;b.hit=new Set()}}
      else{const dx=P.x-b.x,dy=P.y-b.y,dd=Math.hypot(dx,dy)||1,sp=b.spd*1.15;b.x+=dx/dd*sp*dt;b.y+=dy/dd*sp*dt;if(dd<P.r+12){bullets.splice(i,1);continue}}
      for(const e of enemies){if(e.dead||e.popT!=null||e.under||b.hit.has(e)||e.z>20)continue;const rr=e.r+b.r;if(d2(b.x,b.y,e.x,e.y)<rr*rr){b.hit.add(e);if(blocks(e,b.x,b.y)){blockFx(b.x,b.y);shieldHit(e,b.dmg);continue}dealHit(e,b.dmg,b.def,Math.atan2(e.y-b.y,e.x-b.x),b.def.knock)}}
      if(bullets[i]!==b)continue;
      if(b.x<-80||b.x>AW+80||b.y<-80||b.y>AH+80)bullets.splice(i,1);
      continue}
    if(b.disc){b.t+=dt;b.rot+=dt*20;b.x+=b.vx*dt;b.y+=b.vy*dt;
      if(b.x<b.r&&b.vx<0||b.x>AW-b.r&&b.vx>0){b.vx=-b.vx;b.bnc++;sfx('bounce')}
      if(b.y<b.r&&b.vy<0||b.y>AH-b.r&&b.vy>0){b.vy=-b.vy;b.bnc++;sfx('bounce')}
      for(const e of enemies){if(e.dead||e.popT!=null||e.under||e.z>20)continue;if((b.hcd.get(e)||0)>b.t)continue;const rr=e.r+b.r;if(d2(b.x,b.y,e.x,e.y)<rr*rr){b.hcd.set(e,b.t+.4);if(blocks(e,b.x,b.y)){blockFx(b.x,b.y);shieldHit(e,b.dmg);continue}dealHit(e,b.dmg,b.def,Math.atan2(b.vy,b.vx),b.def.knock)}}
      if(bullets[i]!==b)continue;
      if(b.t>=b.life)bullets.splice(i,1);
      continue}
    if(b.lob){b.t+=dt;const p=Math.min(1,b.t/b.T);b.x=lerp(b.sx,b.tx,p);b.y=lerp(b.sy,b.ty,p);b.z=Math.sin(p*Math.PI)*90;b.rot+=dt*12;if(p>=1){bullets.splice(i,1);explode(b.tx,b.ty,b.def.blast,b.dmg,b.def.knock,0,b.def)}continue}
    if(b.homing){const tg=nearestEnemy(b.x,b.y,900);if(tg){const want=Math.atan2(tg.y-b.y,tg.x-b.x);b.a=angLerp(Math.atan2(b.vy,b.vx),want,Math.min(1,dt*6));}else b.a=Math.atan2(b.vy,b.vx);const sp=Math.min(b.spd,Math.hypot(b.vx,b.vy)+dt*900);b.vx=Math.cos(b.a)*sp;b.vy=Math.sin(b.a)*sp}
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.trav+=b.spd*dt;
    let gone=b.trav>b.range||b.x<-20||b.x>AW+20||b.y<-20||b.y>AH+20;
    if(!gone)for(const e of enemies){
      if(e.dead||e.popT!=null||e.under||b.hit.has(e)||e.z>20)continue;
      const rr=e.r+b.r; if(d2(b.x,b.y,e.x,e.y)<rr*rr){
        if(b.rocket){explode(b.x,b.y,b.def.blast,b.dmg,b.def.knock,0,b.def);clusterPop(b);gone=true;break}
        if(!b.flame&&blocks(e,b.x,b.y)){b.hit.add(e);blockFx(b.x,b.y);shieldHit(e,b.dmg);gone=true;break}
        b.hit.add(e); dealHit(e,b.dmg,b.def,b.a,b.def.knock);
        if(b.bounce>0){const nx=nearestEnemy(b.x,b.y,260,b.hit);if(nx){b.bounce--;const a=Math.atan2(nx.y-b.y,nx.x-b.x);b.vx=Math.cos(a)*b.spd;b.vy=Math.sin(a)*b.spd;b.a=a;b.trav=Math.max(0,b.range-300);sfx('bounce');parts.push({x:b.x,y:b.y,vx:0,vy:0,t:0,life:.15,img:'fx_glow',col:'#ffe066',s0:12,s1:36,add:1});break}}
        if(--b.pierce<0){gone=true;break}
      }
    }
    if(gone){if(b.rocket&&b.trav>b.range){explode(b.x,b.y,b.def.blast,b.dmg,b.def.knock,0,b.def);clusterPop(b)}bullets.splice(i,1)}
    else if(b.rocket&&Math.random()<.7)parts.push({x:b.x,y:b.y,vx:rand(-20,20),vy:rand(-20,20),t:0,life:.4,img:'fx_puff',col:'#9a8a9a',s0:6,s1:18,rot:rand(0,TAU),a0:.5});
  }
  for(let i=webs.length-1;i>=0;i--){const w=webs[i];w.t+=dt;if(w.t>=w.life)webs.splice(i,1);else if(!w.landed&&w.t>=w.land){w.landed=1;sfx('click');if(w.dmg>0&&state==='wave'&&Math.hypot(P.x-w.x,(P.y-w.y)*1.3)<w.r)hurtPlayer(w.dmg,{type:w.honey?'hqueen':'webber',dead:true});parts.push({x:w.x,y:w.y,vx:0,vy:0,t:0,life:.3,img:'fx_puff',col:'#ffffff',s0:20,s1:60,a0:.5})}}
  for(let i=kpools.length-1;i>=0;i--){kpools[i].t+=dt;if(kpools[i].t>=kpools[i].life)kpools.splice(i,1)}
  for(let i=rings.length-1;i>=0;i--){const g=rings[i];g.r+=g.spd*dt;if(g.r>=g.max){rings.splice(i,1);continue}
    if(!g.hit&&state==='wave'){const dd=Math.hypot(P.x-g.x,P.y-g.y);if(Math.abs(dd-g.r)<g.w*.5+P.r*.45){g.hit=true;hurtPlayer(g.dmg,{type:'pulser',dead:true})}}}
  for(let i=mines.length-1;i>=0;i--){const m=mines[i];m.t+=dt;if(m.t>m.life){mines.splice(i,1);if(m.timed&&state==='wave')explode(m.x,m.y,m.def.blast,m.dmg,m.def.knock,0,m.def);continue}if(m.t<m.arm||state!=='wave')continue;
    for(const e of enemies){if(e.dead||e.popT!=null||e.under||e.z>20)continue;if(d2(m.x,m.y,e.x,e.y)<(e.r+40)*(e.r+40)){mines.splice(i,1);explode(m.x,m.y,m.def.blast,m.dmg,m.def.knock,0,m.def);break}}}
  updateEnemies(dt);
  for(let i=ebullets.length-1;i>=0;i--){const b=ebullets[i];b.t+=dt;const bs=DZ(3)?1.25:1;if(b.home&&b.t<4.5){const sp=Math.hypot(b.vx,b.vy),a=angLerp(Math.atan2(b.vy,b.vx),Math.atan2(P.y-b.y,P.x-b.x),Math.min(1,dt*1.7));b.vx=Math.cos(a)*sp;b.vy=Math.sin(a)*sp}b.x+=b.vx*dt*bs;b.y+=b.vy*dt*bs;
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
  for(let i=marks.length-1;i>=0;i--){const m=marks[i];m.t+=dt;if(m.t<m.life)continue;marks.splice(i,1);
    if(m.noPool){fx.push({k:'ring',x:m.x,y:m.y,r0:10,r1:m.r*1.3,t:0,life:.3,c:'#ff9a3d',w:6});parts.push({x:m.x,y:m.y,vx:0,vy:0,t:0,life:.35,img:'fx_puff',col:'#a09080',s0:m.r*.6,s1:m.r*1.8,rot:rand(0,TAU),a0:.6});shake=Math.max(shake,4);sfx('boom')}
    else pools.push({x:m.x,y:m.y,r:m.r*.8,t:0,life:4,dmg:5,rot:rand(0,TAU)});
    for(let k=0;k<10;k++){const a=rand(0,TAU),v=rand(80,220);parts.push({x:m.x,y:m.y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,t:0,life:.5,c:pick(['#7dff4a','#3cd46f','#c8ffb0']),s:rand(3,6),g:400})}
    if(state==='wave'&&Math.hypot(P.x-m.x,(P.y-m.y)*1.3)<m.r+P.r*.5)hurtPlayer(m.dmg,{type:'acid',dead:true})}
  for(let i=pools.length-1;i>=0;i--){const q=pools[i];q.t+=dt;if(q.t>=q.life){pools.splice(i,1);continue}
    if(state==='wave'&&q.t>.25&&q.t<q.life-.3&&Math.hypot(P.x-q.x,(P.y+P.r*.6-q.y)*1.4)<q.r*.85+P.r*.5)hurtPlayer(q.dmg,{type:'acid',dead:true})}
  run.unT=(run.unT||0)-dt; if(run.unT<=0){run.unT=.5;checkUnlocks()}
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.t+=dt;if(p.t>=p.life){parts.splice(i,1);continue}if(p.drag){p.vx*=Math.exp(-dt*p.drag);p.vy*=Math.exp(-dt*p.drag)}if(p.g)p.vy+=p.g*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.vr)p.rot+=p.vr*dt}
  if(parts.length>700)parts.splice(0,parts.length-700);
  for(let i=texts.length-1;i>=0;i--){const t=texts[i];t.t+=dt;t.y+=t.vy*dt;t.vy*=Math.exp(-dt*4);if(t.t>=t.life)texts.splice(i,1)}
  if(texts.length>80)texts.splice(0,texts.length-80);
  for(let i=fx.length-1;i>=0;i--){fx[i].t+=dt;if(fx[i].t>=fx[i].life)fx.splice(i,1)}
  enemies=enemies.filter(e=>!e.dead);
  if(run.pendingEnd&&state==='wave')finishMidBoss();
  if(state==='waveEnd'){run.endT+=dt;if(run.endT>1.4&&enemies.length===0&&gems.length===0&&pickups.length===0){state='between';afterWave()}}
}
function collectGem(g){
  run.mats+=g.val; run.totalMats+=g.val; PROF.mats+=g.val; run.matBump=1;
  run.gemChain=run.time-run.lastGem<.35?run.gemChain+1:0; run.lastGem=run.time;
  sfx('gem',run.gemChain); addXp(g.val);
}
function addXp(v){
  P.xp+=v*(run.char.xpMul||1)*(1+(S.xpPct||0)/100);
  while(P.xp>=xpNeed(P.level)){
    P.xp-=xpNeed(P.level); P.level++; PROF.maxLevel=Math.max(PROF.maxLevel||0,P.level); run.pendingLv++; B.maxHp+=1; recalc(); P.hp+=1;
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
  const fy=-Hs*(1-ch.fy), es=Hs*ch.es, er=Hs*ch.ez, fxo=Hs*(ch.fx||0);
  c.translate(fxo,0);
  const lx=(o.lx||0)*er*.35*(o.lx<-.2?-1:1), ly=(o.ly||0)*er*.3;
  const blink=o.blink!=null&&o.blink<0;
  for(const s of [-1,1]){
    if(blink){c.strokeStyle='#1a0a12';c.lineWidth=Math.max(1.5,er*.35);c.beginPath();c.moveTo(s*es-er*.8,fy);c.lineTo(s*es+er*.8,fy);c.stroke();continue}
    c.fillStyle='#fff'; c.strokeStyle='#1a0a12'; c.lineWidth=Math.max(1.2,er*.22);
    c.beginPath(); c.ellipse(s*es,fy,er,er*1.2,0,0,TAU); c.fill(); c.stroke();
    c.fillStyle='#1a0a12'; c.beginPath(); c.arc(s*es+lx,fy+ly+er*.1,er*.55,0,TAU); c.fill();
    c.fillStyle='#fff'; c.beginPath(); c.arc(s*es+lx+er*.2,fy+ly-er*.15,er*.2,0,TAU); c.fill();
  }
  if(ch.noMouth){c.restore();return}
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
  if(e.type==='watcher'&&e.st==='sweep'){for(const a of watcherBeams(e)){const x2=e.x+Math.cos(a)*950,y2=e.y+Math.sin(a)*950;c.save();c.lineCap='round';
      if(e.warm>0){c.globalAlpha=.5+.3*Math.sin(t*30);c.strokeStyle='#ff3b5c';c.lineWidth=2;c.setLineDash([10,8]);c.beginPath();c.moveTo(e.x,e.y);c.lineTo(x2,y2);c.stroke()}
      else{c.globalCompositeOperation='lighter';c.globalAlpha=.55;c.strokeStyle='#ff3b5c';c.lineWidth=26;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(x2,y2);c.stroke();c.globalAlpha=.9;c.strokeStyle='#ffd0da';c.lineWidth=8;c.stroke()}
      c.restore()}}
  if(e.type==='slord'&&e.st==='aim'){c.save();c.globalAlpha=.25+.25*Math.sin(t*30);c.strokeStyle='#ff3b5c';c.lineWidth=e.r*1.4;c.lineCap='round';c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(e.da)*420,e.y+Math.sin(e.da)*420);c.stroke();c.restore()}
  if(e.type==='spotter'&&e.st==='aim'){const lock=e.stT<=.25;c.save();c.globalAlpha=lock?.85:.35+.2*Math.sin(t*30);c.strokeStyle='#ff3b5c';c.lineWidth=lock?3:1.5;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x+Math.cos(e.aimA)*900,e.y+Math.sin(e.aimA)*900);c.stroke();c.restore()}
  if(e.ghost){c.save();c.globalAlpha=.28+.08*Math.sin(t*12);e.ghost=false;e.under=false;drawEnemy(c,e,t);e.ghost=true;e.under=true;c.restore();return}
  if(e.under){
    const rise=e.st==='rise', jx=rise?rand(-2,2):0, RR=e.def.riseR||62;
    if(rise){const p=1-e.stT/(e.riseT0||.7);c.strokeStyle='rgba(255,60,80,'+(.4+.5*p)+')';c.lineWidth=3;c.setLineDash([8,6]);c.beginPath();c.ellipse(e.x,e.y,RR,RR*.7,0,0,TAU);c.stroke();c.setLineDash([]);c.fillStyle='rgba(255,60,80,'+(.12*p)+')';c.fill()}
    c.fillStyle='#3a2a1e';c.beginPath();c.ellipse(e.x+jx,e.y+4,e.r*1.2,e.r*.55,0,0,TAU);c.fill();
    c.fillStyle='#6b5444';c.beginPath();c.ellipse(e.x+jx,e.y,e.r*1.05,e.r*.6,0,Math.PI,TAU);c.fill();
    c.fillStyle='#8a7060';for(let k=0;k<4;k++){c.beginPath();c.arc(e.x+jx+Math.cos(k*1.7+e.wob)*e.r*.7,e.y-2+Math.sin(k*2.3)*3,2.5,0,TAU);c.fill()}
    return;
  }
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
  else if(e.frz>0){tint='#a8ecff';ta=.6}
  else if(e.tendT>0&&Math.sin(t*8+e.wob)>.5){tint='#ff9a6a';ta=.28}
  else if(e.psn>0&&Math.sin(t*10+e.wob)>.3){tint='#7dff4a';ta=.3}
  else if((e.st==='wind'||e.st==='fuse')&&Math.sin(t*40)>0){tint='#ff2a2a';ta=.6}
  else if(e.def.isBoss&&e.hp<e.maxHp*.5){tint='#ff0040';ta=.18+.12*Math.sin(t*8)}
  else if(e.type==='berserker'&&e.hp<e.maxHp*.6){tint='#ff1a1a';ta=.2+.15*Math.sin(t*14)}
  if(tint){c.globalAlpha=ta;c.drawImage(tinted('e_'+e.type,tint),ox,oy,dw,dh);c.globalAlpha=1}
  c.restore();
  if((e.type==='bulwark'||e.type==='warden')&&!(e.shDown>0)){const R=e.r*(e.type==='warden'?1.2:1.25);c.save();c.translate(x,y);c.rotate(e.face);c.lineCap='round';c.strokeStyle='#2a2f3a';c.lineWidth=11;c.beginPath();c.arc(0,0,R,-1.0,1.0);c.stroke();c.strokeStyle='#b8c4d8';c.lineWidth=7;c.beginPath();c.arc(0,0,R,-1.0,1.0);c.stroke();c.strokeStyle='#e8f0ff';c.lineWidth=2;c.beginPath();c.arc(0,0,R-2,-.7,.2);c.stroke();c.restore()}
  if(e.type==='hqueen'){const cs=e.r*.62,cy=y-e.r*1.18-(e.z||0);c.save();c.translate(x,cy);c.rotate(Math.sin(t*2)*.06);c.fillStyle='#ffd23d';c.strokeStyle='#5a3a00';c.lineWidth=4;c.lineJoin='round';c.beginPath();c.moveTo(-cs,cs*.45);c.lineTo(-cs,-cs*.25);c.lineTo(-cs*.5,cs*.1);c.lineTo(0,-cs*.55);c.lineTo(cs*.5,cs*.1);c.lineTo(cs,-cs*.25);c.lineTo(cs,cs*.45);c.closePath();c.stroke();c.fill();
    c.fillStyle='#ff3b6c';for(const [jx,jy] of [[-cs,-cs*.25],[0,-cs*.55],[cs,-cs*.25]]){c.beginPath();c.arc(jx,jy,cs*.13,0,TAU);c.fill()}c.fillStyle='#4ad6ff';c.beginPath();c.arc(0,cs*.2,cs*.12,0,TAU);c.fill();c.restore()}
  if(e.bub){c.save();c.globalAlpha=.18;c.fillStyle='#7fe8ff';c.beginPath();c.arc(x,y,e.r*1.45,0,TAU);c.fill();c.globalAlpha=.8;c.strokeStyle='#bff4ff';c.lineWidth=3;c.stroke();c.restore()}
  if(e.loot){c.save();c.fillStyle='#ffcc4d';c.strokeStyle='#5a3a00';c.lineWidth=3;c.font='bold 15px sans-serif';c.textAlign='center';c.strokeText('$'+e.loot,x,y-e.r*1.7);c.fillText('$'+e.loot,x,y-e.r*1.7);c.restore()}
  if(e.type==='medic'){const cy=y-e.r*1.9,s=5+(e.pulse>0?e.pulse*6:0);c.fillStyle='#ffffff';c.fillRect(x-s*1.4,cy-s*.45,s*2.8,s*.9);c.fillRect(x-s*.45,cy-s*1.4,s*.9,s*2.8);c.fillStyle='#4cc94c';c.fillRect(x-s,cy-s*.25,s*2,s*.5);c.fillRect(x-s*.25,cy-s,s*.5,s*2)}
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
  for(const s of spawns){const p=s.t/s.life;const R=(ENEMIES[s.type].isBoss?50:s.elite?24:13)*(1+Math.sin(t*20)*.08);ctx.save();ctx.translate(s.x,s.y);ctx.globalAlpha=.4+.6*p;ctx.strokeStyle=s.elite||ENEMIES[s.type].isBoss?'#ffcc4d':'#ff3b5c';ctx.lineWidth=ENEMIES[s.type].isBoss?8:4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-R,-R);ctx.lineTo(R,R);ctx.moveTo(R,-R);ctx.lineTo(-R,R);ctx.stroke();ctx.globalAlpha=.25*p;ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(0,0,R*1.4*p,0,TAU);ctx.fill();ctx.restore()}
  // onion aura
  if(run.char.aura&&(state==='wave'||state==='waveEnd')){const g=tinted('fx_ring','#9be36a');const R=80+Math.sin(t*4)*4;ctx.save();ctx.translate(P.x,P.y);ctx.rotate(t*.6);ctx.globalAlpha=.35;ctx.drawImage(g,-R,-R,R*2,R*2);ctx.globalAlpha=.08;ctx.fillStyle='#9be36a';ctx.beginPath();ctx.arc(0,0,R*.92,0,TAU);ctx.fill();ctx.restore();ctx.globalAlpha=1}
  // gems
  { const pim=tinted('fx_splat','#7dff4a'); for(const q of pools){if(!vis(q.x,q.y,40))continue;const a=Math.min(1,q.t/.25)*Math.min(1,(q.life-q.t)/.6);const s=q.r*2.6*(1+Math.sin(t*4+q.rot)*.04);ctx.save();ctx.translate(q.x,q.y);ctx.scale(1,.7);ctx.globalAlpha=.22*a;ctx.fillStyle='#7dff4a';ctx.beginPath();ctx.arc(0,0,q.r*.95,0,TAU);ctx.fill();ctx.rotate(q.rot);ctx.globalAlpha=.75*a;ctx.drawImage(pim,-s/2,-s/2,s,s);ctx.restore()} ctx.globalAlpha=1; }
  for(const m of marks){if(m.t<0)continue;const p=clamp(m.t/m.life,0,1);ctx.save();ctx.translate(m.x,m.y);ctx.scale(1,.75);ctx.strokeStyle='rgba(125,255,74,.85)';ctx.lineWidth=3;ctx.setLineDash([7,6]);ctx.beginPath();ctx.arc(0,0,m.r,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(125,255,74,.28)';ctx.beginPath();ctx.arc(0,0,m.r*p,0,TAU);ctx.fill();ctx.restore();
    const bh=(1-p)*260;ctx.fillStyle='#5ee23a';ctx.strokeStyle='#1d7a3e';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(m.x,m.y-bh,9,12,0,0,TAU);ctx.fill();ctx.stroke()}
  const glowG=tinted('fx_glow','#5ef2b0');
  for(const g of gems){if(!vis(g.x,g.y,10))continue;const s=g.val>1?8:5.5;ctx.globalAlpha=.55;ctx.drawImage(glowG,g.x-s*2.6,g.y-s*2.6,s*5.2,s*5.2);ctx.globalAlpha=1;ctx.save();ctx.translate(g.x,g.y);ctx.rotate(g.spin);ctx.fillStyle=g.val>1?'#c8ffe6':'#5ef2b0';ctx.strokeStyle='#1d7a55';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.8,0);ctx.lineTo(0,s);ctx.lineTo(-s*.8,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore()}
  for(const w of webs){const fade=Math.min(1,(w.life-w.t)/.6);ctx.save();
    if(w.t<w.land){const p=w.t/w.land,bx=lerp(w.sx,w.x,p),by=lerp(w.sy,w.y,p)-Math.sin(p*Math.PI)*90;ctx.globalAlpha=.6;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.setLineDash([6,6]);ctx.beginPath();ctx.ellipse(w.x,w.y,w.r,w.r/1.3,0,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;ctx.fillStyle=w.honey?'#ffc23d':'#f4f0ff';ctx.beginPath();ctx.arc(bx,by,9,0,TAU);ctx.fill()}
    else if(w.honey){ctx.translate(w.x,w.y);ctx.scale(1,1/1.3);const g=ctx.createRadialGradient(0,0,2,0,0,w.r);g.addColorStop(0,'rgba(255,200,60,.75)');g.addColorStop(.75,'rgba(240,160,20,.55)');g.addColorStop(1,'rgba(200,120,0,0)');ctx.globalAlpha=fade*Math.min(1,(w.t-w.land+.3)/.3);ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,w.r,0,TAU);ctx.fill();ctx.fillStyle='rgba(255,240,180,.7)';ctx.beginPath();ctx.arc(-w.r*.3,-w.r*.3,w.r*.15,0,TAU);ctx.fill()}
    else{ctx.translate(w.x,w.y);ctx.scale(1,1/1.3);ctx.rotate(w.rot);ctx.globalAlpha=.55*fade;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(0,0,w.r,0,TAU);ctx.globalAlpha=.12*fade;ctx.fill();ctx.globalAlpha=.7*fade;ctx.strokeStyle='#f4f0ff';ctx.lineWidth=2;ctx.beginPath();for(let k=0;k<8;k++){const a=k/8*TAU;ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*w.r,Math.sin(a)*w.r)}for(const rr of [.35,.65,.95]){ctx.moveTo(w.r*rr,0);for(let k=1;k<=8;k++){const a=k/8*TAU;ctx.lineTo(Math.cos(a)*w.r*rr,Math.sin(a)*w.r*rr)}}ctx.stroke()}
    ctx.restore()}
  {const kim=tinted('fx_splat','#d8261c');for(const q of kpools){const a=Math.min(1,q.t/.2)*Math.min(1,(q.life-q.t)/.6);ctx.save();ctx.translate(q.x,q.y);ctx.rotate(q.rot);ctx.scale(1,.7);ctx.globalAlpha=.6*a;ctx.drawImage(kim,-q.r*1.2,-q.r*1.2,q.r*2.4,q.r*2.4);ctx.restore()}ctx.globalAlpha=1}
  for(const g of rings){const a=1-g.r/g.max;ctx.save();ctx.globalAlpha=.25+.6*a;ctx.strokeStyle='#ffd24d';ctx.lineWidth=g.w;ctx.beginPath();ctx.arc(g.x,g.y,g.r,0,TAU);ctx.stroke();ctx.globalAlpha=.8*a;ctx.strokeStyle='#fff6c0';ctx.lineWidth=3;ctx.stroke();ctx.restore()}
  for(const m of mines){if(m.timed){const k=m.t/m.life;ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(m.x,m.y+6,13,5,0,0,TAU);ctx.fill();ctx.fillStyle=k>.7&&Math.sin(t*40)>0?'#ff3b3b':'#2a2a34';ctx.strokeStyle='#120a14';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(m.x,m.y,11,0,TAU);ctx.fill();ctx.stroke();ctx.globalCompositeOperation='lighter';ctx.drawImage(tinted('fx_glow','#ffcc4d'),m.x+4,m.y-22,14,14);ctx.globalCompositeOperation='source-over';continue}const armed=m.t>=m.arm;ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(m.x,m.y+3,11,4,0,0,TAU);ctx.fill();ctx.fillStyle='#4a4352';ctx.strokeStyle='#ff9a3c';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(m.x,m.y,9,0,TAU);ctx.fill();ctx.stroke();
    if(armed&&Math.sin(t*10+m.x)>0){ctx.fillStyle='#ff3b5c';ctx.beginPath();ctx.arc(m.x,m.y,3.5,0,TAU);ctx.fill();ctx.globalAlpha=.5;ctx.drawImage(tinted('fx_glow','#ff3b5c'),m.x-12,m.y-12,24,24);ctx.globalAlpha=1}}
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
  const fireImg=tinted('fx_fire','#ff9a3c'), pepImg=tinted('fx_puff','#c8b090');
  for(const b of bullets){
    if(b.disc){const im=IMG.w_pizza;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);if(im&&im.width)ctx.drawImage(im,-22,-22*im.height/im.width,44,44*im.height/im.width);ctx.restore();continue}
    if(b.boomer){const im=IMG.w_rolling;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot);if(im&&im.width)ctx.drawImage(im,-24,-24*im.height/im.width,48,48*im.height/im.width);ctx.restore();continue}
    if(b.lob){ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(b.x,b.y+4,8,3,0,0,TAU);ctx.fill();const im=IMG.p_grenade;ctx.save();ctx.translate(b.x,b.y-b.z);ctx.rotate(b.rot);if(im&&im.width)ctx.drawImage(im,-9,-11,18,22);ctx.restore();continue}
    if(b.flame){const p=b.trav/b.range;const s=lerp(14,46,p);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=Math.max(0,1-p)*.8;ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.rot+p*3);ctx.drawImage(b.pepper?pepImg:fireImg,-s/2,-s/2,s,s);ctx.restore();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';continue}
    if(b.rocket){ctx.save();ctx.translate(b.x,b.y);ctx.rotate(b.a);ctx.fillStyle='#e63946';ctx.strokeStyle='#120a14';ctx.lineWidth=2;rr(ctx,-9,-4,16,8,3);ctx.fill();ctx.stroke();ctx.fillStyle='#ffcc4d';ctx.beginPath();ctx.moveTo(-9,-3);ctx.lineTo(-16-Math.random()*6,0);ctx.lineTo(-9,3);ctx.fill();ctx.restore();continue}
    const L=Math.min(b.trav,b.spd>1500?60:26);const col=b.bounce?'rgba(255,224,102,.6)':'rgba(255,230,140,.5)';ctx.strokeStyle=col;ctx.lineWidth=b.r*1.6;ctx.beginPath();ctx.moveTo(b.x-b.vx/b.spd*L,b.y-b.vy/b.spd*L);ctx.lineTo(b.x,b.y);ctx.stroke();
    ctx.fillStyle=b.bounce?'#ffe066':'#fff7d1';ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,TAU);ctx.fill();
  }
  for(const b of ebullets){const pu=1+Math.sin(t*15+b.t*10)*.12;ctx.globalAlpha=.5;ctx.drawImage(tinted('fx_glow',b.c),b.x-b.r*2.6*pu,b.y-b.r*2.6*pu,b.r*5.2*pu,b.r*5.2*pu);ctx.globalAlpha=1;ctx.fillStyle=b.c;ctx.beginPath();ctx.arc(b.x,b.y,b.r*pu,0,TAU);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(b.x-b.r*.25,b.y-b.r*.25,b.r*.4,0,TAU);ctx.fill()}
  // fx
  for(const f of fx){const p=f.t/f.life;
    if(f.k==='ring'){ctx.strokeStyle=f.c;ctx.globalAlpha=1-p;ctx.lineWidth=f.w*(1-p)+1;ctx.beginPath();ctx.arc(f.x,f.y,lerp(f.r0,f.r1,1-Math.pow(1-p,3)),0,TAU);ctx.stroke();ctx.globalAlpha=1}
    else if(f.k==='beam'){ctx.save();ctx.lineCap='round';ctx.globalCompositeOperation='lighter';ctx.globalAlpha=1-p;ctx.strokeStyle=f.col;ctx.lineWidth=f.w*(1-p*.6);ctx.beginPath();ctx.moveTo(f.x1,f.y1);ctx.lineTo(f.x2,f.y2);ctx.stroke();ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.max(1,f.w*.3*(1-p));ctx.stroke();ctx.restore()}
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
  if(S.saws&&state!=='over'){const im=IMG.i_saws;for(let k=0;k<S.saws;k++){const a=run.sawA+k/S.saws*TAU,sx=P.x+Math.cos(a)*72,sy=P.y+Math.sin(a)*72;ctx.save();ctx.translate(sx,sy);ctx.rotate(run.time*14);if(im&&im.width)ctx.drawImage(im,-15,-15,30,30);ctx.restore()}}
  if(S.drone&&state!=='over'){const im=IMG.i_drone;for(let k=0;k<Math.min(2,S.drone);k++){const da=run.time*2+k*Math.PI,dx=P.x+Math.cos(da)*48,dy=P.y-20+Math.sin(da)*20;ctx.fillStyle='rgba(0,0,0,.2)';ctx.beginPath();ctx.ellipse(dx,dy+30,9,3,0,0,TAU);ctx.fill();if(im&&im.width)ctx.drawImage(im,dx-14,dy-10+Math.sin(run.time*6)*2,28,28*im.height/im.width)}}
  if(S.shield&&run.shieldReady&&state!=='over'){const R=P.r*1.9+Math.sin(t*4)*2;ctx.save();ctx.globalAlpha=.16;ctx.fillStyle='#6fe3ff';ctx.beginPath();ctx.arc(P.x,P.y-P.r*.4,R,0,TAU);ctx.fill();ctx.globalAlpha=.65;ctx.strokeStyle='#bff4ff';ctx.lineWidth=2;ctx.stroke();ctx.restore()}
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
  const cx=W/2; const boss=run.waves[run.wave-1].boss; const narrow=W<640; const ty0=narrow?y0+52:y0;
  ctx.textAlign='center';ctx.lineWidth=5;ctx.strokeStyle='rgba(20,6,16,.85)';
  ctx.font=`16px ${FD}`;const wl='WAVE '+run.wave+' / '+run.last;ctx.strokeText(wl,cx,ty0+8);ctx.fillStyle='#cdb8da';ctx.fillText(wl,cx,ty0+8);
  if(run.danger>0){const dz=DANGERS[run.danger];const dx=cx+ctx.measureText(wl).width/2+10;ctx.textAlign='left';ctx.font=`13px ${FD}`;ctx.lineWidth=4;ctx.strokeText('D'+run.danger+' '+dz.name.toUpperCase(),dx,ty0+8);ctx.fillStyle=dz.col;ctx.fillText('D'+run.danger+' '+dz.name.toUpperCase(),dx,ty0+8);ctx.textAlign='center';ctx.lineWidth=5}
  if(!boss){
    const tm=Math.ceil(run.timer);const low=tm<=5&&state==='wave';const s=low?1+.15*Math.abs(Math.sin(t*Math.PI)):1;
    ctx.font=`${Math.round(44*s)}px ${FD}`;ctx.strokeText(tm,cx,ty0+42);ctx.fillStyle=low?'#ff5d6c':'#ffffff';ctx.fillText(tm,cx,ty0+42);
  }else if(run.bosses.some(b=>!b.dead)){
    const bw2=narrow?W*.6:Math.min(420,W-2*(bw+60));const bx=cx-bw2/2,by=ty0+28;const e={hp:run.bosses.reduce((a,b)=>a+Math.max(0,b.dead?0:b.hp),0),maxHp:run.bosses.reduce((a,b)=>a+b.maxHp,0)};
    ctx.fillStyle='rgba(14,8,18,.8)';rr(ctx,bx-3,by-3,bw2+6,22,8);ctx.fill();ctx.fillStyle='#3a0a24';rr(ctx,bx,by,bw2,16,6);ctx.fill();
    ctx.fillStyle='#ff4d8d';rr(ctx,bx,by,Math.max(8,bw2*e.hp/e.maxHp),16,6);ctx.fill();
    ctx.font=`13px ${FD}`;ctx.lineWidth=3;const bl=run.bosses.length>1?run.bosses.map(b=>bossName(b.type).replace('The ','')).join(' + ').toUpperCase():bossName(run.bosses[0].type).toUpperCase();ctx.strokeText(bl,cx,by+9);ctx.fillStyle='#fff';ctx.fillText(bl,cx,by+9);
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
const overlays=['menu','lvl','shop','pause','over','reset'];
function showUI(id){overlays.forEach(o=>$(o).hidden=o!==id);$('hudBtns').hidden=!(id===null||id==='shop');$('btnPause').hidden=id==='shop'}
function toast(msg){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t)}t.textContent=msg;t.style.opacity=1;clearTimeout(t._h);t._h=setTimeout(()=>t.style.opacity=0,1500)}
function modLines(mods){const out=[];for(const k in mods){if(!STAT[k])continue;const v=mods[k];out.push([(v>0?'+':'')+v+(STAT[k][0]==='%'?'':' ')+STAT[k],v>0?'pos':'neg'])}return out}
function fmtLines(lines){return lines.map(([t,c])=>`<li class="${c}">${t}</li>`).join('')}

function buildMenu(){
  const box=$('chars'); box.innerHTML='';
  let nUn=0; const newly=[];
  CHARS.forEach(ch=>{
    const b=document.createElement('button'); b.className='char';
    const cv=document.createElement('canvas'); cv.width=280; cv.height=200;
    const c=cv.getContext('2d'); const r=Math.min(40,150/ch.k);
    if(!isUnlocked(ch.id)){
      const u=UNLOCKS[ch.id], v=Math.min(u.goal,u.val(PROF)), im=IMG['veg_'+ch.id];
      if(im&&im.width){const Hs=r*ch.k,Ws=Hs*im.width/im.height;c.globalAlpha=.9;c.drawImage(tinted('veg_'+ch.id,'#120a18'),120-Ws/2,190-r*1.4+r*.95-r*.12-Hs,Ws,Hs);c.globalAlpha=1}
      c.font=`54px ${FD}`;c.textAlign='center';c.textBaseline='middle';c.fillStyle='#ab96bb';c.fillText('?',120,190-r*1.4-r*ch.k*.35);
      b.classList.add('locked'); b.appendChild(cv);
      b.insertAdjacentHTML('beforeend',`<span class="role">Locked</span><b>${ch.name}</b><p class="req">${u.txt}</p><div class="prog"><i style="width:${Math.round(v/u.goal*100)}%"></i></div><p class="pv">${v.toLocaleString()} / ${u.goal.toLocaleString()}</p>`);
      b.onclick=()=>{audioInit();sfx('deny');b.classList.remove('shake');void b.offsetWidth;b.classList.add('shake')};
      box.appendChild(b); return;
    }
    nUn++;
    if(UNLOCKS[ch.id]&&!PROF.seen.includes(ch.id)){newly.push(ch.id);b.insertAdjacentHTML('beforeend','<span class="newb">NEW</span>')}
    drawVeg(c,ch,120,190-r*1.4,r,{t:1,lx:.3,ly:.2});
    const fm=PROF.fmedals[ch.id], md=fm??PROF.medals[ch.id]; if(md!=null)b.insertAdjacentHTML('beforeend',`<span class="medal" style="--dc:${DANGERS[md].col}" title="Won ${fm!=null?'a Full 20-wave run':'a run'} on Danger ${md} (${DANGERS[md].name})">${fm!=null?'★★':'★'} D${md}</span>`);
    c.save();c.translate(170,150);c.rotate(-.35);drawWeaponSprite(c,ch.weapon,0,WEAPONS[ch.weapon].len*1.6);c.restore();
    const lines=modLines(ch.mods).concat(ch.lines).concat(ch.startW?[]:[['Starts with '+WEAPONS[ch.weapon].name+' ('+WEAPONS[ch.weapon].sets.map(k=>SETS[k].name).join(', ')+')','neu']]);
    b.appendChild(cv);
    b.insertAdjacentHTML('beforeend',`<span class="role">${ch.role}</span><b>${ch.name}</b><p>${ch.desc}</p><ul>${fmtLines(lines)}</ul>`);
    b.onclick=()=>{audioInit();sfx('click');startRun(ch)};
    box.appendChild(b);
  });
  if(newly.length){PROF.seen.push(...newly);saveProf()}
  renderDanger();
  $('unlockCount').textContent=`${nUn} / ${CHARS.length} veggies unlocked`;
  renderArmory();
  const best=PROF.best; $('best').textContent=best?`Best run: wave ${best}${PROF.wins?` · Queen smashed ${PROF.wins}×`:''} · ${PROF.kills.toLocaleString()} aliens defeated`:'';
}
function renderArmory(){
  const box=$('armory'); box.innerHTML=''; let n=0; const fresh=[];
  for(const id in WEAPONS){const def=WEAPONS[id]; const ok=wUnlocked(id); const d=document.createElement('div'); d.className='arm'+(ok?'':' locked');
    const cv=weaponIcon(id,0); if(!ok){const c=cv.getContext('2d');c.globalCompositeOperation='source-in';c.fillStyle='#120a18';c.fillRect(0,0,cv.width,cv.height)}
    d.appendChild(cv);
    if(ok){n++; if(WUNLOCKS[id]&&!PROF.wseen.includes(id)){fresh.push(id);d.insertAdjacentHTML('beforeend','<span class="newb">NEW</span>')}
      d.insertAdjacentHTML('beforeend',`<b>${def.name}</b><div class="pills">${def.sets.map(k=>`<span class="pill" style="--sc:${SETS[k].col}">${SETS[k].name}</span>`).join('')}</div><p>${def.desc}</p>`)}
    else{const u=WUNLOCKS[id],v=Math.min(u.goal,u.val(PROF));
      d.insertAdjacentHTML('beforeend',`<b>${def.name}</b><p class="req">${u.txt}</p><div class="prog"><i style="width:${Math.round(v/u.goal*100)}%"></i></div><p class="pv">${v.toLocaleString()} / ${u.goal.toLocaleString()}</p>`)}
    box.appendChild(d)}
  if(fresh.length){PROF.wseen.push(...fresh);saveProf()}
  $('armCount').textContent=`${n} / ${Object.keys(WEAPONS).length} in the shop`;
}
function renderLen(){
  const box=$('lenSel'); box.innerHTML='';
  for(const L of [10,20]){const b=document.createElement('button');b.className='lenBtn'+((PROF.len||10)===L?' on':'');b.innerHTML=`<b>${RUN_LENS[L].name}</b><span>${L} waves</span>`;
    b.onclick=()=>{audioInit();PROF.len=L;saveProf();sfx('click');renderLen()};box.appendChild(b)}
  $('lenDesc').textContent=(PROF.len||10)===20?'Ten extra waves with a halfway boss, bigger swarms and double elites, then a far tougher final boss. Wins earn a ★★ medal.':'The classic run: 10 waves, then a random final boss.';
}
function renderDanger(){
  renderLen();
  PROF.dsel=Math.min(PROF.dsel,PROF.danger);
  const box=$('danger'); box.innerHTML='';
  DANGERS.forEach((d,i)=>{const b=document.createElement('button');b.className='dbtn'+(i===PROF.dsel?' on':'')+(i>PROF.danger?' lk':'');b.style.setProperty('--dc',d.col);
    b.innerHTML=i>PROF.danger?'<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><rect x="3" y="7" width="10" height="8" rx="2" fill="currentColor"/><path d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="2"/></svg>':String(i);b.title=i>PROF.danger?`Win on Danger ${i-1} to unlock`:`Danger ${i}: ${d.name}`;b.setAttribute('aria-label',b.title);
    b.onclick=()=>{audioInit();if(i>PROF.danger){sfx('deny');toast(`Win a run on Danger ${i-1} to unlock ${d.name}`);return}PROF.dsel=i;saveProf();sfx('click');renderDanger()};box.appendChild(b)});
  const d=DANGERS[PROF.dsel];
  $('dangerDesc').innerHTML=`<b style="color:${d.col}">Danger ${PROF.dsel} · ${d.name}</b> ${d.desc}${PROF.dsel>1?' <span class="inc">Includes all lower levels.</span>':''}`;
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
  const nC=Math.min(6,(run.char.choices||4)+(S.extraChoice||0)); box.classList.toggle('five',nC>4);
  for(let i=0;i<nC;i++){
    let u; do{u=pick(UPG)}while(used.has(u[0])); used.add(u[0]);
    const r=rollRarity(); const v=u[1][r];
    const card=document.createElement('button'); card.className='card pickable r'+r;
    card.innerHTML=`<div class="ic">${iconHTML(UPG_IC[u[0]],u[2],u[3])}</div><div class="ct">${RAR[r].n}</div><div class="cn">${STAT[u[0]].replace('% ','')}</div><ul><li class="pos">+${v}${STAT[u[0]][0]==='%'?'':' '}${STAT[u[0]]}</li></ul>`;
    card.onclick=()=>{B[u[0]]+=v;recalc();if(u[0]==='maxHp')P.hp+=v;run.pendingLv--;sfx('buy');nextStep()};
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
function applyItem(it){run.items[it.id]=(run.items[it.id]||0)+1;for(const k in it.mods)B[k]+=it.mods[k];recalc();if(it.mods.maxHp>0)P.hp+=it.mods.maxHp}
function itemCard(it){
  const card=document.createElement('div'); card.className='card r'+it.r;
  const lines=modLines(it.mods); if(it.extra)lines.unshift([it.extra,'neu']);
  card.innerHTML=`<div class="ic">${itemIcon(it)}</div><div class="ct">${RAR[it.r].n} item${run.items[it.id]?` · own ${run.items[it.id]}`:''}</div><div class="cn">${it.name}</div><ul>${fmtLines(lines)}</ul>`;
  return card;
}
function wStatLine(def,tier){return `${Math.round(wDmg(def,tier))}${def.pellets?'×'+(def.pellets+S.extraProj):''} dmg · ${wCd(def,tier).toFixed(2)}s · ${Math.round(wRange(def))} range`}
function setPills(id,buying){const c=setCounts();return `<div class="pills">${WEAPONS[id].sets.map(k=>{const n=c[k]||0;const up=buying&&SETS[k].tiers.some(([q])=>q===n+1);return `<span class="pill${up?' up':''}" style="--sc:${SETS[k].col}" title="${up?'Buying this unlocks a set bonus':''}">${SETS[k].name}${buying?` ${n}→${n+1}`:n?` ${n}`:''}${up?' ★':''}</span>`}).join('')}</div>`}
function weaponCard(id,tier){
  const def=WEAPONS[id]; const card=document.createElement('div'); card.className='card r'+tier;
  const ic=document.createElement('div'); ic.className='ic'; ic.appendChild(weaponIcon(id,tier)); card.appendChild(ic);
  const owned=run.weapons.some(w=>w.id===id&&w.tier===tier);
  card.insertAdjacentHTML('beforeend',`<div class="ct">Tier ${TIERN[tier]} ${def.melee?'melee':'ranged'} weapon${owned&&tier<3?' · merges':''}</div><div class="cn">${def.name}</div>${setPills(id,!(run.weapons.length>=maxW()&&owned))}<ul><li>${def.desc}</li><li class="neu">${wStatLine(def,tier)}</li></ul>`);
  return card;
}
function rollShop(fresh){
  const out=run.shop.filter(s=>s.locked&&!s.sold);
  let guard=0;
  while(out.length<4&&guard++<60){
    const r=rollRarity(); let o;
    if(Math.random()<.4){const owned=run.weapons.map(w=>w.id);const pool=Object.keys(WEAPONS).filter(k=>wUnlocked(k)||k===run.char.weapon);const id=(owned.length&&Math.random()<.35)?pick(owned):pick(pool);o={kind:'w',id,tier:Math.min(3,r),locked:false,sold:false}}
    else{const it=randomItem(r);o={kind:'i',id:it.id,locked:false,sold:false}}
    if(guard<50&&out.some(x=>x.kind===o.kind&&x.id===o.id))continue;
    out.push(o);
  }
  if(fresh)out.forEach(s=>{s.locked=false});
  run.shop=out;
}
function rerollCost(){if(run.freeRerolls>0)return 0;const base=Math.max(1,Math.round(run.wave*.75))+run.rerolls*Math.max(1,Math.round(run.wave*.5));const b2=Math.round(base*priceMul());return run.char.cheapReroll?Math.max(1,Math.ceil(b2/2)):b2}
let selW=-1;
function openShop(){state='shop';run.rerolls=0;run.freeRerolls=S.freeReroll|0;selW=-1;rollShop(true);showUI('shop');renderShop();$('shop').scrollTop=0}
function renderShop(){
  $('shopMats').textContent=run.mats; $('shopLv').textContent=P.level;
  $('shopSub').textContent=`Wave ${run.wave} cleared · ${run.kills} kills`+(run.lastInterest?` · +${run.lastInterest} interest`:'');
  $('btnGo').textContent=run.wave+1===run.last?'Fight the final boss':(run.waves[run.wave]||{}).mid?'Fight the halfway boss':`Start Wave ${run.wave+1}`;
  const rc=rerollCost(); const rb=$('btnReroll'); rb.innerHTML=rc===0?`Reroll · Free${run.freeRerolls>1?' ×'+run.freeRerolls:''}`:`Reroll · ${rc} <i class="gemI" style="width:10px;height:10px"></i>`; rb.disabled=run.mats<rc; rb.style.opacity=run.mats<rc?.5:1;
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
      run.mats-=price; s.sold=true; PROF.spent=(PROF.spent||0)+price;
      if(s.kind==='w'){const merged=run.weapons.length>=maxW();addWeapon(s.id,s.tier);if(merged)toast(`Merged into ${WEAPONS[s.id].name} ${TIERN[s.tier+1]}`)}
      else applyItem(ITEM_BY[s.id]);
      sfx('buy'); renderShop();
    };
    const lock=document.createElement('button');lock.className='lock'+(s.locked?' on':'');lock.textContent=s.locked?'HELD':'HOLD';lock.title='Keep this offer for the next shop';
    lock.onclick=()=>{s.locked=!s.locked;sfx('click');renderShop()};
    foot.append(buy,lock); card.appendChild(foot); box.appendChild(card);
  });
  $('wcount').textContent=`${run.weapons.length}/${maxW()}`;
  const ws=$('wslots'); ws.innerHTML='';
  ws.style.setProperty('--wn',maxW());
  for(let i=0;i<maxW();i++){
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
    pop.innerHTML=`<div class="wt">${def.name} <span style="color:${RAR[w.tier].c}">${TIERN[w.tier]}</span></div>${setPills(w.id)}<div class="ws2">${def.desc}<br>${wStatLine(def,w.tier)} · ${def.crit+S.crit}% crit</div><div class="row"></div>`;
    const row=pop.querySelector('.row');
    if(mate>=0&&w.tier<3){const mb=document.createElement('button');mb.className='buy';mb.style.flex='0 0 auto';mb.style.padding='9px 16px';mb.textContent=`Merge → ${TIERN[w.tier+1]}`;mb.onclick=()=>{w.tier++;w.flash=1;run.weapons.splice(mate,1);recalc();selW=-1;sfx('levelup');toast(`${def.name} is now tier ${TIERN[w.tier]}`);renderShop()};row.appendChild(mb)}
    const sb=document.createElement('button');sb.className='ghost';sb.textContent=`Sell for ${sell}`;sb.disabled=run.weapons.length<=1;sb.style.opacity=run.weapons.length<=1?.5:1;
    sb.onclick=()=>{if(run.weapons.length<=1)return;run.weapons.splice(selW,1);recalc();run.mats+=sell;selW=-1;sfx('gem',6);renderShop()};
    row.appendChild(sb);
  }else pop.hidden=true;
  renderSets();
  const oi=$('ownedItems'); const ids=Object.keys(run.items);
  oi.innerHTML=ids.length?ids.map(id=>{const it=ITEM_BY[id];return `<span class="oi" title="${it.name}">${itemIcon(it)}${it.name}${run.items[id]>1?' ×'+run.items[id]:''}</span>`}).join(''):'<span class="none">Nothing yet. Items stack.</span>';
  $('statList').innerHTML=STAT_ORDER.map(k=>{let v=S[k];if(k==='maxHp')v=maxHp();v=Math.round(v*10)/10;const c=v>0?'pos':v<0?'neg':'';return `<dt>${STAT[k].replace('% ','')}${STAT[k].startsWith('%')?' %':''}</dt><dd class="${k==='maxHp'?'':c}">${v}</dd>`}).join('');
}
function renderSets(){
  const c=setCounts(); const keys=Object.keys(SETS).sort((a,b)=>(c[b]||0)-(c[a]||0));
  $('setList').innerHTML=keys.filter(k=>c[k]).map(k=>{const S2=SETS[k],n=c[k],t=setTier(k,n);
    const pips=[1,2,3,4,5,6].map(i=>`<i class="${i<=n?'on':''}${S2.tiers.some(([q])=>q===i)?' mk':''}"></i>`).join('');
    return `<div class="set${t>=0?' act':''}" style="--sc:${S2.col}"><div class="sh"><b>${S2.name}</b><span class="pips">${pips}</span></div>${S2.tiers.map(([q,m],i)=>`<div class="st${i===t?' on':i<t?' past':''}">(${q}) ${bonusText(m)}</div>`).join('')}</div>`}).join('')
    ||'<span class="none">Own 2 weapons of the same set to unlock a bonus.</span>';
}
function gameOver(win){
  state='over'; showUI('over');
  $('overTitle').textContent=win?'YOU WIN!':'PICKLED';
  $('overTitle').style.color=win?'#7bd35a':'';
  $('overSub').textContent=win?`${run.char.name} smashed ${run.bosses.map(b=>bossName(b.type).replace(/^The /,'the ')).join(' and ')} on ${DANGERS[run.danger].name} ${run.len===20?'after all 20 waves ':''}and the crater is quiet again.`:`${run.char.name} fell on wave ${run.wave} of ${run.last}.`;
  $('overStats').innerHTML=`<div><b>${run.wave}/${run.last}</b>wave</div><div><b>${run.kills}</b>kills</div><div><b>${run.bestCombo}</b>best combo</div><div><b>${run.totalMats}</b>materials</div><div><b>${P.level}</b>level</div><div><b style="color:${DANGERS[run.danger].col}">${run.danger}</b>danger</div>`;
  let newDanger=-1;
  if(win){PROF.wins++;PROF.medals[run.char.id]=Math.max(PROF.medals[run.char.id]??-1,run.danger);if(run.len===20)PROF.fmedals[run.char.id]=Math.max(PROF.fmedals[run.char.id]??-1,run.danger);if(run.danger===PROF.danger&&PROF.danger<DANGERS.length-1){PROF.danger++;PROF.dsel=PROF.danger;newDanger=PROF.danger}}
  checkUnlocks(); saveProf();
  const nu=(run.newUnlocks||[]).map(id=>CHARS.find(c=>c.id===id));
  const nw=run.newWeapons||[];
  const box=$('overUnlocks'); box.hidden=!nu.length&&newDanger<0&&!nw.length;
  if(!nu.length)box.innerHTML='';
  if(nu.length){box.innerHTML='<div class="unlT">New veggie'+(nu.length>1?'s':'')+' unlocked!</div><div class="unlL"></div>';const L=box.querySelector('.unlL');
    nu.forEach(ch=>{const cv=document.createElement('canvas');cv.width=160;cv.height=150;const c=cv.getContext('2d');const r=Math.min(32,118/ch.k);drawVeg(c,ch,80,140-r*1.3,r,{t:1,lx:.3,ly:.2});const d=document.createElement('div');d.className='unlC';d.appendChild(cv);d.insertAdjacentHTML('beforeend',`<b>${ch.name}</b><span>${ch.role}</span>`);L.appendChild(d)})}
  if(nw.length){box.insertAdjacentHTML('beforeend','<div class="unlT" style="color:var(--r1)">New weapon'+(nw.length>1?'s':'')+' in the shop!</div><div class="unlL wl"></div>');const L=box.querySelector('.unlL.wl');
    nw.forEach(id=>{const d=document.createElement('div');d.className='unlC wpn';d.appendChild(weaponIcon(id,0));d.insertAdjacentHTML('beforeend',`<b>${WEAPONS[id].name}</b><span>${WEAPONS[id].sets.map(k=>SETS[k].name).join(' · ')}</span>`);L.appendChild(d)})}
  if(newDanger>=0){const dz=DANGERS[newDanger];box.insertAdjacentHTML('afterbegin',`<div class="dUn" style="--dc:${dz.col}"><b>Danger ${newDanger} unlocked: ${dz.name}</b><span>${dz.desc}</span></div>`)}
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
$('btnReroll').onclick=()=>{const c=rerollCost();if(run.mats<c){sfx('deny');return}run.mats-=c;PROF.spent=(PROF.spent||0)+c;if(c===0&&run.freeRerolls>0)run.freeRerolls--;else run.rerolls++;run.shop.forEach(s=>{if(s.sold)s.locked=false});rollShop();sfx('click');renderShop();document.querySelectorAll('#shopCards .card').forEach(c=>c.classList.add('pop'))};
$('btnGo').onclick=()=>{sfx('click');startWave(run.wave+1)};
$('btnReset').onclick=()=>{audioInit();sfx('click');
  const n=PROF.unlocked.length, w=PROF.wunlocked.length, m=Object.keys(PROF.medals).length;
  $('resetList').innerHTML=`<li>${n} unlocked veggie${n===1?'':'s'} (back to Beet, Onion and Radish)</li><li>${w} unlocked weapon${w===1?'':'s'}</li><li>Danger levels up to ${PROF.danger} and ${m} medal${m===1?'':'s'}</li><li>Best wave ${PROF.best}, ${PROF.kills.toLocaleString()} aliens defeated and all other stats</li>`;
  showUI('reset');$('btnResetNo').focus()};
$('btnResetNo').onclick=()=>{sfx('click');showUI('menu')};
$('btnResetYes').onclick=()=>{resetProgress();sfx('boom');buildMenu();showUI('menu');$('menu').scrollTop=0;toast('Progress reset. Fresh crater!')};
$('btnAgain').onclick=()=>{startRun(run.char)};
$('btnMenu').onclick=()=>{run=null;state='menu';buildMenu();showUI('menu')};
setMuted(AU.muted);

/* ================= boot ================= */
showUI('menu');
loadAssets().then(()=>{
  buildFloor(); checkUnlocks(); state='menu'; buildMenu();
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{if(state==='menu')buildMenu()});
});
requestAnimationFrame(loop);
window.BD={get webs(){return webs},get run(){return run},get P(){return P},get S(){return S},get state(){return state},get enemies(){return enemies},get eb(){return ebullets},get kpools(){return kpools},makeEnemyFn:makeEnemy,get rings(){return rings},ITEMS,applyItem,get marks(){return marks},BOSSES,get pools(){return pools},makeEnemy,get B(){return B},recalc,PROF,WAVES_FULL,wUnlocked,checkUnlocks,buildMenu,startRun,CHARS,WEAPONS,startWave,endWave,addWeapon};
