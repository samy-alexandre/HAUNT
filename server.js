const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const MAP_W = 28;
const MAP_H = 20;
const SPAWN_X = 1.5, SPAWN_Y = 1.5;
const SPAWN_SAFE_R = 3.5;
const MAX_LIVES = 3;
const STAMINA_MAX = 120, STAMINA_DRAIN = 1, STAMINA_REGEN = 0.67;

function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] = (x===0||x===MAP_W-1||y===0||y===MAP_H-1) ? 1 : 0;
    }
  }
  // Vertical walls
  [{x:7,f:1,t:5},{x:7,f:7,t:12},{x:7,f:14,t:19},
   {x:14,f:1,t:3},{x:14,f:5,t:10},{x:14,f:12,t:19},
   {x:21,f:1,t:6},{x:21,f:8,t:19}
  ].forEach(({x,f,t})=>{ for(let y=f;y<=t;y++) map[y][x]=1; });
  // Horizontal walls
  [{y:7,f:1,t:5},{y:13,f:1,t:5},
   {y:4,f:8,t:12},{y:11,f:8,t:12},
   {y:7,f:15,t:19},{y:13,f:15,t:19},
   {y:5,f:22,t:26},{y:12,f:22,t:26}
  ].forEach(({y,f,t})=>{ for(let x=f;x<=t;x++) map[y][x]=1; });
  // Pillars
  [[2,3],[5,3],[2,11],[5,11],[2,16],[5,16],
   [10,2],[13,2],[10,6],[13,6],[10,10],[13,10],[10,14],[13,14],
   [17,3],[20,3],[17,10],[20,10],[17,16],[20,16],
   [23,2],[26,2],[23,9],[26,9],[23,16],[26,16]
  ].forEach(([x,y])=>{ if(map[y]&&map[y][x]!==undefined) map[y][x]=1; });
  // Clear spawn zone (3x3)
  for(let dy=0;dy<3;dy++) for(let dx=0;dx<3;dx++) map[1+dy][1+dx]=0;
  return map;
}

function floodFill(map, sx, sy) {
  const reachable = new Set();
  const fx=Math.floor(sx), fy=Math.floor(sy);
  if(!map[fy]||map[fy][fx]===1) return reachable;
  const queue=[[fx,fy]];
  reachable.add(`${fx},${fy}`);
  while(queue.length) {
    const [cx,cy]=queue.shift();
    for(const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
      const key=`${nx},${ny}`;
      if(nx>=0&&nx<MAP_W&&ny>=0&&ny<MAP_H&&!reachable.has(key)&&map[ny][nx]===0) {
        reachable.add(key); queue.push([nx,ny]);
      }
    }
  }
  return reachable;
}

function monsterFreedom(map, x, y) {
  return floodFill(map, x, y).size;
}

function distPt(ax,ay,bx,by){ return Math.sqrt((ax-bx)**2+(ay-by)**2); }
function dist(a,b){ return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2); }

function generateExit(map, reachable) {
  const candidates = [
    {x:25,y:1},{x:25,y:17},{x:1,y:17},
    {x:9,y:1},{x:17,y:1},{x:22,y:17},
    {x:1,y:9},{x:25,y:9},{x:9,y:17},{x:15,y:17},
  ].sort(()=>Math.random()-0.5);
  for(const c of candidates) {
    if(c.x+1>=MAP_W-1||c.y+1>=MAP_H-1) continue;
    if(!reachable.has(`${c.x},${c.y}`)) continue;
    const newMap=map.map(r=>[...r]);
    for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++) newMap[c.y+dy][c.x+dx]=0;
    // Make sure exit is still reachable from spawn
    const r2=floodFill(newMap,SPAWN_X,SPAWN_Y);
    if(r2.has(`${c.x},${c.y}`)) return {x:c.x+0.5,y:c.y+0.5,gx:c.x,gy:c.y,map:newMap};
  }
  const newMap=map.map(r=>[...r]);
  for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++) newMap[1+dy][25+dx]=0;
  return {x:25.5,y:1.5,gx:25,gy:1,map:newMap};
}

function generateItems(map, level, exit, reachable) {
  const count=6+level*2;
  const positions=[], forbidden=new Set();
  for(let dy=-1;dy<=2;dy++) for(let dx=-1;dx<=2;dx++) {
    forbidden.add(`${exit.gx+dx},${exit.gy+dy}`);
    forbidden.add(`${Math.floor(SPAWN_X)+dx},${Math.floor(SPAWN_Y)+dy}`);
  }
  let tries=0;
  while(positions.length<count&&tries<5000) {
    tries++;
    const x=1+Math.floor(Math.random()*(MAP_W-2));
    const y=1+Math.floor(Math.random()*(MAP_H-2));
    const key=`${x},${y}`;
    if(!forbidden.has(key)&&map[y][x]===0&&reachable.has(key)) {
      positions.push({x:x+0.5,y:y+0.5}); forbidden.add(key);
    }
  }
  return positions.map((p,i)=>({id:i,x:p.x,y:p.y,collected:false,carriedBy:null}));
}

