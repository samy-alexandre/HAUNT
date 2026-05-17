<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>HAUNTED NIGHTMARE 3D - EMOTIVE 2026 EDITION</title>
<link href="https://fonts.googleapis.com/css2?family=Creepster&family=Share+Tech+Mono&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:root {
  --bg: #020204; --bg2: #06060c; --border: #121224;
  --accent: #00ff88; --danger: #ff2a5f; --text: #e2e2f0; --dim: #4a4a6a;
}
html,body{width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Share Tech Mono',monospace;user-select:none;}

.screen{display:none;position:fixed;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;padding:2rem;background:radial-gradient(circle at center, #060614 0%, #020204 100%);z-index:10;}
.screen.active{display:flex;}

h1{font-family:'Creepster',cursive;font-size:clamp(3.5rem,8vw,6rem);color:var(--danger);text-shadow:0 0 25px rgba(255,42,95,0.6);letter-spacing:0.1em;}

.panel{background:rgba(4,4,8,0.9);border:2px solid var(--border);border-radius:8px;padding:2rem;width:100%;max-width:500px;}
.ptitle{font-size:0.75rem;letter-spacing:0.25em;color:var(--accent);text-transform:uppercase;margin-bottom:1rem;font-weight:bold;}

input[type=text]{background:#000;border:2px solid var(--border);color:#fff;font-family:inherit;font-size:1.2rem;padding:0.7rem 1rem;width:100%;border-radius:4px;outline:none;}

.btn{display:block;width:100%;padding:0.9rem;background:transparent;border:2px solid var(--accent);color:var(--accent);font-family:inherit;font-size:1rem;letter-spacing:0.15em;text-transform:uppercase;cursor:pointer;border-radius:4px;font-weight:bold;}
.btn:hover{background:var(--accent);color:#000;}
.btn.primary{border-color:var(--danger);color:var(--danger);}
.btn.primary:hover{background:var(--danger);color:#000;}

#gameScreen{display:none;position:fixed;inset:0;background:#000;}
#gameScreen.active{display:flex;}
#canvas3d_container {width:100%;height:100%;position:absolute;inset:0;z-index:1;}
#vignette_overlay {position:absolute;inset:0;pointer-events:none;z-index:2;background:radial-gradient(circle, transparent 25%, rgba(0,0,0,0.95) 100%);transition: background 0.3s;}
#reticle{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;pointer-events:none;z-index:5;}
#reticle::before{content:'';position:absolute;background:rgba(255,255,255,0.4);top:4px;left:-5px;width:20px;height:2px;}

#hud_overlay {position:absolute;inset:0;pointer-events:none;z-index:4;display:flex;flex-direction:column;justify-content:space-between;padding:1.5rem;}
.hud_row {display:flex;justify-content:space-between;width:100%;}
.hud_card {background:rgba(1,1,3,0.85);border:1px solid rgba(31,31,58,0.4);padding:0.8rem 1.2rem;border-radius:6px;}
.hud_lbl {font-size:0.6rem;color:var(--dim);letter-spacing:2px;text-transform:uppercase;}
.hud_val {font-size:1.4rem;font-weight:bold;color:var(--accent);font-family:'Bebas Neue',sans-serif;}

#stBar {width:120px;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;}
#stFill {height:100%;width:100%;background:var(--accent);}

#lock_notice {position:absolute;inset:0;background:rgba(0,0,0,0.9);z-index:20;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;}
#lock_notice p {font-size:1.4rem;color:var(--accent);letter-spacing:2px;}
</style>
</head>
<body>

<div id="menuScreen" class="screen active">
  <h1>HAUNT 2026</h1>
  <div style="color:var(--dim); letter-spacing:5px; font-size:0.8rem; margin-bottom:15px;">DIVERGENCE DIMENSIONNELLE ASYMÉTRIQUE</div>
  
  <div class="panel">
    <div class="ptitle">▸ Identité</div>
    <input type="text" id="nameIn" placeholder="Pseudo" maxlength="14" value="Survivor"/>
  </div>

  <div style="display:flex; gap:1rem; width:100%; max-width:500px;">
    <button class="btn primary" id="btnCreate">Créer Anomalie</button>
    <div style="display:flex; flex-direction:column; flex:1; gap:0.4rem;">
      <input type="text" id="codeIn" placeholder="CODE" maxlength="6" style="text-align:center;"/>
      <button class="btn" id="btnJoin">Infiltrer</button>
    </div>
  </div>
  <div id="menuErr" style="color:var(--danger); font-size:0.9rem;"></div>
</div>

<div id="lobbyScreen" class="screen">
  <h1>SALLE D'ATTENTE</h1>
  <div class="panel" style="text-align:center;">
    <div id="lCodeVal" style="font-family:'Bebas Neue',sans-serif; font-size:3.5rem; color:var(--accent);">------</div>
    <div id="lStage" style="color:#888;">En attente de synchronisation...</div>
  </div>
  <button id="readyBtn" class="btn primary" style="display:none;" onclick="socket.emit('start_game')">LANCER LE PROTOCOLE ▶</button>
</div>

<div id="gameScreen">
  <div id="canvas3d_container"></div>
  <div id="vignette_overlay"></div>
  <div id="reticle"></div>

  <div id="lock_notice">
    <p>CLIQUEZ POUR ENTRER DANS L'ANOMALIE</p>
    <span style="font-size:0.8rem; margin-top:10px; color:#666;">Z,Q,S,D (ou flèches) pour MARCHER · SOURIS pour orienter la vision (360°) · MAJ pour COURIR · ESPACE pour interagir</span>
  </div>

  <div id="hud_overlay">
    <div class="hud_row">
      <div class="hud_card">
        <span class="hud_lbl">Dimension Affectée</span>
        <span class="hud_val" id="hDim" style="color:#cc22ff;">MATÉRIELLE</span>
      </div>
      <div class="hud_card">
        <span class="hud_lbl">Colis Sécurisés</span>
        <span class="hud_val" id="hItems">0 / 0</span>
      </div>
      <div class="hud_card">
        <span class="hud_lbl">Résistance Physio</span>
        <span class="hud_val" id="hLives" style="color:var(--danger);">❤️❤️❤️</span>
      </div>
      <div class="hud_card">
        <span class="hud_lbl">Adrénaline</span>
        <div id="stBar"><div id="stFill"></div></div>
      </div>
    </div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io({transports:['websocket','polling']});
let myId=null, myRoom=null, gameMap=null, gameState=null, isHost=false, gameStarted=false;

// AUDIO PROCÉDURAL SYNTHÉTISÉ
const AudioEngine = {
  ctx: null, ambientStarted: false,
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.startAmbient();
  },
  startAmbient() {
    if (!this.ctx || this.ambientStarted) return;
    this.ambientStarted = true;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(45, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start();
  },
  playPickup() {
    if(!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(840, now+0.1);
    gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.1);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(now+0.1);
  },
  playFootstep(isRunning) {
    if(!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle'; osc.frequency.setValueAtTime(40, now);
    gain.gain.setValueAtTime(isRunning ? 0.25 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now+0.08);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(); osc.stop(now+0.08);
  }
};

document.getElementById('btnCreate').onclick=()=>{
  socket.emit('create_room',{name:document.getElementById('nameIn').value});
};
document.getElementById('btnJoin').onclick=()=>{
  socket.emit('join_room',{roomCode:document.getElementById('codeIn').value, name:document.getElementById('nameIn').value});
};

socket.on('room_created',(data)=>{ myId=data.playerId; myRoom=data.roomId; isHost=true; setupLobby(); });
socket.on('joined',(data)=>{ myId=data.playerId; myRoom=data.roomId; isHost=false; setupLobby(); });
socket.on('lobby_state',(data)=>{
  document.getElementById('lStage').textContent = "Membres infiltrés : " + Object.values(data.players).map(p=>p.name).join(', ');
});

function setupLobby(){
  document.getElementById('menuScreen').classList.remove('active');
  document.getElementById('lobbyScreen').classList.add('active');
  document.getElementById('lCodeVal').textContent=myRoom;
  if(isHost) document.getElementById('readyBtn').style.display='block';
}

const lockNotice = document.getElementById('lock_notice');
const container3d = document.getElementById('canvas3d_container');
lockNotice.onclick = () => { AudioEngine.init(); if(gameStarted) container3d.requestPointerLock(); };

document.addEventListener('pointerlockchange', () => {
  lockNotice.style.display = (document.pointerLockElement === container3d) ? 'none' : 'flex';
});

const keys={};
let viewYaw = 0, viewPitch = 0;

window.addEventListener('keydown', e => {
  let k = e.key.toLowerCase();
  if(k==='z' || e.code==='ArrowUp') keys['up']=true;
  if(k==='s' || e.code==='ArrowDown') keys['down']=true;
  if(k==='q' || e.code==='ArrowLeft') keys['left']=true;
  if(k==='d' || e.code==='ArrowRight') keys['right']=true;
  if(e.code==='ShiftLeft') keys['shift']=true;
  if(e.code==='Space' || k==='e') keys['action']=true;
});
window.addEventListener('keyup', e => {
  let k = e.key.toLowerCase();
  if(k==='z' || e.code==='ArrowUp') keys['up']=false;
  if(k==='s' || e.code==='ArrowDown') keys['down']=false;
  if(k==='q' || e.code==='ArrowLeft') keys['left']=false;
  if(k==='d' || e.code==='ArrowRight') keys['right']=false;
  if(e.code==='ShiftLeft') keys['shift']=false;
  if(e.code==='Space' || k==='e') keys['action']=false;
});

window.addEventListener('mousemove', e => {
  if (document.pointerLockElement === container3d) {
    viewYaw -= e.movementX * 0.0022;
    viewPitch -= e.movementY * 0.0022;
    viewPitch = Math.max(-1.4, Math.min(1.4, viewPitch)); // Blocage haut/bas
  }
});

let scene, camera, renderer, wallMaterial;
let wallsArray = [], meshesItems = {}, meshesMonsters = {};
let headBobTimer = 0, lastStepTime = 0;

function initEngine() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020205);
  scene.fog = new THREE.FogExp2(0x020205, 0.3);

  camera = new THREE.PerspectiveCamera(75, container3d.clientWidth/container3d.clientHeight, 0.1, 100);
  
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container3d.clientWidth, container3d.clientHeight);
  container3d.appendChild(renderer.domElement);

  const light = new THREE.AmbientLight(0x0a0a15, 0.5);
  scene.add(light);

  const spot = new THREE.SpotLight(0xfffaed, 3.0, 20, Math.PI/5, 0.5);
  spot.position.set(0,0,0);
  camera.add(spot);
  camera.add(spot.target);
  spot.target.position.set(0,0,-1);
  scene.add(camera);
}

function buildMap3D() {
  wallsArray.forEach(w => scene.remove(w));
  wallsArray = [];
  if(!gameMap) return;

  const wGeo = new THREE.BoxGeometry(1, 2.5, 1);
  wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1c25, roughness: 0.8 });

  for(let y=0; y<gameMap.length; y++) {
    for(let x=0; x<gameMap[y].length; x++) {
      if(gameMap[y][x] === 1) {
        const wall = new THREE.Mesh(wGeo, wallMaterial);
        wall.position.set(x+0.5, 1.25, y+0.5);
        scene.add(wall);
        wallsArray.push(wall);
      }
    }
  }
}

socket.on('game_started', () => {
  gameStarted = true;
  document.getElementById('lobbyScreen').classList.remove('active');
  document.getElementById('gameScreen').classList.add('active');
  initEngine();
  buildMap3D();
  container3d.requestPointerLock();
  loop();
});

socket.on('sound', (t) => { if(t==='pickup') AudioEngine.playPickup(); });
socket.on('level_start', () => { buildMap3D(); });

socket.on('state', (state) => { gameState = state; });

let lastActionSent = false;

function loop() {
  requestAnimationFrame(loop);
  if(!gameStarted || !gameState) return;

  const me = gameState.players[myId];
  if(me && !me.dead) {
    let dx=0, dy=0;
    if(keys['up']) dy = 1; if(keys['down']) dy = -1;
    if(keys['left']) dx = -1; if(keys['right']) dx = 1;

    let actionTrigger = (keys['action'] && !lastActionSent);
    lastActionSent = keys['action'];

    let finalDx = -dy * Math.sin(viewYaw) + dx * Math.cos(viewYaw);
    let finalDy = -dy * Math.cos(viewYaw) - dx * Math.sin(viewYaw);
    if(dx!==0 || dy!==0) {
      let len = Math.hypot(finalDx, finalDy);
      finalDx /= len; finalDy /= len;
    }

    socket.emit('input', { dx: finalDx, dy: finalDy, action: actionTrigger, boost: !!keys['shift'] });

    // Interpolation fluide cinématique de la caméra
    camera.position.x += (me.x - camera.position.x) * 0.18;
    camera.position.z += (me.y - camera.position.z) * 0.18;

    // Head bobbing & pas réalistes liés à la vitesse réelle
    if(dx!==0 || dy!==0) {
      let speedFactor = keys['shift'] && me.stamina > 10 ? 0.14 : 0.07;
      headBobTimer += speedFactor;
      camera.position.y = 1.25 + Math.sin(headBobTimer) * 0.025;
      
      let stepInterval = keys['shift'] && me.stamina > 10 ? 260 : 460;
      if(Date.now() - lastStepTime > stepInterval) {
        AudioEngine.playFootstep(keys['shift']);
        lastStepTime = Date.now();
      }
    } else {
      camera.position.y += (1.25 - camera.position.y) * 0.1;
    }

    camera.rotation.set(viewPitch, viewYaw, 0, 'YXZ');

    // UI Updates
    document.getElementById('hDim').textContent = me.dimension.toUpperCase();
    document.getElementById('hDim').style.color = me.dimension === 'astral' ? '#00e1ff' : '#cc22ff';
    document.getElementById('hItems').textContent = `${gameState.itemsDelivered} / ${gameState.totalItems}`;
    document.getElementById('hLives').textContent = '❤️'.repeat(Math.max(0, me.lives));
    document.getElementById('stFill').style.width = `${(me.stamina/120)*100}%`;

    // EFFET VISUEL 2026 : Le Plan Astral applique un filtre de distorsion
    document.getElementById('vignette_overlay').style.background = me.dimension === 'astral' 
      ? 'radial-gradient(circle, transparent 20%, rgba(0,24,40,0.96) 100%)'
      : 'radial-gradient(circle, transparent 25%, rgba(0,0,0,0.95) 100%)';
  }

  // RENDU FILTRÉ DES OBJETS (MÉCANIQUE D'ASYMÉTRIE COGNITIVE 2026)
  gameState.items.forEach(item => {
    if(item.collected || item.carriedBy !== null) {
      if(meshesItems[item.id]) { scene.remove(meshesItems[item.id]); delete meshesItems[item.id]; }
    } else {
      // Les objets ne se matérialisent que dans le Plan Astral !
      if(me && me.dimension === 'astral') {
        if(!meshesItems[item.id]) {
          let itemColor = item.type === 'golden' ? 0xffd700 : (item.type==='cursed' ? 0xcc22ff : 0x0088ff);
          const geo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
          const mat = new THREE.MeshStandardMaterial({ color: itemColor, emissive: itemColor });
          const mesh = new THREE.Mesh(geo, mat);
          scene.add(mesh); meshesItems[item.id] = mesh;
        }
        meshesItems[item.id].position.set(item.x, 0.4 + Math.sin(Date.now()*0.005)*0.05, item.y);
        meshesItems[item.id].rotation.y += 0.02;
      } else {
        // Invisibles dans le plan matériel
        if(meshesItems[item.id]) { scene.remove(meshesItems[item.id]); delete meshesItems[item.id]; }
      }
    }
  });

  // GESTION ET RENDU DES MONSTRES / ÉCHOS
  gameState.monsters.forEach(m => {
    if(!meshesMonsters[m.id]) {
      let mColor = m.isEcho ? 0x00ffcc : 0xff1144; // Écho turquoise vs Monstre rouge
      const geo = new THREE.SphereGeometry(0.25, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: mColor, wireframe: m.isEcho });
      const mesh = new THREE.Mesh(geo, mat);
      scene.add(mesh); meshesMonsters[m.id] = mesh;
    }
    meshesMonsters[m.id].position.set(m.x, 0.6, m.y);
  });

  renderer.render(scene, camera);
}
</script>
</body>
</html>
