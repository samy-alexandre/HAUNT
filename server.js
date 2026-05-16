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

function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] = (x === 0 || x === MAP_W-1 || y === 0 || y === MAP_H-1) ? 1 : 0;
    }
  }

  // Vertical walls with gaps
  const vwalls = [
    {x:7, from:1, to:6}, {x:7, from:8, to:13}, {x:7, from:15, to:19},
    {x:14, from:1, to:4}, {x:14, from:6, to:11}, {x:14, from:13, to:19},
    {x:21, from:1, to:7}, {x:21, from:9, to:19},
  ];
  vwalls.forEach(({x,from,to})=>{
    for(let y=from;y<=to;y++) map[y][x]=1;
  });

  // Horizontal walls with gaps
  const hwalls = [
    {y:7, from:1, to:5}, {y:13, from:1, to:5},
    {y:5, from:8, to:12}, {y:12, from:8, to:12},
    {y:8, from:15, to:19}, {y:14, from:15, to:19},
    {y:6, from:22, to:26}, {y:13, from:22, to:26},
  ];
  hwalls.forEach(({y,from,to})=>{
    for(let x=from;x<=to;x++) map[y][x]=1;
  });

  // Pillars (single blocks, not enclosing exit)
  [[2,2],[5,2],[2,5],[10,2],[13,2],[10,4],[16,2],[19,2],[16,5],[23,3],[26,3],[23,10],[26,10],[23,16],[2,10],[5,10],[2,15],[10,9],[13,9],[10,14],[16,10],[19,10],[16,15],[19,15]].forEach(([x,y])=>{
    if(map[y]&&map[y][x]!==undefined) map[y][x]=1;
  });

  // Make sure exit area (top-right) is clear
  for(let y=1;y<=3;y++) for(let x=24;x<=MAP_W-2;x++) map[y][x]=0;

  return map;
}

const BASE_MAP = generateMap();

const EXIT_CANDIDATES = [
  {x:25,y:1},{x:25,y:16},{x:1,y:16},
  {x:9,y:1},{x:17,y:1},{x:22,y:16},
  {x:1,y:9},{x:25,y:9},
  {x:9,y:16},{x:15,y:16},
];

function generateExit() {
  const shuffled = EXIT_CANDIDATES.slice().sort(()=>Math.random()-0.5);
  for(const c of shuffled){
    let ok=true;
    for(let dy=0;dy<=1&&ok;dy++) for(let dx=0;dx<=1&&ok;dx++){
      const tx=c.x+dx, ty=c.y+dy;
      if(tx<1||tx>=MAP_W-1||ty<1||ty>=MAP_H-1) ok=false;
    }
    if(ok) return {x:c.x+0.5, y:c.y+0.5, gx:c.x, gy:c.y};
  }
  return {x:25.5, y:1.5, gx:25, gy:1};
}

function getMapWithExit(exit){
  const map=BASE_MAP.map(row=>[...row]);
  for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++){
    if(map[exit.gy+dy]) map[exit.gy+dy][exit.gx+dx]=0;
  }
  return map;
}

function generateItems(level) {
  const count = 6 + level * 2;
  const positions = [], forbidden = new Set();
  let tries = 0;
  while(positions.length < count && tries < 2000) {
    tries++;
    const x = 1 + Math.floor(Math.random()*(MAP_W-2));
    const y = 1 + Math.floor(Math.random()*(MAP_H-2));
    const key = `${x},${y}`;
    // Avoid exit area and spawn area
    if(!forbidden.has(key) && BASE_MAP[y][x]===0 && !(x>=24&&y<=3) && !(x<=3&&y<=3)) {
      positions.push({x:x+0.5, y:y+0.5});
      forbidden.add(key);
    }
  }
  return positions.map((p,i)=>({id:i, x:p.x, y:p.y, collected:false, carriedBy:null}));
}

function generateMonsters(level) {
  const spd = (base) => base + level * 0.003;
  const monsters = [
    {id:0, x:10, y:5,  dx:1,  dy:0,  speed:spd(0.022)},
    {id:1, x:22, y:15, dx:-1, dy:0,  speed:spd(0.019)},
    {id:2, x:4,  y:15, dx:0,  dy:1,  speed:spd(0.017)},
    {id:3, x:17, y:10, dx:1,  dy:1,  speed:spd(0.015)},
  ];
  if(level>=2) monsters.push({id:4, x:24, y:5, dx:-1, dy:0, speed:spd(0.024)});
  if(level>=3) monsters.push({id:5, x:8,  y:12,dx:0,  dy:-1,speed:spd(0.026)});
  return monsters;
}