function generateMonsters(map, level, reachable) {
  const spd=(b)=>b+level*0.003;
  const desired=[
    {x:10,y:5,dx:1,dy:0,speed:spd(0.022)},
    {x:22,y:15,dx:-1,dy:0,speed:spd(0.019)},
    {x:4,y:15,dx:0,dy:1,speed:spd(0.017)},
    {x:17,y:10,dx:1,dy:1,speed:spd(0.015)},
    {x:24,y:5,dx:-1,dy:0,speed:spd(0.024)},
    {x:8,y:12,dx:0,dy:-1,speed:spd(0.026)},
  ];
  const count=Math.min(4+Math.floor(level/2),desired.length);
  const monsters=[];
  for(let i=0;i<count;i++) {
    const c=desired[i];
    let placed=false;
    outer: for(let r=0;r<12;r++) {
      for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++) {
        const nx=Math.floor(c.x)+dx, ny=Math.floor(c.y)+dy;
        if(nx<1||nx>=MAP_W-1||ny<1||ny>=MAP_H-1) continue;
        if(map[ny][nx]!==0) continue;
        if(!reachable.has(`${nx},${ny}`)) continue;
        if(monsterFreedom(map,nx,ny)<15) continue;
        if(distPt(nx,ny,SPAWN_X,SPAWN_Y)<SPAWN_SAFE_R+2) continue;
        monsters.push({id:i,x:nx+0.5,y:ny+0.5,dx:c.dx,dy:c.dy,speed:c.speed});
        placed=true; break outer;
      }
    }
    if(!placed) console.log(`Warning: monster ${i} could not be placed`);
  }
  return monsters;
}

function buildLevel(level) {
  const baseMap=generateMap();
  const reachable=floodFill(baseMap,SPAWN_X,SPAWN_Y);
  const exitData=generateExit(baseMap,reachable);
  const map=exitData.map;
  const exit={x:exitData.x,y:exitData.y,gx:exitData.gx,gy:exitData.gy};
  const reachable2=floodFill(map,SPAWN_X,SPAWN_Y);
  return {
    map, exit,
    items:generateItems(map,level,exit,reachable2),
    monsters:generateMonsters(map,level,reachable2),
  };
}

function createRoom(roomId, hostId) {
  const level=1;
  const lvl=buildLevel(level);
  return {
    id:roomId, hostId, players:{},
    ...lvl,
    score:0, gameOver:false, gameWon:false, started:false,
    itemsDelivered:0, totalItems:6+level*2,
    level, chatMessages:[], leaderboard:[],
  };
}

const R=0.28;
function canMove(map,x,y) {
  for(const[cx,cy]of[[x-R,y-R],[x+R,y-R],[x-R,y+R],[x+R,y+R]]) {
    const tx=Math.floor(cx),ty=Math.floor(cy);
    if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H||map[ty][tx]===1) return false;
  }
  return true;
}
function wallSimple(map,x,y) {
  const tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return true;
  return map[ty][tx]===1;
}
function inSpawn(x,y){ return distPt(x,y,SPAWN_X,SPAWN_Y)<SPAWN_SAFE_R; }

