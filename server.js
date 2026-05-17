const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const rooms = {};
const MAP_W = 28, MAP_H = 20;
const SPAWN_X = 1.5, SPAWN_Y = 1.5;
const MAX_LIVES = 3;
const STAMINA_MAX = 120;
const STAMINA_DRAIN = 1.8;
const STAMINA_REGEN = 0.5;

// Constantes de vitesse : Marche par défaut, course avec Shift
const SPEED_WALK = 0.05; 
const SPEED_SPRINT = 0.11; 

function getPlayableDims(level) {
  if(level <= 2) return {w:18, h:14};
  if(level <= 4) return {w:23, h:17};
  return {w:MAP_W, h:MAP_H};
}

function generateMap(level) {
  const {w:pw, h:ph} = getPlayableDims(level);
  const map = [];
  for(let y=0; y<MAP_H; y++){
    map[y] = [];
    for(let x=0; x<MAP_W; x++){
      if(x >= pw || y >= ph) { map[y][x] = 1; continue; }
      if(x === 0 || y === 0 || x === pw-1 || y === ph-1) { map[y][x] = 1; }
      else { map[y][x] = (Math.random() < 0.22 && (x > 2 || y > 2)) ? 1 : 0; }
    }
  }
  return map;
}

io.on('connection', (socket) => {
  let playerId = socket.id;
  let currentRoom = null;

  socket.on('create_room', (data) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = {
      id: roomCode,
      hostId: playerId,
      started: false,
      level: 1,
      map: generateMap(1),
      players: {},
      items: [],
      monsters: [],
      exit: null,
      totalItems: 0,
      itemsDelivered: 0,
      historyTicks: 0,
      playerEchoLogs: []
    };
    joinRoomSync(roomCode, data.name);
  });

  socket.on('join_room', (data) => {
    const roomCode = data.roomCode?.toUpperCase();
    if(rooms[roomCode] && !rooms[roomCode].started) {
      joinRoomSync(roomCode, data.name);
    } else {
      socket.emit('error', "Chambre introuvable ou déjà lancée.");
    }
  });

  function joinRoomSync(code, name) {
    currentRoom = code;
    socket.join(code);
    const room = rooms[code];
    
    const pCount = Object.keys(room.players).length;
    const dimension = (pCount % 2 === 0) ? 'material' : 'astral';

    room.players[playerId] = {
      id: playerId,
      name: name || 'Survivant',
      x: SPAWN_X,
      y: SPAWN_Y,
      lives: MAX_LIVES,
      score: 0,
      stamina: STAMINA_MAX,
      carrying: null,
      dimension: dimension,
      dead: false
    };

    socket.emit('joined', { playerId, roomId: code });
    io.to(code).emit('lobby_state', { players: room.players, hostId: room.hostId });
  }

  socket.on('start_game', () => {
    const room = rooms[currentRoom];
    if(room && room.hostId === playerId && !room.started) {
      room.started = true;
      initLevel(room);
      io.to(currentRoom).emit('game_started');
      startGameLoop(currentRoom);
    }
  });

  function initLevel(room) {
    room.map = generateMap(room.level);
    room.itemsDelivered = 0;
    room.playerEchoLogs = [];
    room.historyTicks = 0;

    const {w:pw, h:ph} = getPlayableDims(room.level);
    
    room.items = [];
    const itemCount = 3 + room.level;
    room.totalItems = itemCount;
    for(let i=0; i<itemCount; i++) {
      let rx, ry;
      do {
        rx = Math.floor(Math.random()*(pw-2))+1.5;
        ry = Math.floor(Math.random()*(ph-2))+1.5;
      } while(room.map[Math.floor(ry)][Math.floor(rx)] === 1 || (rx < 3 && ry < 3));
      
      room.items.push({
        id: i, x: rx, y: ry,
        type: Math.random() < 0.25 ? 'golden' : (Math.random() < 0.2 ? 'cursed' : 'normal'),
        collected: false, carriedBy: null
      });
    }

    room.exit = { x: pw - 1.5, y: ph - 1.5 };

    room.monsters = [];
    const monsterCount = 1 + Math.floor(room.level / 2);
    for(let i=0; i<monsterCount; i++) {
      let mx, my;
      do {
        mx = Math.floor(Math.random()*(pw-4))+3.5;
        my = Math.floor(Math.random()*(ph-4))+3.5;
      } while(room.map[Math.floor(my)][Math.floor(mx)] === 1);
      
      room.monsters.push({
        id: 'm_' + i, x: mx, y: my, dx: 0, dy: 0,
        isEcho: false
      });
    }
  }

  socket.on('input', (data) => {
    const room = rooms[currentRoom];
    if(!room || !room.started) return;
    const player = room.players[playerId];
    if(!player || player.dead) return;

    let isRunning = data.boost && player.stamina > 10;
    if(isRunning && (data.dx !== 0 || data.dy !== 0)) {
      player.stamina = Math.max(0, player.stamina - STAMINA_DRAIN);
    } else {
      player.stamina = Math.min(STAMINA_MAX, player.stamina + STAMINA_REGEN);
    }
    if(player.stamina <= 0) isRunning = false;

    const currentSpeed = isRunning ? SPEED_SPRINT : SPEED_WALK;
    
    let nx = player.x + data.dx * currentSpeed;
    let ny = player.y + data.dy * currentSpeed;

    if(room.map[Math.floor(player.y)][Math.floor(nx)] !== 1) player.x = nx;
    if(room.map[Math.floor(ny)][Math.floor(player.x)] !== 1) player.y = ny;

    room.playerEchoLogs.push({ x: player.x, y: player.y, tick: room.historyTicks });

    if(data.action) {
      if(player.carrying !== null) {
        if(Math.hypot(player.x - room.exit.x, player.y - room.exit.y) < 1.2) {
          const item = room.items.find(i => i.id === player.carrying);
          if(item) {
            item.collected = true;
            item.carriedBy = null;
            player.carrying = null;
            room.itemsDelivered++;
            player.score += item.type === 'golden' ? 250 : 100;
            socket.emit('sound', 'pickup');

            if(room.itemsDelivered >= room.totalItems) {
              room.gameWon = true;
              io.to(currentRoom).emit('state', room);
            }
          }
        } else {
          const item = room.items.find(i => i.id === player.carrying);
          if(item) {
            item.carriedBy = null;
            item.x = player.x; item.y = player.y;
            player.carrying = null;
            if(item.type === 'cursed') {
              player.dimension = player.dimension === 'material' ? 'astral' : 'material';
            }
          }
        }
      } else {
        let nearest = null, minDist = 1.2;
        room.items.forEach(item => {
          if(!item.collected && item.carriedBy === null) {
            let d = Math.hypot(player.x - item.x, player.y - item.y);
            if(d < minDist) { minDist = d; nearest = item; }
          }
        });
        if(nearest) {
          nearest.carriedBy = playerId;
          player.carrying = nearest.id;
          socket.emit('sound', 'pickup');
          if(nearest.type === 'cursed') {
            player.dimension = player.dimension === 'material' ? 'astral' : 'material';
          }
        }
      }
    }
  });

  socket.on('disconnect', () => {
    if(currentRoom && rooms[currentRoom]) {
      delete rooms[currentRoom].players[playerId];
      if(Object.keys(rooms[currentRoom].players).length === 0) {
        delete rooms[currentRoom];
      } else {
        io.to(currentRoom).emit('lobby_state', { players: rooms[currentRoom].players, hostId: rooms[currentRoom].hostId });
      }
    }
  });
});