function createRoom(roomId, hostId) {
  const level = 1;
  const exit = generateExit();
  const map = getMapWithExit(exit);
  return {
    id:roomId, hostId, players:{},
    items:generateItems(level), monsters:generateMonsters(level),
    map, exit,
    score:0, gameOver:false, gameWon:false, started:false,
    itemsDelivered:0, totalItems:6+level*2,
    level, chatMessages:[], leaderboard:[],
    nextLevelPending: false
  };
}

const R = 0.3;
function canMove(map, x, y) {
  const corners = [[x-R,y-R],[x+R,y-R],[x-R,y+R],[x+R,y+R]];
  for(const [cx,cy] of corners) {
    const tx=Math.floor(cx), ty=Math.floor(cy);
    if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H||map[ty][tx]===1) return false;
  }
  return true;
}

function wallCheck(map,x,y){
  const tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return true;
  return map[ty][tx]===1;
}

function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}

function updateRoom(room) {
  if(room.gameOver||room.gameWon||!room.started) return;
  const players = Object.values(room.players);
  if(!players.length) return;

  room.monsters.forEach(m=>{
    let target=null, minD=Infinity;
    players.forEach(p=>{const d=dist(m,p);if(d<minD){minD=d;target=p;}});
    let dx=m.dx, dy=m.dy;
    if(target&&minD<8){const a=Math.atan2(target.y-m.y,target.x-m.x);dx=Math.cos(a);dy=Math.sin(a);}
    const spd=m.speed*2;
    const nx=m.x+dx*spd, ny=m.y+dy*spd;
    if(!wallCheck(room.map,nx,m.y))m.x=nx; else{m.dx=-m.dx;}
    if(!wallCheck(room.map,m.x,ny))m.y=ny; else{m.dy=-m.dy;}
    players.forEach(p=>{
      if(!p.dead&&dist(m,p)<0.75){
        if(p.carrying!==null){
          const item=room.items.find(i=>i.id===p.carrying);
          if(item){item.carriedBy=null;item.x=p.x;item.y=p.y;}
          p.carrying=null;
        }
        p.dead=true; p.respawnTimer=150; p.deaths=(p.deaths||0)+1;
        io.to(room.id).emit('sound','death');
      }
    });
  });

  players.forEach(p=>{
    if(p.dead){p.respawnTimer--;if(p.respawnTimer<=0){p.dead=false;p.x=1.5;p.y=1.5;}}
  });

  room.items.forEach(item=>{
    if(!item.collected&&item.carriedBy!==null){
      const carrier=room.players[item.carriedBy];
      if(carrier&&dist(carrier,room.exit)<1.5){
        item.collected=true;item.carriedBy=null;carrier.carrying=null;
        room.itemsDelivered++;
        const pts=100+room.level*50;
        room.score+=pts; carrier.score=(carrier.score||0)+pts;
        io.to(room.id).emit('sound','score');
      }
    }
  });

  if(room.itemsDelivered>=room.totalItems&&!room.gameWon){
    room.gameWon=true;
    room.leaderboard=Object.values(room.players)
      .map(p=>({name:p.name,score:p.score||0,deaths:p.deaths||0,color:p.color}))
      .sort((a,b)=>b.score-a.score);
    io.to(room.id).emit('sound','win');
  }
}

setInterval(()=>{
  Object.values(rooms).forEach(room=>{
    updateRoom(room);
    if(Object.keys(room.players).length>0){
      io.to(room.id).emit('state',{
        players:room.players, items:room.items, monsters:room.monsters,
        score:room.score, gameOver:room.gameOver, gameWon:room.gameWon,
        itemsDelivered:room.itemsDelivered, totalItems:room.totalItems,
        level:room.level, leaderboard:room.leaderboard,
        hostId:room.hostId, exit:room.exit
      });
    }
  });
},1000/30);

