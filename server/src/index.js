import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { Chess } from "chess.js";

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "multiplayer-chess-server" });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();

function createRoomState(roomId) {
  return {
    id: roomId,
    game: new Chess(),
    players: {
      w: null,
      b: null
    }
  };
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

    const payload = {
      ...getPublicRoomState(room),
      you: assignedColor
    };

    callback({ ok: true, ...payload });
    io.to(normalizedRoomId).emit("room_update", getPublicRoomState(room));
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
    } catch (_err) {
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
    for (const [roomId, room] of rooms.entries()) {
      let changed = false;
      if (room.players.w === socket.id) {
        room.players.w = null;
        changed = true;
      }
      if (room.players.b === socket.id) {
        room.players.b = null;
        changed = true;
      }

      if (!changed) continue;

      io.to(roomId).emit("room_update", getPublicRoomState(room));

      if (!room.players.w && !room.players.b) {
        rooms.delete(roomId);
      }
    }
  });
});

const port = Number(process.env.PORT || 3001);
httpServer.listen(port, () => {
  console.log(`Chess server running on port ${port}`);
});