function startGameLoop(roomCode) {
  const timer = setInterval(() => {
    const room = rooms[roomCode];
    if(!room || !room.started || room.gameOver || room.gameWon) {
      clearInterval(timer);
      return;
    }

    room.historyTicks++;

    room.monsters.forEach(m => {
      let targetPlayer = null, minDist = 999;
      Object.values(room.players).forEach(p => {
        if(!p.dead) {
          let d = Math.hypot(p.x - m.x, p.y - m.y);
          if(d < minDist) { minDist = d; targetPlayer = p; }
        }
      });

      if(targetPlayer) {
        let angle = Math.atan2(targetPlayer.y - m.y, targetPlayer.x - m.x);
        m.dx = Math.cos(angle) * 0.045;
        m.dy = Math.sin(angle) * 0.045;
        
        let nx = m.x + m.dx; let ny = m.y + m.dy;
        if(room.map[Math.floor(m.y)][Math.floor(nx)] !== 1) m.x = nx;
        if(room.map[Math.floor(ny)][Math.floor(m.x)] !== 1) m.y = ny;
      }

      Object.values(room.players).forEach(p => {
        if(!p.dead && Math.hypot(p.x - m.x, p.y - m.y) < 0.52) {
          p.lives--;
          p.x = SPAWN_X; p.y = SPAWN_Y;
          if(p.carrying !== null) {
            let item = room.items.find(i => i.id === p.carrying);
            if(item) item.carriedBy = null;
            p.carrying = null;
          }
          if(p.lives <= 0) p.dead = true;
        }
      });
    });

    let survivors = Object.values(room.players).filter(p => !p.dead);
    if(survivors.length === 0) room.gameOver = true;

    io.to(roomCode).emit('state', room);
  }, 1000 / 30);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[HAUNT Server Online on Port ${PORT}]`));
