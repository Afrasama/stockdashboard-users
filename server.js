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

// ---------- mongo setup (atlas only) ----------
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error("❌ MONGODB_URI not set");
  process.exit(1);
}

console.log("👉 connecting to mongodb atlas...");

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("✅ connected to mongodb atlas");
  })
  .catch((err) => {
    console.error("❌ mongo connection error:", err);
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
SUPPORTED_STOCKS.forEach((sym) => {
  stockPrices[sym] = 100 + Math.random() * 100;
});

// socket.id -> { email }
const clients = {};

// ---------- socket handlers ----------
io.on("connection", (socket) => {
  console.log("🔌 client connected:", socket.id);

  clients[socket.id] = { email: null };

  // ----- register -----
  socket.on("register", async ({ email, password }) => {
    try {
      if (!email || !email.includes("@")) {
        return socket.emit("register_error", "invalid email");
      }
      if (!password || password.length < 6) {
        return socket.emit(
          "register_error",
          "password must be at least 6 characters"
        );
      }

      const existing = await User.findOne({ email });
      if (existing) {
        return socket.emit("register_error", "user already exists");
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await User.create({ email, passwordHash });

      console.log("🆕 registered:", email);
      socket.emit("register_success", "registration successful");
    } catch (err) {
      console.error("register error:", err);
      socket.emit("register_error", "server error");
    }
  });

  // ----- login -----
  socket.on("login", async ({ email, password }) => {
    try {
      const user = await User.findOne({ email });
      if (!user) {
        return socket.emit("login_error", "user not found");
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return socket.emit("login_error", "incorrect password");
      }

      clients[socket.id].email = email;

      console.log("✅ login:", email);

      socket.emit("login_success", {
        email,
        supportedStocks: SUPPORTED_STOCKS,
      });

      socket.emit("subscribed", user.subscriptions);
    } catch (err) {
      console.error("login error:", err);
      socket.emit("login_error", "server error");
    }
  });

  // ----- subscribe -----
  socket.on("subscribe", async (symbol) => {
    const client = clients[socket.id];
    if (!client?.email) return;

    const user = await User.findOneAndUpdate(
      { email: client.email },
      { $addToSet: { subscriptions: symbol } },
      { new: true }
    );

    if (user) socket.emit("subscribed", user.subscriptions);
  });

  // ----- unsubscribe -----
  socket.on("unsubscribe", async (symbol) => {
    const client = clients[socket.id];
    if (!client?.email) return;

    const user = await User.findOneAndUpdate(
      { email: client.email },
      { $pull: { subscriptions: symbol } },
      { new: true }
    );

    if (user) socket.emit("subscribed", user.subscriptions);
  });

  socket.on("request_initial_prices", () => {
    socket.emit("initial_prices", stockPrices);
  });

  socket.on("disconnect", () => {
    console.log("🔌 client disconnected:", socket.id);
    delete clients[socket.id];
  });
});

// ---------- stock price updates ----------
setInterval(() => {
  const time = new Date().toISOString();

  SUPPORTED_STOCKS.forEach((sym) => {
    const delta = (Math.random() - 0.5) * 2;
    stockPrices[sym] = Math.max(1, stockPrices[sym] + delta);

    io.emit("price_update", {
      symbol: sym,
      price: stockPrices[sym],
      time,
    });
  });
}, 1000);

// ---------- start server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 server running on port ${PORT}`);
});
