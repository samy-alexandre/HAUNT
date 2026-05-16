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

/* ---------------- MAP GENERATION ---------------- */

function generateMap() {
  const map = [];

  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] =
        (x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1) ? 1 : 0;
    }
  }

  // walls
  [
    [7,1,7,8],[7,10,7,21],
    [15,1,15,5],[15,7,15,13],[15,15,15,21],
    [22,1,22,9],[22,11,22,21]
  ].forEach(([x1,y1,x2,y2])=>{
    for(let y=y1;y<=y2;y++) map[y][x1]=1;
  });

  [
    [1,8,5,8],[8,5,13,5],[8,13,13,13],
    [16,8,20,8],[16,15,20,15],
    [23,7,28,7],[23,15,28,15]
  ].forEach(([x1,y1,x2,y2])=>{
    for(let x=x1;x<=x2;x++) map[y1][x]=1;
  });

  return map;
}

/* ---------------- PATH CHECK (IMPORTANT) ---------------- */

function isReachable(map, start, end) {
  const queue = [start];
  const visited = new Set();

  while (queue.length) {
    const {x,y} = queue.shift();
    const key = x + "," + y;
    if (visited.has(key)) continue;
    visited.add(key);

    if (x === end.x && y === end.y) return true;

    for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const nx = x + dx;
      const ny = y + dy;

      if (map[ny]?.[nx] === 0) {
        queue.push({x:nx,y:ny});
      }
    }
  }
  return false;
}

/* ---------------- SAFE MAP GENERATOR ---------------- */

function generateSafeMap() {
  let map;
  let tries = 0;

  do {
    map = generateMap();
    tries++;
  } while (!isReachable(map, {x:1,y:1}, {x:28,y:1}) && tries < 50);

  // sécurité spawn + exit
  map[1][1] = 0;
  map[1][28] = 0;

  return map;
}

/* ---------------- GAME CONTENT ---------------- */

function generateItems(level) {
  const count = 6 + level * 2;
  const positions = [];
  const used = new Set();

  let tries = 0;

  while (positions.length < count && tries < 1000) {
    tries++;

    const x = 1 + Math.floor(Math.random() * (MAP_W - 2));
    const y = 1 + Math.floor(Math.random() * (MAP_H - 2));
    const key = x + "," + y;

    if (!used.has(key)) {
      positions.push({ id: positions.length, x: x + 0.5, y: y + 0.5 });
      used.add(key);
    }
  }

  return positions.map(p => ({
    ...p,
    collected: false,
    carriedBy: null
  }));
}

function generateMonsters(level) {
  return [
    {id:0,x:10,y:5,dx:1,dy:0,speed:0.022+level*0.003},
    {id:1,x:24,y:16,dx:-1,dy:0,speed:0.020+level*0.003},
    {id:2,x:4,y:16,dx:0,dy:1,speed:0.018+level*0.002},
    {id:3,x:18,y:10,dx:1,dy:1,speed:0.016+level*0.002},
  ];
}

/* ---------------- ROOM ---------------- */

function createRoom(roomId) {
  const level = 1;

  return {
    id: roomId,
    players: {},
    items: generateItems(level),
    monsters: generateMonsters(level),
    map: generateSafeMap(),
    exit: {x:28.5,y:1.5},

    score: 0,
    gameOver: false,
    gameWon: false,
    started: false,

    itemsDelivered: 0,
    totalItems: 6 + level * 2,
    level,

    chatMessages: [],
    leaderboard: []
  };
}

/* ---------------- PHYSICS ---------------- */

const R = 0.28;

function canMove(map, x, y) {
  const checks = [
    [x-R, y-R],[x+R, y-R],[x-R, y+R],[x+R, y+R]
  ];

  for (const [cx,cy] of checks) {
    const tx = Math.floor(cx);
    const ty = Math.floor(cy);

    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
    if (map[ty][tx] === 1) return false;
  }
  return true;
}

function dist(a,b){
  return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);
}

function isWallSimple(map,x,y){
  const tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return true;
  return map[ty][tx]===1;
}

/* ---------------- UPDATE ---------------- */

function updateRoom(room) {
  if(room.gameOver||room.gameWon||!room.started) return;

  const players = Object.values(room.players);
  if (!players.length) return;

  // monsters
  room.monsters.forEach(m=>{
    let target=null,minD=Infinity;

    players.forEach(p=>{
      const d=dist(m,p);
      if(d<minD){minD=d;target=p;}
    });

    let dx=m.dx,dy=m.dy;

    if(target&&minD<7){
      const a=Math.atan2(target.y-m.y,target.x-m.x);
      dx=Math.cos(a);
      dy=Math.sin(a);
    }

    const nx=m.x+dx*m.speed*2;
    const ny=m.y+dy*m.speed*2;

    if(!isWallSimple(room.map,nx,m.y))m.x=nx;
    else m.dx=-m.dx;

    if(!isWallSimple(room.map,m.x,ny))m.y=ny;
    else m.dy=-m.dy;

    players.forEach(p=>{
      if(!p.dead&&dist(m,p)<0.7){
        if(p.carrying!==null){
          const item=room.items.find(i=>i.id===p.carrying);
          if(item){
            item.carriedBy=null;
            item.x=p.x;
            item.y=p.y;
          }
          p.carrying=null;
        }

        p.dead=true;
        p.respawnTimer=150;
        p.deaths=(p.deaths||0)+1;

        io.to(room.id).emit('sound','death');
      }
    });
  });

  // respawn
  players.forEach(p=>{
    if(p.dead){
      p.respawnTimer--;
      if(p.respawnTimer<=0){
        p.dead=false;
        p.x=1.5;
        p.y=1.5;
      }
    }
  });

  // exit logic
  room.items.forEach(item=>{
    if(!item.collected&&item.carriedBy!==null){
      const carrier=room.players[item.carriedBy];

      if(carrier&&dist(carrier,room.exit)<1.2){
        item.collected=true;
        item.carriedBy=null;
        carrier.carrying=null;

        room.itemsDelivered++;
        room.score+=100+(room.level*50);
        carrier.score=(carrier.score||0)+100+(room.level*50);

        io.to(room.id).emit('sound','score');
      }
    }
  });

  if(room.itemsDelivered>=room.totalItems){
    room.gameWon=true;

    room.leaderboard=Object.values(room.players)
      .map(p=>({name:p.name,score:p.score||0,deaths:p.deaths||0,color:p.color}))
      .sort((a,b)=>b.score-a.score);

    io.to(room.id).emit('sound','win');
  }
}

