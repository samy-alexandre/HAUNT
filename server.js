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
const MAP_W = 30;
const MAP_H = 22;

function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] = (x === 0 || x === MAP_W-1 || y === 0 || y === MAP_H-1) ? 1 : 0;
    }
  }
  // Vertical dividers with doors
  [[7,1,7,8],[7,10,7,21],[15,1,15,5],[15,7,15,13],[15,15,15,21],[22,1,22,9],[22,11,22,21]].forEach(([x1,y1,x2,y2])=>{
    for(let y=y1;y<=y2;y++) map[y][x1]=1;
  });
  // Horizontal walls with doors
  [[1,8,5,8],[8,5,13,5],[8,13,13,13],[16,8,20,8],[16,15,20,15],[23,7,28,7],[23,15,28,15]].forEach(([x1,y1,x2,y2])=>{
    for(let x=x1;x<=x2;x++) map[y1][x]=1;
  });
  // Pillars
  [[2,2],[5,2],[2,5],[5,6],[10,2],[13,2],[10,6],[17,2],[20,2],[17,6],[20,6],[25,2],[28,2],[25,5],[25,11],[28,11],[25,17],[28,17],[2,11],[5,11],[2,16],[5,16],[10,10],[13,10],[10,16],[13,17],[17,11],[20,11],[17,17],[20,17]].forEach(([x,y])=>{
    if(map[y] && map[y][x]!==undefined) map[y][x]=1;
  });
  return map;
}

const BASE_MAP = generateMap();

function generateItems(level) {
  const count = 6 + level * 2;
  const positions = [], forbidden = new Set();
  let tries = 0;
  while(positions.length < count && tries < 1000) {
    tries++;
    const x = 1 + Math.floor(Math.random()*(MAP_W-2));
    const y = 1 + Math.floor(Math.random()*(MAP_H-2));
    const key = `${x},${y}`;
    if(!forbidden.has(key) && BASE_MAP[y][x]===0 && !(x>=27&&y<=2)) {
      positions.push({x:x+0.5, y:y+0.5});
      forbidden.add(key);
    }
  }
  return positions.map((p,i)=>({id:i, x:p.x, y:p.y, collected:false, carriedBy:null}));
}

function generateMonsters(level) {
  return [
    {id:0,x:10,y:5,dx:1,dy:0,speed:0.022+level*0.003},
    {id:1,x:24,y:16,dx:-1,dy:0,speed:0.020+level*0.003},
    {id:2,x:4,y:16,dx:0,dy:1,speed:0.018+level*0.002},
    {id:3,x:18,y:10,dx:1,dy:1,speed:0.016+level*0.002},
    ...(level>=2?[{id:4,x:26,y:4,dx:-1,dy:0,speed:0.025+level*0.003}]:[]),
    ...(level>=3?[{id:5,x:8,y:12,dx:0,dy:-1,speed:0.027+level*0.003}]:[]),
  ];
}

function createRoom(roomId) {
  const level=1;
  return {
    id:roomId, players:{}, items:generateItems(level),
    monsters:generateMonsters(level), map:BASE_MAP,
    exit:{x:28.5,y:1.5}, score:0, gameOver:false, gameWon:false,
    started:false, itemsDelivered:0, totalItems:6+level*2,
    level, chatMessages:[], leaderboard:[]
  };
}

const R = 0.28; // player hitbox radius

function canMove(map, x, y) {
  // Check all 4 corners of hitbox
  const checks = [
    [x-R, y-R],[x+R, y-R],[x-R, y+R],[x+R, y+R]
  ];
  for(const [cx,cy] of checks) {
    const tx=Math.floor(cx), ty=Math.floor(cy);
    if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return false;
    if(map[ty][tx]===1) return false;
  }
  return true;
}

function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}

function isWallSimple(map,x,y){
  const tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return true;
  return map[ty][tx]===1;
}

function updateRoom(room) {
  if(room.gameOver||room.gameWon||!room.started) return;
  const players=Object.values(room.players);
  if(!players.length) return;

  // Monsters
  room.monsters.forEach(m=>{
    let target=null,minD=Infinity;
    players.forEach(p=>{const d=dist(m,p);if(d<minD){minD=d;target=p;}});
    let dx=m.dx,dy=m.dy;
    if(target&&minD<7){const a=Math.atan2(target.y-m.y,target.x-m.x);dx=Math.cos(a);dy=Math.sin(a);}
    const nx=m.x+dx*m.speed*2,ny=m.y+dy*m.speed*2;
    if(!isWallSimple(room.map,nx,m.y))m.x=nx; else m.dx=-m.dx;
    if(!isWallSimple(room.map,m.x,ny))m.y=ny; else m.dy=-m.dy;
    players.forEach(p=>{
      if(!p.dead&&dist(m,p)<0.7){
        if(p.carrying!==null){const item=room.items.find(i=>i.id===p.carrying);if(item){item.carriedBy=null;item.x=p.x;item.y=p.y;}p.carrying=null;}
        p.dead=true;p.respawnTimer=150;p.deaths=(p.deaths||0)+1;
        io.to(room.id).emit('sound','death');
      }
    });
  });

  // Respawn
  players.forEach(p=>{
    if(p.dead){p.respawnTimer--;if(p.respawnTimer<=0){p.dead=false;p.x=1.5;p.y=1.5;}}
  });

  // Check exit
  room.items.forEach(item=>{
    if(!item.collected&&item.carriedBy!==null){
      const carrier=room.players[item.carriedBy];
      if(carrier&&dist(carrier,room.exit)<1.2){
        item.collected=true;item.carriedBy=null;carrier.carrying=null;
        room.itemsDelivered++;room.score+=100+(room.level*50);
        carrier.score=(carrier.score||0)+100+(room.level*50);
        io.to(room.id).emit('sound','score');
      }
    }
  });

  if(room.itemsDelivered>=room.totalItems){
    room.gameWon=true;
    room.leaderboard=Object.values(room.players).map(p=>({name:p.name,score:p.score||0,deaths:p.deaths||0,color:p.color})).sort((a,b)=>b.score-a.score);
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
        level:room.level,leaderboard:room.leaderboard
      });
    }
  });
},1000/30);

