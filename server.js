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
  [{x:7,f:1,t:5},{x:7,f:7,t:12},{x:7,f:14,t:19},
   {x:14,f:1,t:3},{x:14,f:5,t:10},{x:14,f:12,t:19},
   {x:21,f:1,t:6},{x:21,f:8,t:19}
  ].forEach(({x,f,t})=>{ for(let y=f;y<=t;y++) map[y][x]=1; });

  // Horizontal walls with gaps
  [{y:7,f:1,t:5},{y:13,f:1,t:5},
   {y:4,f:8,t:12},{y:11,f:8,t:12},
   {y:7,f:15,t:19},{y:13,f:15,t:19},
   {y:5,f:22,t:26},{y:12,f:22,t:26}
  ].forEach(({y,f,t})=>{ for(let x=f;x<=t;x++) map[y][x]=1; });

  // Small pillars
  [[2,3],[5,3],[2,11],[5,11],[2,16],[5,16],
   [10,2],[13,2],[10,6],[13,6],[10,10],[13,10],[10,14],[13,14],
   [17,3],[20,3],[17,10],[20,10],[17,16],[20,16],
   [23,2],[26,2],[23,9],[26,9],[23,16],[26,16]
  ].forEach(([x,y])=>{ if(map[y]&&map[y][x]!==undefined) map[y][x]=1; });

  return map;
}

// Check if a tile is reachable via flood fill from spawn
function isReachable(map, sx, sy, tx, ty) {
  const visited = new Set();
  const queue = [[sx, sy]];
  visited.add(`${sx},${sy}`);
  while(queue.length) {
    const [cx, cy] = queue.shift();
    if(cx===tx && cy===ty) return true;
    for(const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
      const key=`${nx},${ny}`;
      if(nx>=0&&nx<MAP_W&&ny>=0&&ny<MAP_H&&!visited.has(key)&&map[ny][nx]===0) {
        visited.add(key); queue.push([nx,ny]);
      }
    }
  }
  return false;
}

// Check if position has enough open space around it (no trapped)
function hasSpace(map, x, y, radius=1) {
  let open=0;
  for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++) {
    const tx=x+dx, ty=y+dy;
    if(tx>=0&&tx<MAP_W&&ty>=0&&ty<MAP_H&&map[ty][tx]===0) open++;
  }
  return open >= 4;
}

function generateExit(map) {
  // Possible exit positions — validated against reachability from spawn
  const candidates = [
    {x:25,y:1},{x:25,y:17},{x:1,y:17},
    {x:9,y:1},{x:17,y:1},{x:22,y:17},
    {x:1,y:9},{x:25,y:9},{x:9,y:17},{x:15,y:17},
  ].sort(()=>Math.random()-0.5);

  for(const c of candidates) {
    // Clear 2x2 area
    let valid=true;
    for(let dy=0;dy<=1&&valid;dy++) for(let dx=0;dx<=1&&valid;dx++) {
      if(c.x+dx>=MAP_W-1||c.y+dy>=MAP_H-1) valid=false;
    }
    if(!valid) continue;
    // Temporarily clear and check reachability from spawn
    const tmpMap = map.map(r=>[...r]);
    for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++) tmpMap[c.y+dy][c.x+dx]=0;
    if(isReachable(tmpMap,1,1,c.x,c.y)) {
      return {x:c.x+0.5, y:c.y+0.5, gx:c.x, gy:c.y, map:tmpMap};
    }
  }
  // Fallback
  const tmpMap=map.map(r=>[...r]);
  for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++) tmpMap[1+dy][25+dx]=0;
  return {x:25.5, y:1.5, gx:25, gy:1, map:tmpMap};
}

