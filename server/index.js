import express from "express";
import logger from "morgan";

import { Server } from "socket.io";
import { createServer } from "node:http";
import { createClient } from "@libsql/client";

const PORT = process.env.PORT || 3000;

const app = express();
const server = createServer(app);

const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL
  )
`);

app.use(logger("dev"));

io.on("connection", async (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", async (msg) => {
    let result = "";
    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content) values (:msg)",
        args: { msg },
      });
    } catch (error) {
      console.error(error);
      return;
    }
    io.emit("chat message", msg, result.lastInsertRowid.toString());
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT * FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        socket.emit("chat message", row.content, row.id.toString());
      });
    } catch (error) {
      console.error(error);
      return;
    }
  }
});

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
