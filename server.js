const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

// 🔥 FIX RENDER / SOCKET.IO
const io = new Server(server, {
  cors: {
    origin: "*"
  },
  transports: ["polling", "websocket"]
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

const rooms = {};
const MAP_W = 30;
const MAP_H = 22;

/* ===== MAP ===== */

function generateMap() {
  const map = [];

  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] =
        (x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1) ? 1 : 0;
    }
  }

  // walls fixes
  [[7,1,7,8],[7,10,7,21],[15,1,15,5],[15,7,15,13],[15,15,15,21],[22,1,22,9],[22,11,22,21]]
  .forEach(([x1,y1,x2,y2])=>{
    for(let y=y1;y<=y2;y++) map[y][x1]=1;
  });

  [[1,8,5,8],[8,5,13,5],[8,13,13,13],[16,8,20,8],[16,15,20,15],[23,7,28,7],[23,15,28,15]]
  .forEach(([x1,y1,x2,y2])=>{
    for(let x=x1;x<=x2;x++) map[y1][x]=1;
  });

  // sécurité spawn + exit
  map[1][1] = 0;
  map[1][28] = 0;

  return map;
}

/* ===== ROOM ===== */

function createRoom(roomId) {
  const level = 1;

  return {
    id: roomId,
    players: {},
    items: [],
    monsters: [],
    map: generateMap(),

    exit: {x:28.5,y:1.5},

    started: false,
    level,
    score: 0,
    itemsDelivered: 0,
    totalItems: 10
  };
}

/* ===== LOOP ===== */

setInterval(()=>{
  Object.values(rooms).forEach(room=>{
    io.to(room.id).emit('state', room);
  });
},1000/30);

/* ===== SOCKET ===== */

io.on('connection',socket=>{
  let roomId=null;

  socket.on('create_room',({name})=>{
    roomId = uuidv4().slice(0,6).toUpperCase();

    rooms[roomId] = createRoom(roomId);
    socket.join(roomId);

    rooms[roomId].players[socket.id] = {
      id:socket.id,
      x:1.5,
      y:1.5,
      name:name||"Player",
      color:"#00ff88",
      score:0
    };

    socket.emit('room_created',{roomId,playerId:socket.id});
    socket.emit('map',rooms[roomId].map);
  });

  socket.on('join_room',({roomId:nameRoom,name})=>{
    const room = rooms[roomId];

    if(!room) return socket.emit('error',"Room not found");

    socket.join(roomId);

    room.players[socket.id] = {
      id:socket.id,
      x:2.5,
      y:2.5,
      name:name||"Player",
      color:"#00ff88",
      score:0
    };

    socket.emit('joined',{roomId,playerId:socket.id});
    socket.emit('map',room.map);
  });

  socket.on('start_game',()=>{
    if(!roomId) return;
    rooms[roomId].started = true;
    io.to(roomId).emit('game_started');
  });

  socket.on('input',({dx,dy})=>{
    const room = rooms[roomId];
    if(!room) return;

    const p = room.players[socket.id];
    if(!p) return;

    const speed = 0.1;

    const nx = p.x + dx * speed;
    const ny = p.y + dy * speed;

    p.x = nx;
    p.y = ny;
  });

  socket.on('disconnect',()=>{
    if(roomId && rooms[roomId]){
      delete rooms[roomId].players[socket.id];
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,'0.0.0.0',()=>{
  console.log("HAUNT running on",PORT);
});
