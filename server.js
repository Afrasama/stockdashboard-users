require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

console.log("👉 server.js starting...");

// ---------- express + socket.io basic setup ----------
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

// ---------- mongo setup ----------
const mongoUri =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/stock_dashboard";

console.log("👉 trying to connect to mongo at:", mongoUri);

mongoose
  .connect(mongoUri, {
    dbName: "stock_dashboard",
  })
  .then(() => {
    console.log("✅ connected to mongodb");
  })
  .catch((err) => {
    console.error("❌ mongo connection error:", err);
  });

// ---------- user schema (with password hash) ----------
const userSchema = new mongoose.Schema(
  {
    email: { type: String, unique: true, required: true },
    passwordHash: { type: String, required: true },
    subscriptions: { type: [String], default: [] },
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ---------- stocks + in-memory prices ----------
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
      if (typeof email !== "string" || !email.includes("@")) {
        socket.emit("register_error", "please enter a valid email");
        return;
      }
      if (typeof password !== "string" || password.length < 6) {
        socket.emit(
          "register_error",
          "password must be at least 6 characters"
        );
        return;
      }

      const existing = await User.findOne({ email });
      if (existing) {
        socket.emit("register_error", "user already exists, please login");
        return;
      }

      const passwordHash = await bcrypt.hash(password, 10);

      await User.create({
        email,
        passwordHash,
        subscriptions: [],
      });

      console.log("🆕 registered new user:", email);
      socket.emit("register_success", "registration successful, please login");
    } catch (err) {
      console.error("register error:", err);
      socket.emit("register_error", "server error during registration");
    }
  });

  // ----- login -----
  socket.on("login", async ({ email, password }) => {
    try {
      if (typeof email !== "string" || !email.includes("@")) {
        socket.emit("login_error", "please enter a valid email");
        return;
      }
      if (typeof password !== "string" || password.length === 0) {
        socket.emit("login_error", "please enter your password");
        return;
      }

      const user = await User.findOne({ email });
      if (!user) {
        socket.emit("login_error", "user not found, please register");
        return;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        socket.emit("login_error", "incorrect password");
        return;
      }

      clients[socket.id].email = email;
      console.log("✅ login successful:", email);

      // tell frontend login worked + supported stocks
      socket.emit("login_success", {
        email,
        supportedStocks: SUPPORTED_STOCKS,
      });

      // also send current subscriptions from db
      socket.emit("subscribed", user.subscriptions);
    } catch (err) {
      console.error("login error:", err);
      socket.emit("login_error", "server error during login");
    }
  });

  // ----- subscribe -----
  socket.on("subscribe", async (symbol) => {
    try {
      if (!SUPPORTED_STOCKS.includes(symbol)) return;

      const client = clients[socket.id];
      if (!client || !client.email) return;

      const email = client.email;

      const user = await User.findOneAndUpdate(
        { email },
        { $addToSet: { subscriptions: symbol } },
        { new: true }
      );

      if (!user) return;

      socket.emit("subscribed", user.subscriptions);
    } catch (err) {
      console.error("subscribe error:", err);
    }
  });

  // ----- unsubscribe -----
  socket.on("unsubscribe", async (symbol) => {
    try {
      const client = clients[socket.id];
      if (!client || !client.email) return;

      const email = client.email;

      const user = await User.findOneAndUpdate(
        { email },
        { $pull: { subscriptions: symbol } },
        { new: true }
      );

      if (!user) return;

      socket.emit("subscribed", user.subscriptions);
    } catch (err) {
      console.error("unsubscribe error:", err);
    }
  });

  // ----- initial prices -----
  socket.on("request_initial_prices", () => {
    socket.emit("initial_prices", stockPrices);
  });

  socket.on("disconnect", () => {
    console.log("🔌 client disconnected:", socket.id);
    delete clients[socket.id];
  });
});

// ---------- price update loop ----------
setInterval(() => {
  const now = new Date().toISOString();

  SUPPORTED_STOCKS.forEach((sym) => {
    const oldPrice = stockPrices[sym];
    const delta = (Math.random() - 0.5) * 2;
    let newPrice = oldPrice + delta;
    if (newPrice < 1) newPrice = 1;

    stockPrices[sym] = newPrice;

    io.emit("price_update", {
      symbol: sym,
      price: newPrice,
      time: now,
    });
  });
}, 1000);

// ---------- start http server ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 server running on http://localhost:${PORT}`);
});
