const express = require("express");
const cors = require("cors");

const app = express();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Middlewares básicos
app.use(cors());
app.use(express.json());

// ?? Health check (CLAVE)
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Horus",
    timestamp: Date.now()
  });
});

// Puerto (Render lo inyecta)
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`?? Horus backend online en puerto ${PORT}`);
});