function updateRoom(room) {
  if(room.gameOver||room.gameWon||!room.started) return;
  const players=Object.values(room.players);
  if(!players.length) return;

  // Monsters
  room.monsters.forEach(m=>{
    let target=null,minD=Infinity;
    players.forEach(p=>{ if(!p.dead&&!inSpawn(p.x,p.y)){const d=dist(m,p);if(d<minD){minD=d;target=p;}} });
    let dx=m.dx,dy=m.dy;
    if(target&&minD<8){const a=Math.atan2(target.y-m.y,target.x-m.x);dx=Math.cos(a);dy=Math.sin(a);}
    const spd=m.speed*2;
    const nx=m.x+dx*spd, ny=m.y+dy*spd;
    if(!wallSimple(room.map,nx,m.y)&&!inSpawn(nx,m.y)) m.x=nx; else m.dx=-m.dx;
    if(!wallSimple(room.map,m.x,ny)&&!inSpawn(m.x,ny)) m.y=ny; else m.dy=-m.dy;

    players.forEach(p=>{
      if(!p.dead&&!inSpawn(p.x,p.y)&&dist(m,p)<0.7) {
        // Drop item
        if(p.carrying!==null){
          const item=room.items.find(i=>i.id===p.carrying);
          if(item){item.carriedBy=null;item.x=p.x;item.y=p.y;}
          p.carrying=null;
        }
        p.lives=(p.lives||MAX_LIVES)-1;
        if(p.lives<=0) {
          p.lives=0; p.dead=true; p.eliminated=true;
          io.to(room.id).emit('player_eliminated',{name:p.name});
        } else {
          p.dead=true; p.respawnTimer=120;
        }
        io.to(room.id).emit('sound','death');
      }
    });
  });

  // Respawn
  players.forEach(p=>{
    if(p.dead&&!p.eliminated){
      p.respawnTimer--;
      if(p.respawnTimer<=0){p.dead=false;p.x=SPAWN_X;p.y=SPAWN_Y;}
    }
    // Stamina regen
    if(!p.boosting) p.stamina=Math.min(STAMINA_MAX,(p.stamina||STAMINA_MAX)+STAMINA_REGEN);
  });

  // Check all eliminated
  const alive=players.filter(p=>!p.eliminated);
  if(alive.length===0&&players.length>0){
    room.gameOver=true;
    io.to(room.id).emit('sound','death');
    return;
  }

  // Exit delivery
  room.items.forEach(item=>{
    if(!item.collected&&item.carriedBy!==null){
      const carrier=room.players[item.carriedBy];
      if(carrier&&dist(carrier,room.exit)<1.5){
        item.collected=true;item.carriedBy=null;carrier.carrying=null;
        room.itemsDelivered++;
        const pts=100+room.level*50;
        room.score+=pts;carrier.score=(carrier.score||0)+pts;
        io.to(room.id).emit('sound','score');
      }
    }
  });

  if(room.itemsDelivered>=room.totalItems&&!room.gameWon){
    room.gameWon=true;
    room.leaderboard=Object.values(room.players)
      .map(p=>({name:p.name,score:p.score||0,deaths:p.deaths||0,color:p.color,lives:p.lives||0}))
      .sort((a,b)=>b.score-a.score);
    io.to(room.id).emit('sound','win');
  }
}

setInterval(()=>{
  Object.values(rooms).forEach(room=>{
    updateRoom(room);
    if(Object.keys(room.players).length>0){
      io.to(room.id).emit('state',{
        players:room.players,items:room.items,monsters:room.monsters,
        score:room.score,gameOver:room.gameOver,gameWon:room.gameWon,
        itemsDelivered:room.itemsDelivered,totalItems:room.totalItems,
        level:room.level,leaderboard:room.leaderboard,
        hostId:room.hostId,exit:room.exit
      });
    }
  });
},1000/30);