io.on('connection',socket=>{
  let currentRoom=null,playerId=socket.id;

  socket.on('create_room',({name})=>{
    const roomId=uuidv4().slice(0,6).toUpperCase();
    rooms[roomId]=createRoom(roomId);
    currentRoom=roomId;
    socket.join(roomId);
    rooms[roomId].players[playerId]={id:playerId,x:1.5,y:1.5,name:name||'Joueur 1',carrying:null,dead:false,respawnTimer:0,color:'#00ff88',score:0,deaths:0};
    socket.emit('room_created',{roomId,playerId});
    socket.emit('map',rooms[roomId].map);
  });

  socket.on('join_room',({roomId,name})=>{
    const room=rooms[roomId];
    if(!room){socket.emit('error','Salle introuvable !');return;}
    if(Object.keys(room.players).length>=6){socket.emit('error','Salle pleine !');return;}
    currentRoom=roomId;socket.join(roomId);
    const colors=['#00ff88','#ff6b6b','#66d9ff','#ffcc00','#ff88ff','#88ffcc'];
    const num=Object.keys(room.players).length;
    room.players[playerId]={id:playerId,x:1.5+num*0.8,y:1.5,name:name||`Joueur ${num+1}`,carrying:null,dead:false,respawnTimer:0,color:colors[num%colors.length],score:0,deaths:0};
    socket.emit('joined',{playerId,roomId});
    socket.emit('map',room.map);
    socket.emit('chat_history',room.chatMessages.slice(-20));
    io.to(roomId).emit('player_joined',{count:Object.keys(room.players).length,name:room.players[playerId].name});
  });

  socket.on('start_game',()=>{
    if(!currentRoom||!rooms[currentRoom])return;
    rooms[currentRoom].started=true;
    io.to(currentRoom).emit('game_started');
  });

  socket.on('next_level',()=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const room=rooms[currentRoom];
    room.level++;
    room.items=generateItems(room.level);room.monsters=generateMonsters(room.level);
    room.itemsDelivered=0;room.totalItems=6+room.level*2;room.gameWon=false;
    Object.values(room.players).forEach(p=>{p.x=1.5;p.y=1.5;p.carrying=null;p.dead=false;});
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

  socket.on('input',({dx,dy,action})=>{
    if(!currentRoom||!rooms[currentRoom])return;
    const room=rooms[currentRoom],player=room.players[playerId];
    if(!player||player.dead||!room.started)return;
    const spd=0.1;
    const nx=player.x+dx*spd, ny=player.y+dy*spd;
    if(canMove(room.map,nx,player.y)) player.x=nx;
    if(canMove(room.map,player.x,ny)) player.y=ny;
    if(player.carrying!==null){const item=room.items.find(i=>i.id===player.carrying);if(item){item.x=player.x;item.y=player.y;}}
    if(action){
      if(player.carrying!==null){
        const item=room.items.find(i=>i.id===player.carrying);
        if(item)item.carriedBy=null;player.carrying=null;
        io.to(currentRoom).emit('sound','drop');
      } else {
        let nearest=null,minD=Infinity;
        room.items.forEach(item=>{if(!item.collected&&item.carriedBy===null){const d=dist(player,item);if(d<1.2&&d<minD){minD=d;nearest=item;}}});
        if(nearest){nearest.carriedBy=playerId;player.carrying=nearest.id;io.to(currentRoom).emit('sound','pickup');}
      }
    }
  });

  socket.on('disconnect',()=>{
    if(currentRoom&&rooms[currentRoom]){
      const player=rooms[currentRoom].players[playerId];
      if(player?.carrying!==null&&player?.carrying!==undefined){const item=rooms[currentRoom].items.find(i=>i.id===player.carrying);if(item)item.carriedBy=null;}
      const name=player?.name||'?';
      delete rooms[currentRoom].players[playerId];
      io.to(currentRoom).emit('player_left',{name});
      if(!Object.keys(rooms[currentRoom].players).length) setTimeout(()=>{if(rooms[currentRoom]&&!Object.keys(rooms[currentRoom].players).length)delete rooms[currentRoom];},30000);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`HAUNT running on ${PORT}`));
