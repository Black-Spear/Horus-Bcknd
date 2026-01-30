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


const crypto = require("crypto");

function hashPassword(pwd) {
  return crypto.createHash("sha256").update(pwd).digest("hex");
}

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query(
      "SELECT password FROM users WHERE username = $1",
      [username]
    );

    if (result.rowCount === 0) {
      return res.json({ success: false, error: "USER_Not_found" });
    }

    const hashed = hashPassword(password);

    if (result.rows[0].password !== hashed) {
      return res.json({ success: false, error: "PSSW_ERROR" });
    }

    res.json({ success: true, user: username });

  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});


app.post("/register", async (req, res) => {
  const { username, password, email } = req.body;

  try {
    const exists = await pool.query(
      "SELECT 1 FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );

    if (exists.rowCount > 0) {
      return res.json({ success: false, error: "USER_Already_Exists" });
    }

    await pool.query(`
      INSERT INTO users (
        username, password, email,
        xp, level, hours_played,
        achievements, titles, avatar,
        status, chat_style, is_admin,
        admin_level, country, rank, show_rank
      ) VALUES (
        $1, $2, $3,
        0, 1, 0,
        '[]'::jsonb,
        '[]'::jsonb,
        'default',
        'online',
        'rounded',
        false,
        0,
        'default',
        '{"index":0,"points":0,"totalpoints":0,"wins":0,"losses":0}'::jsonb,
        true
      )
    `, [username, hashPassword(password), email]);

    res.json({ success: true, user: username });

  } catch (err) {
    console.error("REGISTER ERROR:", err);
    res.status(500).json({ success: false, error: "SERVER_ERROR" });
  }
});