io.on('connection',socket=>{
  let currentRoom=null,playerId=socket.id;

  socket.on('create_room',({name,color})=>{
    const roomId=uuidv4().slice(0,6).toUpperCase();
    rooms[roomId]=createRoom(roomId,playerId);
    currentRoom=roomId;socket.join(roomId);
    rooms[roomId].players[playerId]={
      id:playerId,x:SPAWN_X,y:SPAWN_Y,name:name||'Joueur',
      color:color||'#00ff88',carrying:null,dead:false,eliminated:false,
      respawnTimer:0,score:0,deaths:0,lives:MAX_LIVES,
      stamina:STAMINA_MAX,boosting:false,dir:'down'
    };
    socket.emit('room_created',{roomId,playerId,isHost:true});
    io.to(roomId).emit('lobby_state',{players:rooms[roomId].players,hostId:rooms[roomId].hostId});
  });

  socket.on('join_room',({roomId,name,color})=>{
    const room=rooms[roomId];
    if(!room){socket.emit('error','Salle introuvable !');return;}
    if(room.started){socket.emit('error','Partie déjà lancée !');return;}
    if(Object.keys(room.players).length>=6){socket.emit('error','Salle pleine !');return;}
    currentRoom=roomId;socket.join(roomId);
    const num=Object.keys(room.players).length;
    room.players[playerId]={
      id:playerId,x:SPAWN_X+num*0.7,y:SPAWN_Y,name:name||`Joueur ${num+1}`,
      color:color||'#ff6b6b',carrying:null,dead:false,eliminated:false,
      respawnTimer:0,score:0,deaths:0,lives:MAX_LIVES,
      stamina:STAMINA_MAX,boosting:false,dir:'down'
    };
    socket.emit('joined',{playerId,roomId,isHost:false});
    socket.emit('chat_history',room.chatMessages.slice(-20));
    io.to(roomId).emit('lobby_state',{players:room.players,hostId:room.hostId});
  });

  socket.on('update_color',({color})=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const p=rooms[currentRoom].players[playerId];
    if(p){p.color=color;io.to(currentRoom).emit('lobby_state',{players:rooms[currentRoom].players,hostId:rooms[currentRoom].hostId});}
  });

  socket.on('start_game',()=>{
    if(!currentRoom||!rooms[currentRoom])return;
    if(rooms[currentRoom].hostId!==playerId)return;
    rooms[currentRoom].started=true;
    io.to(currentRoom).emit('map',rooms[currentRoom].map);
    io.to(currentRoom).emit('game_started');
  });

  socket.on('next_level',()=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const room=rooms[currentRoom];
    if(room.hostId!==playerId||!room.gameWon)return;
    room.level++;
    const lvl=buildLevel(room.level);
    room.map=lvl.map;room.exit=lvl.exit;
    room.items=lvl.items;room.monsters=lvl.monsters;
    room.itemsDelivered=0;room.totalItems=6+room.level*2;room.gameWon=false;
    // Give each player +1 life (max 5)
    Object.values(room.players).forEach(p=>{
      p.x=SPAWN_X;p.y=SPAWN_Y;p.carrying=null;
      p.dead=false;p.eliminated=false;p.stamina=STAMINA_MAX;
      p.lives=Math.min(5,(p.lives||0)+1);
    });
    io.to(currentRoom).emit('map',room.map);
    io.to(currentRoom).emit('level_start',{level:room.level,totalItems:room.totalItems});
  });

  socket.on('chat',({msg})=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const room=rooms[currentRoom],player=room.players[playerId];
    if(!player||!msg||!msg.trim())return;
    const message={name:player.name,color:player.color,msg:msg.trim().slice(0,80)};
    room.chatMessages.push(message);
    if(room.chatMessages.length>50)room.chatMessages.shift();
    io.to(currentRoom).emit('chat_msg',message);
  });

  socket.on('input',({dx,dy,action,boost,dir})=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const room=rooms[currentRoom],player=room.players[playerId];
    if(!player||player.dead||player.eliminated||!room.started)return;
    if(dir)player.dir=dir;
    const canBoost=boost&&(player.stamina||0)>0;
    player.boosting=canBoost;
    if(canBoost)player.stamina=Math.max(0,(player.stamina||0)-STAMINA_DRAIN);
    else player.stamina=Math.min(STAMINA_MAX,(player.stamina||0)+STAMINA_REGEN);
    const spd=canBoost?0.18:0.11;
    if(dx||dy){
      const nx=player.x+dx*spd,ny=player.y+dy*spd;
      if(canMove(room.map,nx,player.y))player.x=nx;
      if(canMove(room.map,player.x,ny))player.y=ny;
    }
    if(player.carrying!==null){
      const item=room.items.find(i=>i.id===player.carrying);
      if(item){item.x=player.x;item.y=player.y;}
    }
    if(action){
      if(player.carrying!==null){
        const item=room.items.find(i=>i.id===player.carrying);
        if(item)item.carriedBy=null;
        player.carrying=null;
        io.to(currentRoom).emit('sound','drop');
      } else {
        let nearest=null,minD=Infinity;
        room.items.forEach(item=>{
          if(!item.collected&&item.carriedBy===null){const d=dist(player,item);if(d<2.0&&d<minD){minD=d;nearest=item;}}
        });
        if(nearest){nearest.carriedBy=playerId;player.carrying=nearest.id;io.to(currentRoom).emit('sound','pickup');}
      }
    }
  });

  socket.on('disconnect',()=>{
    if(currentRoom&&rooms[currentRoom]){
      const player=rooms[currentRoom].players[playerId];
      if(player?.carrying!=null){
        const item=rooms[currentRoom].items.find(i=>i.id===player.carrying);
        if(item)item.carriedBy=null;
      }
      if(rooms[currentRoom].hostId===playerId){
        const remaining=Object.keys(rooms[currentRoom].players).filter(id=>id!==playerId);
        if(remaining.length){rooms[currentRoom].hostId=remaining[0];io.to(currentRoom).emit('new_host',{hostId:remaining[0]});}
      }
      const name=player?.name||'?';
      delete rooms[currentRoom].players[playerId];
      io.to(currentRoom).emit('lobby_state',{players:rooms[currentRoom].players,hostId:rooms[currentRoom].hostId});
      if(rooms[currentRoom].started)io.to(currentRoom).emit('player_left',{name});
      if(!Object.keys(rooms[currentRoom].players).length){
        setTimeout(()=>{if(rooms[currentRoom]&&!Object.keys(rooms[currentRoom].players).length)delete rooms[currentRoom];},30000);
      }
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`HAUNT v10 on ${PORT}`));
