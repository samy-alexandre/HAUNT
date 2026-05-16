const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.static(path.join(__dirname, 'public')));

// Rooms storage
const rooms = {};

const MAP_W = 24;
const MAP_H = 18;

// Map layout: 0=floor, 1=wall
function generateMap() {
  const map = [];
  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      if (x === 0 || x === MAP_W - 1 || y === 0 || y === MAP_H - 1) {
        map[y][x] = 1;
      } else {
        map[y][x] = 0;
      }
    }
  }
  // Internal walls / rooms
  const walls = [
    // vertical walls
    [6,1,6,7],[6,9,6,17],[12,1,12,5],[12,7,12,12],[12,14,12,17],[18,1,18,7],[18,9,18,17],
  ];
  walls.forEach(([x1,y1,x2,y2]) => {
    if (x1 === x2) {
      for (let y = y1; y <= y2; y++) map[y][x1] = 1;
    } else {
      for (let x = x1; x <= x2; x++) map[y1][x] = 1;
    }
  });
  // Doors (openings)
  [[6,4],[6,13],[12,3],[12,9],[12,16],[18,4],[18,13]].forEach(([x,y]) => {
    map[y][x] = 0;
  });
  return map;
}

function generateItems() {
  const items = [];
  const positions = [
    {x:2,y:2},{x:3,y:8},{x:9,y:3},{x:9,y:14},{x:15,y:2},{x:15,y:9},{x:21,y:5},{x:21,y:14},{x:8,y:8},{x:20,y:8}
  ];
  positions.forEach((pos, i) => {
    items.push({ id: i, x: pos.x, y: pos.y, collected: false, carriedBy: null });
  });
  return items;
}

function generateMonsters() {
  return [
    { id: 0, x: 10, y: 5, dx: 1, dy: 0, speed: 0.03 },
    { id: 1, x: 20, y: 12, dx: -1, dy: 0, speed: 0.025 },
    { id: 2, x: 4, y: 14, dx: 0, dy: 1, speed: 0.02 },
  ];
}

function createRoom(roomId) {
  return {
    id: roomId,
    players: {},
    items: generateItems(),
    monsters: generateMonsters(),
    map: generateMap(),
    exit: { x: 22, y: 1 },
    score: 0,
    gameOver: false,
    gameWon: false,
    started: false,
    itemsDelivered: 0,
    totalItems: 10,
    lastUpdate: Date.now()
  };
}

