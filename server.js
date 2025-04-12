require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Test route to check if the server is running
app.get("/ping", (req, res) => {
  res.status(200).json({ message: "pong" });
});

// Register route
const users = {};
const ip_register = {};
app.post("/register", (req, res) => {
  const client_ip = req.ip || req.connection.remoteAddress;
  if (
    ip_register[client_ip] &&
    users[ip_register[client_ip]]?.requestsNumber > 0
  ) {
    return res.status(403).json({
      error: "Déjà enregistré",
      message:
        "Vous ne pouvez pas vous réenregistrer tant que vous avez des requêtes restantes.",
    });
  }
  const token = uuidv4();
  users[token] = {
    userId: uuidv4(),
    token,
    requestsNumber: 10,
    last_recharge: new Date(),
    ip: client_ip,
  };
  ip_register[client_ip] = token;

  res.status(201).json({
    token,
    requestsNumber: 10,
    message: "Enregistrement réussi. Vous avez 10 requêtes.",
  });
});

// Authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.split(" ")[1];

  if (!token || !users[token]) {
    return res.status(401).json({ error: "Token invalide ou manquant" });
  }

  req.user = users[token];
  next();
};

// Rate limiting middleware
const rateLimiter = (req, res, next) => {
  try {
    const user = req.user;
    if (user.requestsNumber <= 0) {
      return res.status(429).json({
        error: "Too many requests",
        message: "Your request max number has been exhausted.",
        requestsNumber: 0,
      });
    }
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      user.requestsNumber--;
      console.log(
        `[RequestsNumber] User ${user.userId} - Remaining: ${user.requestsNumber}`
      );
      return originalJson({
        ...data,
        requestsNumberRemaining: user.requestsNumber,
      });
    };

    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
};

// Limit by IP address
const theLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: {
    error: "Too many attempts",
    message: "Please register again to get a new token",
  },
  skip: (req) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    return token && users[token]?.requestsNumber > 0;
  },
});

// Recharge route
app.post("/recharge", authenticate, (req, res) => {
  const user = req.user;
  let rechargeAmount = parseInt(req.body?.amount) || 10;
  rechargeAmount = Math.max(0, rechargeAmount);
  user.requestsNumber += rechargeAmount;
  user.last_recharge = new Date();
  res.status(200).json({
    message: `Rechargé de ${rechargeAmount} requêtes.`,
    newRequestsNumber: user.requestsNumber,
  });
});

app.use(["/items", "/recharge"], theLimiter);

// CRUD items
let items = [
  { id: 1, name: "Item 1", description: "Description de l'item 1" },
  { id: 2, name: "Item 2", description: "Description de l'item 2" },
];

// GET /items
app.get("/items", authenticate, rateLimiter, (req, res) => {
  res.status(200).json(items);
});

// POST /items
app.post("/items", authenticate, rateLimiter, (req, res) => {
  const newItem = { id: items.length + 1, ...req.body };
  items.push(newItem);
  res.status(201).json(newItem);
});

// DELETE /items/:id
app.delete("/items/:id", authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Item non trouvé" });
  }
  const deletedItem = items.splice(index, 1);
  res.status(200).json({
    message: "Item supprimé avec succès.",
    item: deletedItem[0],
  });
});

// PUT /items/:id
app.put("/items/:id", authenticate, (req, res) => {
  const id = parseInt(req.params.id);
  const { name, description } = req.body;
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Item non trouvé" });
  }
  if (!name && !description) {
    return res.status(400).json({ error: "Le nom ou la description est requis pour la modification." });
  }
  items[index] = { ...items[index], ...(name && { name }), ...(description && { description }) };
  res.status(200).json({
    message: "Item modifié avec succès.",
    item: items[index],
  });
});

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
