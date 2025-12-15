const socket = io();

// elements
const loginCard = document.getElementById("login-card");
const dashboardCard = document.getElementById("dashboard-card");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

const authTitle = document.getElementById("auth-title");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const switchAuthBtn = document.getElementById("switch-auth-btn");
const switchLabel = document.getElementById("switch-label");

const stocksListEl = document.getElementById("stocks-list");
const subsTableBody = document.getElementById("subscriptions-table-body");

// auth mode: "login" or "register"
let authMode = "login";

// local state
let supportedStocks = [];
let subscriptions = new Set();
let lastPrices = {}; // symbol -> { price, time, direction }

// ---------- helper functions ----------
function formatPrice(p) {
  return p.toFixed(2);
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function renderAvailableStocks() {
  stocksListEl.innerHTML = "";

  supportedStocks.forEach((sym) => {
    const wrapper = document.createElement("div");
    wrapper.className = "stock-item";

    const left = document.createElement("div");
    const symbolSpan = document.createElement("div");
    symbolSpan.className = "stock-symbol";
    symbolSpan.textContent = sym;

    const tagline = document.createElement("div");
    tagline.className = "stock-tagline";
    tagline.textContent = "click subscribe to track live price";

    left.appendChild(symbolSpan);
    left.appendChild(tagline);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = subscriptions.has(sym) ? "subscribed" : "subscribe";

    btn.addEventListener("click", () => {
      if (subscriptions.has(sym)) {
        socket.emit("unsubscribe", sym);
      } else {
        socket.emit("subscribe", sym);
      }
    });

    wrapper.appendChild(left);
    wrapper.appendChild(btn);

    stocksListEl.appendChild(wrapper);
  });
}

function renderSubscriptionsTable() {
  subsTableBody.innerHTML = "";

  const sorted = Array.from(subscriptions).sort();

  if (sorted.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "you have not subscribed to any stocks yet.";
    cell.style.color = "#9ca3af";
    row.appendChild(cell);
    subsTableBody.appendChild(row);
    return;
  }

  sorted.forEach((sym) => {
    const info = lastPrices[sym] || {};
    const row = document.createElement("tr");

    const symTd = document.createElement("td");
    symTd.textContent = sym;
    row.appendChild(symTd);

    const priceTd = document.createElement("td");
    priceTd.className = "price-cell";

    // remove old direction classes
    priceTd.classList.remove("price-up", "price-down");

    if (info.price !== undefined) {
      priceTd.textContent = formatPrice(info.price);

      if (info.direction === "up") {
        priceTd.classList.add("price-up");
      } else if (info.direction === "down") {
        priceTd.classList.add("price-down");
      }
    } else {
      priceTd.textContent = "--";
    }

    row.appendChild(priceTd);

    const timeTd = document.createElement("td");
    timeTd.textContent = info.time ? formatTime(info.time) : "--";
    row.appendChild(timeTd);

    const actionTd = document.createElement("td");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "unsubscribe";
    btn.className = "secondary-btn";

    btn.addEventListener("click", () => {
      socket.emit("unsubscribe", sym);
    });

    actionTd.appendChild(btn);
    row.appendChild(actionTd);

    subsTableBody.appendChild(row);
  });
}

// ---------- auth mode toggle ----------
function setAuthMode(mode) {
  authMode = mode;
  loginError.textContent = "";

  if (authMode === "login") {
    authTitle.textContent = "login";
    authSubmitBtn.textContent = "login";
    switchLabel.textContent = "don't have an account?";
    switchAuthBtn.textContent = "register";
  } else {
    authTitle.textContent = "register";
    authSubmitBtn.textContent = "register";
    switchLabel.textContent = "already have an account?";
    switchAuthBtn.textContent = "login";
  }
}

switchAuthBtn.addEventListener("click", () => {
  setAuthMode(authMode === "login" ? "register" : "login");
});

// ---------- form submit ----------
loginForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  loginError.textContent = "";

  if (authMode === "login") {
    socket.emit("login", { email, password });
  } else {
    socket.emit("register", { email, password });
  }
});

// logout simply reloads page
logoutBtn.addEventListener("click", () => {
  window.location.reload();
});

// ---------- socket events ----------

// register responses
socket.on("register_error", (msg) => {
  loginError.textContent = msg || "registration failed";
});

socket.on("register_success", (msg) => {
  loginError.style.color = "#4ade80";
  loginError.textContent = msg || "registration successful, please login";

  // switch to login mode but keep email
  setAuthMode("login");
  passwordInput.value = "";
  setTimeout(() => {
    loginError.style.color = "#f97373";
    loginError.textContent = "";
  }, 3000);
});

// login responses
socket.on("login_error", (msg) => {
  loginError.style.color = "#f97373";
  loginError.textContent = msg || "login failed";
});

socket.on("login_success", (payload) => {
  const { email, supportedStocks: stocks } = payload;
  supportedStocks = stocks || [];
  subscriptions = new Set();
  lastPrices = {};

  userEmailEl.textContent = email;

  // switch to dashboard
  loginCard.classList.add("hidden");
  dashboardCard.classList.remove("hidden");

  renderAvailableStocks();
  renderSubscriptionsTable();

  // get initial prices
  socket.emit("request_initial_prices");
});

// subscribed list from server
socket.on("subscribed", (subList) => {
  subscriptions = new Set(subList || []);
  renderAvailableStocks();
  renderSubscriptionsTable();
});

// initial prices snapshot
socket.on("initial_prices", (priceMap) => {
  Object.keys(priceMap || {}).forEach((sym) => {
    lastPrices[sym] = {
      price: priceMap[sym],
      time: null,
      direction: null,
    };
  });
  renderSubscriptionsTable();
});

// live price updates
socket.on("price_update", ({ symbol, price, time }) => {
  const previous = lastPrices[symbol];

  let direction = null;
  if (previous && typeof previous.price === "number") {
    if (price > previous.price) direction = "up";
    else if (price < previous.price) direction = "down";
  }

  lastPrices[symbol] = { price, time, direction };

  if (subscriptions.has(symbol)) {
    renderSubscriptionsTable();
  }
});

// initial mode
setAuthMode("login");
