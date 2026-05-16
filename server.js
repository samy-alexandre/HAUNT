const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

/* =======================
   🔥 RENDER CSP SAFE
======================= */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline' https://cdn.socket.io",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' ws: wss:",
    ].join("; ")
  );
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

/* =======================
   🔥 SOCKET.IO FIX
======================= */
const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["websocket","polling"]
});

/* =======================
   GAME DATA
======================= */
const rooms = {};
const MAP_W = 30;
const MAP_H = 22;

/* =======================
   MAP GENERATOR (SAFE)
======================= */
function generateMap() {
  const map = [];

  for (let y = 0; y < MAP_H; y++) {
    map[y] = [];
    for (let x = 0; x < MAP_W; x++) {
      map[y][x] =
        (x === 0 || y === 0 || x === MAP_W - 1 || y === MAP_H - 1) ? 1 : 0;
    }
  }

  // murs internes simples MAIS PAS bloquants spawn/exit
  for (let y = 4; y < 18; y++) {
    if (y !== 8 && y !== 14) {
      map[y][12] = 1;
    }
  }

  for (let x = 6; x < 24; x++) {
    if (x !== 10 && x !== 18) {
      map[10][x] = 1;
    }
  }

  // spawn safe
  map[1][1] = 0;

  // exit safe
  map[1][28] = 0;

  return map;
}

/* =======================
   ROOM
======================= */
function createRoom(id) {
  return {
    id,
    players: {},
    map: generateMap(),
    started: false
  };
}

/* =======================
   LOOP
======================= */
setInterval(() => {
  Object.values(rooms).forEach(room => {
    io.to(room.id).emit("state", room);
  });
}, 1000 / 30);

/* =======================
   SOCKET LOGIC
======================= */
io.on("connection", (socket) => {
  let roomId = null;

  socket.on("create_room", ({ name }) => {
    roomId = uuidv4().slice(0, 6).toUpperCase();

    rooms[roomId] = createRoom(roomId);
    socket.join(roomId);

    rooms[roomId].players[socket.id] = {
      id: socket.id,
      x: 1.5,
      y: 1.5,
      name: name || "Player",
      color: "#00ff88"
    };

    socket.emit("room_created", { roomId, playerId: socket.id });
    socket.emit("map", rooms[roomId].map);
  });

  socket.on("join_room", ({ roomId: joinId, name }) => {
    const room = rooms[joinId];
    if (!room) return socket.emit("error", "Room not found");

    roomId = joinId;
    socket.join(roomId);

    room.players[socket.id] = {
      id: socket.id,
      x: 2.5,
      y: 2.5,
      name: name || "Player",
      color: "#00ff88"
    };

    socket.emit("joined", { roomId, playerId: socket.id });
    socket.emit("map", room.map);
  });

  socket.on("start_game", () => {
    if (!roomId || !rooms[roomId]) return;
    rooms[roomId].started = true;
    io.to(roomId).emit("game_started");
  });

  socket.on("input", ({ dx, dy }) => {
    const room = rooms[roomId];
    if (!room) return;

    const p = room.players[socket.id];
    if (!p) return;

    const speed = 0.1;

    const nx = p.x + dx * speed;
    const ny = p.y + dy * speed;

    p.x = nx;
    p.y = ny;
  });

  socket.on("disconnect", () => {
    if (!roomId || !rooms[roomId]) return;
    delete rooms[roomId].players[socket.id];
  });
});

/* =======================
   START SERVER
======================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("HAUNT running on port", PORT);
});