function generateItems(map, level, exitPos) {
  const count = 6 + level * 2;
  const positions = [], forbidden = new Set();
  // Mark exit zone and spawn zone as forbidden
  for(let dy=0;dy<=1;dy++) for(let dx=0;dx<=1;dx++) {
    forbidden.add(`${exitPos.gx+dx},${exitPos.gy+dy}`);
    forbidden.add(`${1+dx},${1+dy}`);
  }
  let tries=0;
  while(positions.length < count && tries < 5000) {
    tries++;
    const x = 1 + Math.floor(Math.random()*(MAP_W-2));
    const y = 1 + Math.floor(Math.random()*(MAP_H-2));
    const key=`${x},${y}`;
    if(!forbidden.has(key) && map[y][x]===0 && hasSpace(map,x,y,1) && isReachable(map,1,1,x,y)) {
      positions.push({x:x+0.5, y:y+0.5});
      forbidden.add(key);
    }
  }
  return positions.map((p,i)=>({id:i,x:p.x,y:p.y,collected:false,carriedBy:null}));
}

function generateMonsters(map, level) {
  const spd=(b)=>b+level*0.003;
  const candidates=[
    {x:10,y:5,dx:1,dy:0,speed:spd(0.022)},
    {x:22,y:15,dx:-1,dy:0,speed:spd(0.019)},
    {x:4,y:15,dx:0,dy:1,speed:spd(0.017)},
    {x:17,y:10,dx:1,dy:1,speed:spd(0.015)},
    {x:24,y:5,dx:-1,dy:0,speed:spd(0.024)},
    {x:8,y:12,dx:0,dy:-1,speed:spd(0.026)},
  ];
  const monsters=[];
  const count = Math.min(4+Math.floor(level/2), candidates.length);
  for(let i=0;i<count;i++) {
    const c=candidates[i];
    // Find nearest walkable tile if current is a wall
    let mx=c.x, my=c.y;
    if(map[my][mx]===1) {
      outer: for(let r=1;r<5;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++) {
        if(map[my+dy]&&map[my+dy][mx+dx]===0&&hasSpace(map,mx+dx,my+dy,1)) {
          mx=mx+dx; my=my+dy; break outer;
        }
      }
    }
    monsters.push({id:i,x:mx+0.5,y:my+0.5,dx:c.dx,dy:c.dy,speed:c.speed});
  }
  return monsters;
}

function createRoom(roomId, hostId) {
  const level=1;
  const baseMap=generateMap();
  const exitData=generateExit(baseMap);
  const map=exitData.map;
  const exit={x:exitData.x,y:exitData.y,gx:exitData.gx,gy:exitData.gy};
  return {
    id:roomId, hostId, players:{},
    items:generateItems(map,level,exit),
    monsters:generateMonsters(map,level),
    map, exit,
    score:0,gameOver:false,gameWon:false,started:false,
    itemsDelivered:0,totalItems:6+level*2,
    level,chatMessages:[],leaderboard:[]
  };
}

const R=0.28;
function canMove(map,x,y){
  const corners=[[x-R,y-R],[x+R,y-R],[x-R,y+R],[x+R,y+R]];
  for(const[cx,cy] of corners){
    const tx=Math.floor(cx),ty=Math.floor(cy);
    if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H||map[ty][tx]===1) return false;
  }
  return true;
}

function wallSimple(map,x,y){
  const tx=Math.floor(x),ty=Math.floor(y);
  if(tx<0||tx>=MAP_W||ty<0||ty>=MAP_H) return true;
  return map[ty][tx]===1;
}

function dist(a,b){return Math.sqrt((a.x-b.x)**2+(a.y-b.y)**2);}