function isWall(map, x, y) {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (ty < 0 || ty >= MAP_H || tx < 0 || tx >= MAP_W) return true;
  return map[ty][tx] === 1;
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function updateRoom(room) {
  if (room.gameOver || room.gameWon || !room.started) return;

  const players = Object.values(room.players);
  if (players.length === 0) return;

  const dt = 1;

  // Update monsters
  room.monsters.forEach(m => {
    // Simple patrol + chase
    let target = null;
    let minD = Infinity;
    players.forEach(p => {
      const d = dist(m, p);
      if (d < minD) { minD = d; target = p; }
    });

    let dx = m.dx;
    let dy = m.dy;

    if (target && minD < 5) {
      // Chase
      const angle = Math.atan2(target.y - m.y, target.x - m.x);
      dx = Math.cos(angle);
      dy = Math.sin(angle);
    }

    const nx = m.x + dx * m.speed * dt * 2;
    const ny = m.y + dy * m.speed * dt * 2;

    if (!isWall(room.map, nx, m.y)) m.x = nx;
    else m.dx = -m.dx;
    if (!isWall(room.map, m.x, ny)) m.y = ny;
    else m.dy = -m.dy;

    // Check catch player
    players.forEach(p => {
      if (!p.dead && dist(m, p) < 0.6) {
        // Drop carried item
        if (p.carrying !== null) {
          const item = room.items.find(i => i.id === p.carrying);
          if (item) {
            item.carriedBy = null;
            item.x = p.x;
            item.y = p.y;
          }
          p.carrying = null;
        }
        p.dead = true;
        p.respawnTimer = 180; // frames
      }
    });
  });

  // Respawn dead players
  players.forEach(p => {
    if (p.dead) {
      p.respawnTimer--;
      if (p.respawnTimer <= 0) {
        p.dead = false;
        p.x = 1.5;
        p.y = 1.5;
      }
    }
  });

  // Check items at exit
  const exit = room.exit;
  room.items.forEach(item => {
    if (!item.collected && item.carriedBy !== null) {
      const carrier = room.players[item.carriedBy];
      if (carrier && dist(carrier, exit) < 1.2) {
        item.collected = true;
        item.carriedBy = null;
        carrier.carrying = null;
        room.itemsDelivered++;
        room.score += 100;
      }
    }
  });

  // Win condition
  if (room.itemsDelivered >= room.totalItems) {
    room.gameWon = true;
  }
}

// Game loop
setInterval(() => {
  Object.values(rooms).forEach(room => {
    updateRoom(room);
    if (Object.keys(room.players).length > 0) {
      io.to(room.id).emit('state', {
        players: room.players,
        items: room.items,
        monsters: room.monsters,
        score: room.score,
        gameOver: room.gameOver,
        gameWon: room.gameWon,
        itemsDelivered: room.itemsDelivered,
        totalItems: room.totalItems
      });
    }
  });
}, 1000 / 30);

io.on('connection', (socket) => {
  let currentRoom = null;
  let playerId = socket.id;

  socket.on('create_room', () => {
    const roomId = uuidv4().slice(0, 6).toUpperCase();
    rooms[roomId] = createRoom(roomId);
    currentRoom = roomId;
    socket.join(roomId);
    const playerNum = Object.keys(rooms[roomId].players).length + 1;
    rooms[roomId].players[playerId] = {
      id: playerId, x: 1.5, y: 1.5, name: `Joueur ${playerNum}`,
      carrying: null, dead: false, respawnTimer: 0, color: '#00ff88'
    };
    socket.emit('room_created', { roomId, playerId });
    socket.emit('map', rooms[roomId].map);
  });

  socket.on('join_room', ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) { socket.emit('error', 'Salle introuvable !'); return; }
    if (Object.keys(room.players).length >= 6) { socket.emit('error', 'Salle pleine !'); return; }

    currentRoom = roomId;
    socket.join(roomId);
    const colors = ['#00ff88','#ff6b6b','#66d9ff','#ffcc00','#ff88ff','#88ffcc'];
    const playerNum = Object.keys(room.players).length;
    room.players[playerId] = {
      id: playerId, x: 1.5 + playerNum * 0.5, y: 2.5, name: `Joueur ${playerNum + 1}`,
      carrying: null, dead: false, respawnTimer: 0, color: colors[playerNum % colors.length]
    };
    socket.emit('joined', { playerId, roomId });
    socket.emit('map', room.map);
    io.to(roomId).emit('player_joined', { count: Object.keys(room.players).length });
  });

  socket.on('start_game', () => {
    if (!currentRoom || !rooms[currentRoom]) return;
    rooms[currentRoom].started = true;
    io.to(currentRoom).emit('game_started');
  });

  socket.on('input', ({ dx, dy, action }) => {
    if (!currentRoom || !rooms[currentRoom]) return;
    const room = rooms[currentRoom];
    const player = room.players[playerId];
    if (!player || player.dead || !room.started) return;

    const speed = 0.08;
    const nx = player.x + dx * speed;
    const ny = player.y + dy * speed;

    if (!isWall(room.map, nx, player.y)) player.x = nx;
    if (!isWall(room.map, player.x, ny)) player.y = ny;

    // Update carried item position
    if (player.carrying !== null) {
      const item = room.items.find(i => i.id === player.carrying);
      if (item) { item.x = player.x; item.y = player.y; }
    }

    // Action: pick up or drop
    if (action) {
      if (player.carrying !== null) {
        // Drop
        const item = room.items.find(i => i.id === player.carrying);
        if (item) { item.carriedBy = null; }
        player.carrying = null;
      } else {
        // Pick up nearest
        let nearest = null, minD = Infinity;
        room.items.forEach(item => {
          if (!item.collected && item.carriedBy === null) {
            const d = dist(player, item);
            if (d < 1.2 && d < minD) { minD = d; nearest = item; }
          }
        });
        if (nearest) {
          nearest.carriedBy = playerId;
          player.carrying = nearest.id;
        }
      }
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && rooms[currentRoom]) {
      const player = rooms[currentRoom].players[playerId];
      if (player && player.carrying !== null) {
        const item = rooms[currentRoom].items.find(i => i.id === player.carrying);
        if (item) { item.carriedBy = null; }
      }
      delete rooms[currentRoom].players[playerId];
      if (Object.keys(rooms[currentRoom].players).length === 0) {
        setTimeout(() => {
          if (rooms[currentRoom] && Object.keys(rooms[currentRoom].players).length === 0) {
            delete rooms[currentRoom];
          }
        }, 30000);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🎮 Serveur lancé sur http://localhost:${PORT}`));
