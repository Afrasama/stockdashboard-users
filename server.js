require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

console.log("👉 server.js starting...");

// ---------- express + socket.io ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ---------- mongo setup (FINAL FIX) ----------
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("❌ MONGODB_URI is not defined");
  process.exit(1);
}

console.log("👉 connecting to mongodb atlas...");

mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ connected to mongodb atlas"))
  .catch((err) => {
    console.error("❌ mongo connection error:", err);
    process.exit(1);
  });

// ---------- user schema ----------
const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    subscriptions: { type: [String], default: [] },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ---------- stocks ----------
const SUPPORTED_STOCKS = ["GOOG", "TSLA", "AMZN", "META", "NVDA"];

const stockPrices = {};
SUPPORTED_STOCKS.forEach((s) => (stockPrices[s] = 100 + Math.random() * 100));

const clients = {};

// ---------- socket handlers ----------
io.on("connection", (socket) => {
  console.log("🔌 client connected:", socket.id);
  clients[socket.id] = { email: null };

  socket.on("register", async ({ email, password }) => {
    try {
      if (!email || !password) return;

      const exists = await User.findOne({ email });
      if (exists) {
        socket.emit("register_error", "user already exists");
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await User.create({ email, passwordHash });

      socket.emit("register_success", "registration successful");
    } catch (err) {
      socket.emit("register_error", "server error");
    }
  });

  socket.on("login", async ({ email, password }) => {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        socket.emit("login_error", "user not found");
        return;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        socket.emit("login_error", "incorrect password");
        return;
      }

      clients[socket.id].email = email;

      socket.emit("login_success", {
        email,
        supportedStocks: SUPPORTED_STOCKS,
      });

      socket.emit("subscribed", user.subscriptions);
    } catch (err) {
      socket.emit("login_error", "server error");
    }
  });

  socket.on("subscribe", async (symbol) => {
    const email = clients[socket.id]?.email;
    if (!email) return;

    const user = await User.findOneAndUpdate(
      { email },
      { $addToSet: { subscriptions: symbol } },
      { new: true }
    );

    socket.emit("subscribed", user.subscriptions);
  });

  socket.on("unsubscribe", async (symbol) => {
    const email = clients[socket.id]?.email;
    if (!email) return;

    const user = await User.findOneAndUpdate(
      { email },
      { $pull: { subscriptions: symbol } },
      { new: true }
    );

    socket.emit("subscribed", user.subscriptions);
  });

  socket.on("disconnect", () => {
    delete clients[socket.id];
    console.log("🔌 client disconnected:", socket.id);
  });
});

// ---------- price updates ----------
setInterval(() => {
  const time = new Date().toISOString();

  SUPPORTED_STOCKS.forEach((s) => {
    stockPrices[s] += (Math.random() - 0.5) * 2;
    io.emit("price_update", { symbol: s, price: stockPrices[s], time });
  });
}, 1000);

// ---------- start server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 server running on port ${PORT}`);
});