io.on('connection',socket=>{
  let currentRoom=null, playerId=socket.id;

  socket.on('create_room',({name})=>{
    const roomId=uuidv4().slice(0,6).toUpperCase();
    rooms[roomId]=createRoom(roomId, playerId);
    currentRoom=roomId; socket.join(roomId);
    rooms[roomId].players[playerId]={
      id:playerId,x:1.5,y:1.5,name:name||'Joueur 1',
      carrying:null,dead:false,respawnTimer:0,color:'#00ff88',score:0,deaths:0
    };
    socket.emit('room_created',{roomId,playerId,isHost:true});
    socket.emit('map',rooms[roomId].map);
  });

  socket.on('join_room',({roomId,name})=>{
    const room=rooms[roomId];
    if(!room){socket.emit('error','Salle introuvable !');return;}
    if(Object.keys(room.players).length>=6){socket.emit('error','Salle pleine !');return;}
    currentRoom=roomId; socket.join(roomId);
    const colors=['#00ff88','#ff6b6b','#66d9ff','#ffcc00','#ff88ff','#88ffcc'];
    const num=Object.keys(room.players).length;
    room.players[playerId]={
      id:playerId,x:1.5+num*0.8,y:1.5,name:name||`Joueur ${num+1}`,
      carrying:null,dead:false,respawnTimer:0,color:colors[num%colors.length],score:0,deaths:0
    };
    const isHost=room.hostId===playerId;
    socket.emit('joined',{playerId,roomId,isHost});
    socket.emit('map',room.map);
    socket.emit('chat_history',room.chatMessages.slice(-20));
    io.to(roomId).emit('player_joined',{count:Object.keys(room.players).length,name:room.players[playerId].name});
  });

  socket.on('start_game',()=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    if(rooms[currentRoom].hostId!==playerId) return; // only host
    rooms[currentRoom].started=true;
    io.to(currentRoom).emit('game_started');
  });

  socket.on('next_level',()=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom];
    if(room.hostId!==playerId) return; // only host
    if(!room.gameWon) return; // only when level is won
    room.level++;
    const newExit = generateExit();
    room.map = getMapWithExit(newExit);
    room.exit = newExit;
    room.items=generateItems(room.level);
    room.monsters=generateMonsters(room.level);
    room.itemsDelivered=0; room.totalItems=6+room.level*2;
    room.gameWon=false; room.nextLevelPending=false;
    Object.values(room.players).forEach(p=>{p.x=1.5;p.y=1.5;p.carrying=null;p.dead=false;});
    io.to(currentRoom).emit('map', room.map);
    io.to(currentRoom).emit('level_start',{level:room.level,totalItems:room.totalItems,exit:room.exit});
  });

  socket.on('chat',({msg})=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom], player=room.players[playerId];
    if(!player||!msg||!msg.trim()) return;
    const message={name:player.name,color:player.color,msg:msg.trim().slice(0,80)};
    room.chatMessages.push(message);
    if(room.chatMessages.length>50) room.chatMessages.shift();
    io.to(currentRoom).emit('chat_msg',message);
  });

  socket.on('input',({dx,dy,action})=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom], player=room.players[playerId];
    if(!player||player.dead||!room.started) return;
    const spd=0.12;
    const nx=player.x+dx*spd, ny=player.y+dy*spd;
    if(canMove(room.map,nx,player.y)) player.x=nx;
    if(canMove(room.map,player.x,ny)) player.y=ny;
    if(player.carrying!==null){
      const item=room.items.find(i=>i.id===player.carrying);
      if(item){item.x=player.x;item.y=player.y;}
    }
    if(action){
      if(player.carrying!==null){
        const item=room.items.find(i=>i.id===player.carrying);
        if(item) item.carriedBy=null;
        player.carrying=null;
        io.to(currentRoom).emit('sound','drop');
      } else {
        let nearest=null, minD=Infinity;
        room.items.forEach(item=>{
          if(!item.collected&&item.carriedBy===null){
            const d=dist(player,item);
            if(d<1.3&&d<minD){minD=d;nearest=item;}
          }
        });
        if(nearest){
          nearest.carriedBy=playerId; player.carrying=nearest.id;
          io.to(currentRoom).emit('sound','pickup');
        }
      }
    }
  });

  socket.on('disconnect',()=>{
    if(currentRoom&&rooms[currentRoom]){
      const player=rooms[currentRoom].players[playerId];
      if(player&&player.carrying!=null){
        const item=rooms[currentRoom].items.find(i=>i.id===player.carrying);
        if(item) item.carriedBy=null;
      }
      // If host leaves, assign new host
      if(rooms[currentRoom].hostId===playerId){
        const remaining=Object.keys(rooms[currentRoom].players).filter(id=>id!==playerId);
        if(remaining.length>0){
          rooms[currentRoom].hostId=remaining[0];
          io.to(currentRoom).emit('new_host',{hostId:remaining[0]});
        }
      }
      const name=player?.name||'?';
      delete rooms[currentRoom].players[playerId];
      io.to(currentRoom).emit('player_left',{name});
      if(!Object.keys(rooms[currentRoom].players).length){
        setTimeout(()=>{if(rooms[currentRoom]&&!Object.keys(rooms[currentRoom].players).length)delete rooms[currentRoom];},30000);
      }
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`HAUNT running on ${PORT}`));