/* ---------------- LOOP ---------------- */

setInterval(()=>{
  Object.values(rooms).forEach(room=>{
    updateRoom(room);

    if(Object.keys(room.players).length>0){
      io.to(room.id).emit('state',{
        players:room.players,
        items:room.items,
        monsters:room.monsters,
        score:room.score,
        gameOver:room.gameOver,
        gameWon:room.gameWon,
        itemsDelivered:room.itemsDelivered,
        totalItems:room.totalItems,
        level:room.level,
        leaderboard:room.leaderboard
      });
    }
  });
},1000/30);

/* ---------------- SOCKET ---------------- */

io.on('connection',socket=>{
  let currentRoom=null;
  const playerId=socket.id;

  socket.on('create_room',({name})=>{
    const roomId=uuidv4().slice(0,6).toUpperCase();

    rooms[roomId]=createRoom(roomId);
    currentRoom=roomId;

    socket.join(roomId);

    rooms[roomId].players[playerId]={
      id:playerId,
      x:1.5,
      y:1.5,
      name:name||'Joueur',
      carrying:null,
      dead:false,
      respawnTimer:0,
      color:'#00ff88',
      score:0,
      deaths:0
    };

    socket.emit('room_created',{roomId,playerId});
    socket.emit('map',rooms[roomId].map);
  });

  socket.on('join_room',({roomId,name})=>{
    const room=rooms[roomId];
    if(!room){socket.emit('error','Salle introuvable');return;}

    currentRoom=roomId;
    socket.join(roomId);

    const num=Object.keys(room.players).length;

    room.players[playerId]={
      id:playerId,
      x:1.5+num*0.8,
      y:1.5,
      name:name||'Joueur',
      carrying:null,
      dead:false,
      respawnTimer:0,
      color:'#00ff88',
      score:0,
      deaths:0
    };

    socket.emit('joined',{playerId,roomId});
    socket.emit('map',room.map);
    socket.emit('chat_history',room.chatMessages.slice(-20));
  });

  socket.on('start_game',()=>{
    if(!currentRoom) return;
    rooms[currentRoom].started=true;
    io.to(currentRoom).emit('game_started');
  });

  socket.on('next_level',()=>{
    if(!currentRoom) return;
    const room=rooms[currentRoom];

    room.level++;

    room.map = generateSafeMap(); // 🔥 IMPORTANT FIX

    room.items = generateItems(room.level);
    room.monsters = generateMonsters(room.level);

    room.itemsDelivered = 0;
    room.totalItems = 6 + room.level * 2;
    room.gameWon = false;

    Object.values(room.players).forEach(p=>{
      p.x=1.5;
      p.y=1.5;
      p.carrying=null;
      p.dead=false;
    });

    io.to(currentRoom).emit('level_start',{
      level:room.level,
      totalItems:room.totalItems
    });
  });

  socket.on('input',({dx,dy,action})=>{
    if(!currentRoom) return;

    const room=rooms[currentRoom];
    const player=room.players[playerId];

    if(!player||player.dead||!room.started) return;

    const spd=0.1;

    const nx=player.x+dx*spd;
    const ny=player.y+dy*spd;

    if(canMove(room.map,nx,player.y)) player.x=nx;
    if(canMove(room.map,player.x,ny)) player.y=ny;

    if(player.carrying!==null){
      const item=room.items.find(i=>i.id===player.carrying);
      if(item){
        item.x=player.x;
        item.y=player.y;
      }
    }

    if(action){
      if(player.carrying!==null){
        const item=room.items.find(i=>i.id===player.carrying);
        if(item) item.carriedBy=null;
        player.carrying=null;
        io.to(currentRoom).emit('sound','drop');
      } else {
        let nearest=null,minD=1.2;

        room.items.forEach(item=>{
          if(!item.collected&&item.carriedBy===null){
            const d=dist(player,item);
            if(d<minD){
              minD=d;
              nearest=item;
            }
          }
        });

        if(nearest){
          nearest.carriedBy=playerId;
          player.carrying=nearest.id;
          io.to(currentRoom).emit('sound','pickup');
        }
      }
    }
  });

  socket.on('disconnect',()=>{
    if(!currentRoom) return;

    const room=rooms[currentRoom];
    const player=room.players[playerId];

    if(player?.carrying!==null){
      const item=room.items.find(i=>i.id===player.carrying);
      if(item) item.carriedBy=null;
    }

    const name=player?.name||'?';

    delete room.players[playerId];
    io.to(currentRoom).emit('player_left',{name});

    if(!Object.keys(room.players).length){
      setTimeout(()=>{
        if(rooms[currentRoom]&&!Object.keys(rooms[currentRoom]).length){
          delete rooms[currentRoom];
        }
      },30000);
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log("HAUNT running on "+PORT));
