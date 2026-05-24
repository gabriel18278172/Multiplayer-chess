import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Chess } from "chess.js";

function parseCorsOrigins(value) {
  if (!value) return "*";
  const origins = value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0) return "*";
  if (origins.length === 1) return origins[0];
  return origins;
}

const corsOrigins = parseCorsOrigins(process.env.CLIENT_URL);

const app = express();
app.use(cors({ origin: corsOrigins }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "multiplayer-chess-server" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins,
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
let seekQueue = [];

function createRoomState(roomId) {
  return {
    id: roomId,
    game: new Chess(),
    players: { w: null, b: null },
    createdAt: Date.now()
  };
}

function createMatchRoomId() {
  return `MATCH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function getPublicRoomState(room) {
  return {
    roomId: room.id,
    fen: room.game.fen(),
    pgn: room.game.pgn(),
    turn: room.game.turn(),
    isGameOver: room.game.isGameOver(),
    inCheck: room.game.inCheck(),
    players: room.players,
    createdAt: room.createdAt
  };
}

function resolveColor(room, socketId) {
  if (room.players.w === socketId) return "w";
  if (room.players.b === socketId) return "b";
  return null;
}

function removeFromQueue(socketId) {
  const initialLen = seekQueue.length;
  seekQueue = seekQueue.filter((entry) => entry.socketId !== socketId);
  return initialLen !== seekQueue.length;
}

function releasePlayerFromRoom(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    let changed = false;
    if (room.players.w === socketId) {
      room.players.w = null;
      changed = true;
    }
    if (room.players.b === socketId) {
      room.players.b = null;
      changed = true;
    }

    if (!changed) continue;

    io.to(roomId).emit("room_update", getPublicRoomState(room));

    if (!room.players.w && !room.players.b) {
      rooms.delete(roomId);
    }
  }
}

function leaveTrackedRooms(socket) {
  for (const roomId of socket.rooms) {
    if (roomId !== socket.id) socket.leave(roomId);
  }
}

function currentPlayerRoomId(socketId) {
  for (const room of rooms.values()) {
    if (room.players.w === socketId || room.players.b === socketId) return room.id;
  }
  return null;
}

function emitQueueSize() {
  io.emit("queue_size", { size: seekQueue.length });
}

function startMatchIfPossible() {
  while (seekQueue.length >= 2) {
    const first = seekQueue.shift();
    const second = seekQueue.shift();

    const firstSocket = io.sockets.sockets.get(first.socketId);
    const secondSocket = io.sockets.sockets.get(second.socketId);

    if (!firstSocket || !secondSocket) continue;

    const whiteFirst = Math.random() >= 0.5;
    const whiteSocket = whiteFirst ? firstSocket : secondSocket;
    const blackSocket = whiteFirst ? secondSocket : firstSocket;

    const roomId = createMatchRoomId();
    const room = createRoomState(roomId);
    room.players.w = whiteSocket.id;
    room.players.b = blackSocket.id;
    rooms.set(roomId, room);

    for (const socket of [whiteSocket, blackSocket]) {
      removeFromQueue(socket.id);
      leaveTrackedRooms(socket);
      releasePlayerFromRoom(socket.id);
      socket.join(roomId);
      socket.data.roomId = roomId;
    }

    whiteSocket.emit("match_found", { ...getPublicRoomState(room), roomId, you: "w" });
    blackSocket.emit("match_found", { ...getPublicRoomState(room), roomId, you: "b" });
    io.to(roomId).emit("room_update", getPublicRoomState(room));
  }

  emitQueueSize();
}

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId }, callback = () => {}) => {
    if (!roomId || typeof roomId !== "string") {
      callback({ ok: false, message: "Invalid room code." });
      return;
    }

function releasePlayerFromRoom(socketId) {
  for (const [roomId, room] of rooms.entries()) {
    let changed = false;
    if (room.players.w === socketId) {
      room.players.w = null;
      changed = true;
    }
    if (room.players.b === socketId) {
      room.players.b = null;
      changed = true;
    }

    removeFromQueue(socket.id);
    emitQueueSize();
    leaveTrackedRooms(socket);
    releasePlayerFromRoom(socket.id);

    let room = rooms.get(normalizedRoomId);
    if (!room) {
      room = createRoomState(normalizedRoomId);
      rooms.set(normalizedRoomId, room);
    }
  }
}

function leaveTrackedRooms(socket) {
  for (const roomId of socket.rooms) {
    if (roomId !== socket.id) socket.leave(roomId);
  }
}

function clearPlayerState(socket) {
  removeFromQueue(socket.id);
  leaveTrackedRooms(socket);
  releasePlayerFromRoom(socket.id);
  socket.data.roomId = null;
}

function emitQueueSize() {
  io.emit("queue_size", { size: seekQueue.length });
}

function startMatchIfPossible() {
  while (seekQueue.length >= 2) {
    const first = seekQueue.shift();
    const second = seekQueue.shift();

    const firstSocket = io.sockets.sockets.get(first.socketId);
    const secondSocket = io.sockets.sockets.get(second.socketId);

    if (!firstSocket || !secondSocket) continue;

    const whiteFirst = Math.random() >= 0.5;
    const whiteSocket = whiteFirst ? firstSocket : secondSocket;
    const blackSocket = whiteFirst ? secondSocket : firstSocket;

    const roomId = createMatchRoomId();
    const room = createRoomState(roomId);
    room.players.w = whiteSocket.id;
    room.players.b = blackSocket.id;
    rooms.set(roomId, room);

    for (const socket of [whiteSocket, blackSocket]) {
      removeFromQueue(socket.id);
      leaveTrackedRooms(socket);
      releasePlayerFromRoom(socket.id);
      socket.join(roomId);
      socket.data.roomId = roomId;
    }

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    activeMatchBySocket.set(socket.id, normalizedRoomId);

    callback({ ok: true, ...getPublicRoomState(room), you: assignedColor });
    io.to(normalizedRoomId).emit("room_update", getPublicRoomState(room));
  });

  socket.on("seek_match", (callback = () => {}) => {
    if (currentPlayerRoomId(socket.id)) {
      callback({ ok: false, message: "Leave your current room before seeking." });
      return;
    }

    if (seekQueue.some((entry) => entry.socketId === socket.id)) {
      callback({ ok: true, status: "queued", queueSize: seekQueue.length });
      return;
    }

    seekQueue.push({ socketId: socket.id, createdAt: Date.now() });
    startMatchIfPossible();
    callback({ ok: true, status: "queued", queueSize: seekQueue.length });
  });

  socket.on("cancel_seek", (callback = () => {}) => {
    const removed = removeFromQueue(socket.id);
    emitQueueSize();
    callback({ ok: true, removed, queueSize: seekQueue.length });
  });

  socket.on("leave_room", (callback = () => {}) => {
    leaveTrackedRooms(socket);
    releasePlayerFromRoom(socket.id);
    socket.data.roomId = null;
    callback({ ok: true });
  });

  socket.on("make_move", ({ roomId, move }, callback = () => {}) => {
    const room = rooms.get((roomId || "").toUpperCase());
    if (!room) {
      callback({ ok: false, message: "Room not found." });
      return;
    }

    const color = resolveColor(room, socket.id);
    if (!color) {
      callback({ ok: false, message: "You are not part of this room." });
      return;
    }

    if (room.game.turn() !== color) {
      callback({ ok: false, message: "Not your turn." });
      return;
    }

    try {
      const result = room.game.move(move);
      if (!result) {
        callback({ ok: false, message: "Illegal move." });
        return;
      }

      const state = getPublicRoomState(room);
      io.to(room.id).emit("move_made", state);
      callback({ ok: true, ...state });
    } catch {
      callback({ ok: false, message: "Move failed." });
    }
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    emitQueueSize();
    releasePlayerFromRoom(socket.id);
  });
});

const port = Number(process.env.PORT || 3001);
httpServer.listen(port, () => {
  console.log(`Chess server running on port ${port}`);
});
