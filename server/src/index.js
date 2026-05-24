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
const activeMatchBySocket = new Map();
let seekQueue = [];

function createRoomState(roomId) {
  return {
    id: roomId,
    game: new Chess(),
    players: { w: null, b: null }
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
    players: room.players
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

function leaveTrackedRooms(socket) {
  for (const joinedRoomId of socket.rooms) {
    if (joinedRoomId !== socket.id) socket.leave(joinedRoomId);
  }
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

io.on("connection", (socket) => {
  socket.on("join_room", ({ roomId }, callback = () => {}) => {
    if (!roomId || typeof roomId !== "string") {
      callback({ ok: false, message: "Invalid room code." });
      return;
    }

    const normalizedRoomId = roomId.trim().toUpperCase();
    if (!normalizedRoomId) {
      callback({ ok: false, message: "Room code cannot be empty." });
      return;
    }

    removeFromQueue(socket.id);
    leaveTrackedRooms(socket);
    releasePlayerFromRoom(socket.id);

    let room = rooms.get(normalizedRoomId);
    if (!room) {
      room = createRoomState(normalizedRoomId);
      rooms.set(normalizedRoomId, room);
    }

    let assignedColor = null;
    if (!room.players.w) {
      room.players.w = socket.id;
      assignedColor = "w";
    } else if (!room.players.b) {
      room.players.b = socket.id;
      assignedColor = "b";
    } else {
      callback({ ok: false, message: "Room is full." });
      return;
    }

    socket.join(normalizedRoomId);
    socket.data.roomId = normalizedRoomId;
    activeMatchBySocket.set(socket.id, normalizedRoomId);

    const payload = {
      ...getPublicRoomState(room),
      you: assignedColor
    };

    callback({ ok: true, ...payload });
    io.to(normalizedRoomId).emit("room_update", getPublicRoomState(room));
  });

  socket.on("seek_match", (callback = () => {}) => {
    if (activeMatchBySocket.get(socket.id)) {
      callback({ ok: false, message: "You are already in a match." });
      return;
    }

    if (seekQueue.some((entry) => entry.socketId === socket.id)) {
      callback({ ok: true, status: "queued", queueSize: seekQueue.length });
      return;
    }

    seekQueue.push({ socketId: socket.id, createdAt: Date.now() });

    if (seekQueue.length >= 2) {
      const first = seekQueue.shift();
      const second = seekQueue.shift();
      const whiteFirst = Math.random() >= 0.5;
      const whiteSocketId = whiteFirst ? first.socketId : second.socketId;
      const blackSocketId = whiteFirst ? second.socketId : first.socketId;

      const roomId = createMatchRoomId();
      const room = createRoomState(roomId);
      room.players.w = whiteSocketId;
      room.players.b = blackSocketId;
      rooms.set(roomId, room);

      const whiteSocket = io.sockets.sockets.get(whiteSocketId);
      const blackSocket = io.sockets.sockets.get(blackSocketId);

      for (const currentSocket of [whiteSocket, blackSocket]) {
        if (!currentSocket) continue;
        leaveTrackedRooms(currentSocket);
        releasePlayerFromRoom(currentSocket.id);
        currentSocket.join(roomId);
        currentSocket.data.roomId = roomId;
        activeMatchBySocket.set(currentSocket.id, roomId);
      }

      if (whiteSocket) {
        whiteSocket.emit("match_found", {
          ...getPublicRoomState(room),
          roomId,
          you: "w"
        });
      }

      if (blackSocket) {
        blackSocket.emit("match_found", {
          ...getPublicRoomState(room),
          roomId,
          you: "b"
        });
      }

      io.to(roomId).emit("room_update", getPublicRoomState(room));
    }

    callback({ ok: true, status: "queued", queueSize: seekQueue.length });
  });

  socket.on("cancel_seek", (callback = () => {}) => {
    const removed = removeFromQueue(socket.id);
    callback({ ok: true, removed, queueSize: seekQueue.length });
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

  socket.on("request_restart", ({ roomId }, callback = () => {}) => {
    const normalizedRoomId = (roomId || "").toUpperCase();
    const room = rooms.get(normalizedRoomId);
    if (!room) {
      callback({ ok: false, message: "Room not found." });
      return;
    }

    room.game.reset();
    const state = getPublicRoomState(room);
    io.to(normalizedRoomId).emit("game_restarted", state);
    callback({ ok: true, ...state });
  });

  socket.on("disconnect", () => {
    removeFromQueue(socket.id);
    activeMatchBySocket.delete(socket.id);
    releasePlayerFromRoom(socket.id);
  });
});

const port = Number(process.env.PORT || 3001);
httpServer.listen(port, () => {
  console.log(`Chess server running on port ${port}`);
});