function updateRoom(room){
  if(room.gameOver||room.gameWon||!room.started) return;
  const players=Object.values(room.players);
  if(!players.length) return;

  room.monsters.forEach(m=>{
    let target=null,minD=Infinity;
    players.forEach(p=>{const d=dist(m,p);if(d<minD){minD=d;target=p;}});
    let dx=m.dx,dy=m.dy;
    if(target&&minD<8){const a=Math.atan2(target.y-m.y,target.x-m.x);dx=Math.cos(a);dy=Math.sin(a);}
    const spd=m.speed*2;
    const nx=m.x+dx*spd,ny=m.y+dy*spd;
    if(!wallSimple(room.map,nx,m.y))m.x=nx; else m.dx=-m.dx;
    if(!wallSimple(room.map,m.x,ny))m.y=ny; else m.dy=-m.dy;
    players.forEach(p=>{
      if(!p.dead&&dist(m,p)<0.7){
        if(p.carrying!==null){
          const item=room.items.find(i=>i.id===p.carrying);
          if(item){item.carriedBy=null;item.x=p.x;item.y=p.y;}
          p.carrying=null;
        }
        p.dead=true;p.respawnTimer=150;p.deaths=(p.deaths||0)+1;
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
        room.score+=pts;carrier.score=(carrier.score||0)+pts;
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

  socket.on('create_room',({name})=>{
    const roomId=uuidv4().slice(0,6).toUpperCase();
    rooms[roomId]=createRoom(roomId,playerId);
    currentRoom=roomId;socket.join(roomId);
    rooms[roomId].players[playerId]={id:playerId,x:1.5,y:1.5,name:name||'Joueur 1',carrying:null,dead:false,respawnTimer:0,color:'#00ff88',score:0,deaths:0};
    socket.emit('room_created',{roomId,playerId,isHost:true});
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
    socket.emit('joined',{playerId,roomId,isHost:false});
    socket.emit('map',room.map);
    socket.emit('chat_history',room.chatMessages.slice(-20));
    io.to(roomId).emit('player_joined',{count:Object.keys(room.players).length,name:room.players[playerId].name});
  });

  socket.on('start_game',()=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    if(rooms[currentRoom].hostId!==playerId) return;
    rooms[currentRoom].started=true;
    io.to(currentRoom).emit('game_started');
  });

  socket.on('next_level',()=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom];
    if(room.hostId!==playerId||!room.gameWon) return;
    room.level++;
    const baseMap=generateMap();
    const exitData=generateExit(baseMap);
    room.map=exitData.map;
    room.exit={x:exitData.x,y:exitData.y,gx:exitData.gx,gy:exitData.gy};
    room.items=generateItems(room.map,room.level,room.exit);
    room.monsters=generateMonsters(room.map,room.level);
    room.itemsDelivered=0;room.totalItems=6+room.level*2;room.gameWon=false;
    Object.values(room.players).forEach(p=>{p.x=1.5;p.y=1.5;p.carrying=null;p.dead=false;});
    io.to(currentRoom).emit('map',room.map);
    io.to(currentRoom).emit('level_start',{level:room.level,totalItems:room.totalItems});
  });

  socket.on('chat',({msg})=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom],player=room.players[playerId];
    if(!player||!msg||!msg.trim()) return;
    const message={name:player.name,color:player.color,msg:msg.trim().slice(0,80)};
    room.chatMessages.push(message);
    if(room.chatMessages.length>50) room.chatMessages.shift();
    io.to(currentRoom).emit('chat_msg',message);
  });

  socket.on('input',({dx,dy,action,boost})=>{
    if(!currentRoom||!rooms[currentRoom]) return;
    const room=rooms[currentRoom],player=room.players[playerId];
    if(!player||player.dead||!room.started) return;

    // Stamina
    if(player.stamina===undefined) player.stamina=100;
    const boosting=boost&&player.stamina>0&&!player.dead;
    if(boosting) player.stamina=Math.max(0,player.stamina-2);
    else player.stamina=Math.min(100,player.stamina+0.4);

    const spd=boosting?0.2:0.11;
    const nx=player.x+dx*spd,ny=player.y+dy*spd;
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
        // Wider pickup radius, pick closest
        let nearest=null,minD=Infinity;
        room.items.forEach(item=>{
          if(!item.collected&&item.carriedBy===null){
            const d=dist(player,item);
            if(d<1.8&&d<minD){minD=d;nearest=item;}
          }
        });
        if(nearest){
          nearest.carriedBy=playerId;player.carrying=nearest.id;
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
      if(rooms[currentRoom].hostId===playerId){
        const remaining=Object.keys(rooms[currentRoom].players).filter(id=>id!==playerId);
        if(remaining.length) {
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
server.listen(PORT,()=>console.log(`HAUNT v8 on ${PORT}`));
