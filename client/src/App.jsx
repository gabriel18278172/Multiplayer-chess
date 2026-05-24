import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";

function makeRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function getGameStatus(chess, isGameOver, turn) {
  if (!isGameOver) {
    const nextTurn = turn === "w" ? "White" : "Black";
    if (chess.inCheck()) return `${nextTurn} to move (in check)`;
    return `${nextTurn} to move`;
  }

  if (chess.isCheckmate()) {
    const winner = chess.turn() === "w" ? "Black" : "White";
    return `Checkmate. ${winner} wins.`;
  }

  if (chess.isStalemate()) return "Stalemate.";
  if (chess.isThreefoldRepetition()) return "Draw by repetition.";
  if (chess.isInsufficientMaterial()) return "Draw by insufficient material.";
  if (chess.isDraw()) return "Draw.";
  return "Game over.";
}

function App() {
  const [socket, setSocket] = useState(null);
  const [connection, setConnection] = useState("Connecting...");
  const [queueStatus, setQueueStatus] = useState("idle");
  const [queueSize, setQueueSize] = useState(0);

  const [roomInput, setRoomInput] = useState(makeRoomCode());
  const [roomId, setRoomId] = useState("");
  const [playerColor, setPlayerColor] = useState(null);

  const [fen, setFen] = useState("start");
  const [turn, setTurn] = useState("w");
  const [isGameOver, setIsGameOver] = useState(false);
  const [players, setPlayers] = useState({ w: null, b: null });

  const [lastError, setLastError] = useState("");
  const [moveList, setMoveList] = useState([]);
  const [boardWidth, setBoardWidth] = useState(560);

  const chess = useMemo(() => {
    const game = new Chess();
    if (fen !== "start") game.load(fen);
    return game;
  }, [fen]);

  const ingestState = (state) => {
    setFen(state.fen);
    setTurn(state.turn);
    setIsGameOver(state.isGameOver);
    setPlayers(state.players || { w: null, b: null });

    const game = new Chess();
    game.load(state.fen);
    setMoveList(game.history());
  };

  useEffect(() => {
    const recalcBoard = () => {
      const viewport = window.innerWidth;
      if (viewport <= 460) setBoardWidth(Math.min(360, viewport - 24));
      else if (viewport <= 720) setBoardWidth(Math.min(460, viewport - 36));
      else if (viewport <= 980) setBoardWidth(520);
      else setBoardWidth(560);
    };

    recalcBoard();
    window.addEventListener("resize", recalcBoard);
    return () => window.removeEventListener("resize", recalcBoard);
  }, []);

  useEffect(() => {
    const nextSocket = io(SERVER_URL, {
      transports: ["websocket", "polling"]
    });

    setSocket(nextSocket);

    nextSocket.on("connect", () => setConnection("Connected"));
    nextSocket.on("disconnect", () => {
      setConnection("Disconnected");
      setQueueStatus("idle");
    });

    nextSocket.on("queue_size", ({ size }) => setQueueSize(Number(size || 0)));
    nextSocket.on("room_update", ingestState);
    nextSocket.on("move_made", ingestState);
    nextSocket.on("game_restarted", ingestState);

    nextSocket.on("match_found", (state) => {
      setLastError("");
      setQueueStatus("matched");
      setRoomId(state.roomId);
      setPlayerColor(state.you);
      ingestState(state);
    });

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  const joinRoom = () => {
    if (!socket) return;

    const code = roomInput.trim().toUpperCase();
    if (!code) {
      setLastError("Room code cannot be empty.");
      return;
    }

    socket.emit("join_room", { roomId: code }, (response) => {
      if (!response.ok) {
        setLastError(response.message || "Could not join room.");
        return;
      }

      setLastError("");
      setQueueStatus("manual");
      setRoomId(response.roomId);
      setPlayerColor(response.you);
      ingestState(response);
    });
  };

  const playNow = () => {
    if (!socket) return;
    setLastError("");
    setQueueStatus("seeking");
    socket.emit("leave_room", () => {
      setRoomId("");
      setPlayerColor(null);
      socket.emit("seek_match", (response) => {
        if (!response?.ok) {
          setQueueStatus("idle");
          setLastError(response?.message || "Could not enter queue.");
        }
      });
    });
  };

  const cancelSeek = () => {
    if (!socket) return;
    socket.emit("cancel_seek", (response) => {
      if (!response?.ok) {
        setLastError("Could not cancel queue.");
        return;
      }
      setQueueStatus("idle");
    });
  };

  const onPieceDrop = (sourceSquare, targetSquare, piece) => {
    if (!socket || !roomId || isGameOver) return false;

    if (!playerColor || turn !== playerColor) {
      setLastError("It is not your turn.");
      return false;
    }

    const movingPawn = piece?.toLowerCase().includes("p");
    const promotionRank = playerColor === "w" ? "8" : "1";
    const promotion = movingPawn && targetSquare.endsWith(promotionRank) ? "q" : undefined;

    socket.emit(
      "make_move",
      {
        roomId,
        move: {
          from: sourceSquare,
          to: targetSquare,
          promotion
        }
      },
      (response) => {
        if (!response.ok) {
          setLastError(response.message || "Illegal move.");
          return;
        }

        setLastError("");
      }
    );

    return true;
  };

  const requestRestart = () => {
    if (!socket || !roomId) return;
    socket.emit("request_restart", { roomId }, (response) => {
      if (!response.ok) {
        setLastError(response.message || "Could not restart.");
      }
    });
  };

  const whiteReady = Boolean(players.w);
  const blackReady = Boolean(players.b);
  const bothPlayersReady = whiteReady && blackReady;

  return (
    <div className="page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <h1>Realtime Chess Arena</h1>
        <p>Fast matchmaking • Live multiplayer • Mobile-ready boardplay</p>
      </header>

      <main className="layout">
        <section className="board-card">
          <div className="board-header">
            <div>
              <h2>Match Room</h2>
              <p className="room-code">{roomId || "Press Play to seek a match"}</p>
            </div>
            <div className="status-pill">{connection}</div>
          </div>

          <div className="play-row">
            <button className="primary-play" onClick={playNow} disabled={queueStatus === "seeking"}>
              {queueStatus === "seeking" ? "Seeking Opponent..." : "Play"}
            </button>
            {queueStatus === "seeking" ? (
              <button className="ghost" onClick={cancelSeek}>
                Cancel
              </button>
            ) : null}
          </div>

          <div className="join-row">
            <input
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value)}
              placeholder="Enter room code"
              maxLength={14}
            />
            <button onClick={joinRoom}>Join Room</button>
            <button className="ghost" onClick={() => setRoomInput(makeRoomCode())}>
              New Code
            </button>
          </div>

          {lastError ? <div className="error-box">{lastError}</div> : null}

          <div className="board-wrap">
            <Chessboard
              id="multiplayer-chessboard"
              position={fen}
              boardWidth={boardWidth}
              onPieceDrop={onPieceDrop}
              arePiecesDraggable={bothPlayersReady && !isGameOver}
              boardOrientation={playerColor === "b" ? "black" : "white"}
              customDarkSquareStyle={{ backgroundColor: "#769656" }}
              customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
            />
          </div>
        </section>

        <aside className="sidebar">
          <div className="panel">
            <h3>Game Status</h3>
            <p>{getGameStatus(chess, isGameOver, turn)}</p>
            <p>Your side: {playerColor === "w" ? "White" : playerColor === "b" ? "Black" : "Not assigned"}</p>
            <p>Queue: {queueStatus}</p>
            <p>Players searching: {queueSize}</p>
            <button onClick={requestRestart}>Restart Match</button>
          </div>

          <div className="panel">
            <h3>Players</h3>
            <div className="player-row">
              <span>White</span>
              <strong>{whiteReady ? "Connected" : "Waiting"}</strong>
            </div>
            <div className="player-row">
              <span>Black</span>
              <strong>{blackReady ? "Connected" : "Waiting"}</strong>
            </div>
          </div>

          <div className="panel">
            <h3>Move List</h3>
            <div className="moves">
              {moveList.length === 0 ? (
                <p className="muted">No moves yet.</p>
              ) : (
                moveList.map((move, i) => <div key={`${move}-${i}`}>{i + 1}. {move}</div>)
              )}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}

export default App;
