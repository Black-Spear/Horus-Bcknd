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

app.get("/user-exists/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const r = await pool.query(
      "SELECT 1 FROM users WHERE username = $1",
      [username]
    );

    res.json({ exists: r.rowCount > 0 });

  } catch (err) {
    console.error("USER EXISTS ERROR:", err);
    res.status(500).json({ exists: false });
  }
});

app.get("/user/:username", async (req, res) => {
  const { username } = req.params;

  try {
    const r = await pool.query(`
      SELECT
        username,
        xp,
        level,
        hours_played     AS "hoursPlayed",
        achievements,
        titles,
        avatar,
        status,
        is_admin         AS "isAdmin",
        admin_level      AS "AdminLevel",
        country,
        rank,
        joined,
        current_title    AS "currentTitle",
        last_save        AS "lastSave",
        chat_style       AS "chatStyle",
        show_rank        AS "showRank"
      FROM users
      WHERE username = $1
    `, [username]);

    if (r.rowCount === 0) {
      return res.json(null);
    }

    res.json(r.rows[0]);

  } catch (err) {
    console.error("GET USER DATA ERROR:", err);
    res.status(500).json(null);
  }
});

app.post("/user/save", async (req, res) => {
  const { username, data } = req.body;

  const SAVE_FIELD_MAP = {
    xp: "xp",
    level: "level",
    hoursPlayed: "hours_played",
    achievements: "achievements",
    titles: "titles",
    avatar: "avatar",
    status: "status",
    chatStyle: "chat_style",
    isAdmin: "is_admin",
    AdminLevel: "admin_level",
    country: "country",
    rank: "rank",
    currentTitle: "current_title",
    showRank: "show_rank"
  };

  const JSON_FIELDS = ["achievements", "titles", "rank"];

  try {
    const entries = Object.entries(data)
      .filter(([k]) => SAVE_FIELD_MAP[k]);

    if (entries.length === 0)
      return res.json({ success: true });

    const sets = [];
    const values = [];

    entries.forEach(([key, val], i) => {
      const col = SAVE_FIELD_MAP[key];
      values.push(JSON_FIELDS.includes(key) ? JSON.stringify(val) : val);
      sets.push(`${col} = $${i + 2}`);
    });

    await pool.query(
      `UPDATE users SET ${sets.join(", ")}, last_save = NOW() WHERE username = $1`,
      [username, ...values]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("SAVE USER ERROR:", err);
    res.status(500).json({ success: false });
  }
});

app.post("/user/update-field", async (req, res) => {
  const { username, field, value } = req.body;

  const FIELD_MAP = {
    showRank: "show_rank",
    status: "status",
    chatStyle: "chat_style",
    avatar: "avatar",
    country: "country"
  };

  const column = FIELD_MAP[field];
  if (!column)
    return res.json({ ok: false });

  try {
    await pool.query(
      `UPDATE users SET ${column} = $1 WHERE username = $2`,
      [value, username]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("UPDATE FIELD ERROR:", err);
    res.status(500).json({ ok: false });
  }
});


