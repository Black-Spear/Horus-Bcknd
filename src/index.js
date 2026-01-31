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

// POST /user/set-status
app.post("/user/set-status", async (req, res) => {
  const { username, status } = req.body;

  try {
    await pool.query(
      "UPDATE users SET status = $1 WHERE username = $2",
      [status, username]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("SET STATUS ERROR:", err);
    res.status(500).json({ ok: false });
  }
});

// POST /competitive/reset-all
app.post("/competitive/reset-all", async (req, res) => {
  try {
    await pool.query(`
      UPDATE users
      SET rank = '{
        "index":0,
        "points":0,
        "totalpoints":0,
        "wins":0,
        "losses":0
      }'::jsonb
    `);

    res.json({ success: true });

  } catch (err) {
    console.error("RESET RANK ERROR:", err);
    res.status(500).json({ success: false });
  }
});

const RANKS = [
  { key: "Saiyan Warrior", color: "#a76d00ff", threshold: 80, badge: "assets/icons/Badges/Low_0.png" },
  { key: "Elite Saiyan Warrior", color: "#b1b1b1ff", threshold: 80, badge: "assets/icons/Badges/Low_1.png" },
  { key: "Conquistador", color: "#00dbf8ff", threshold: 80, badge: "assets/icons/Badges/Mid_0.png" },
  { key: "Catastrofe", color: "#00ff40ff", threshold: 80, badge: "assets/icons/Badges/Mid_1.png" },
  { key: "Gran Maestro", color: "#9b59b6", threshold: 80, badge: "assets/icons/Badges/Mid_2.png" },
  { key: "Señor de la Guerra I", color: "#e04242", threshold: 120, badge: "assets/icons/Badges/Superior_0.png" },
  { key: "Señor de la Guerra II", color: "#ff3333", threshold: 200, badge: "assets/icons/Badges/Superior_1.png" },
  { key: "Legenda", color: "#ffd700", threshold: 300, badge: "assets/icons/Badges/Superior_2.png" },
  { key: "Dios de la Guerra", color: "#ffffff", threshold: 1000, badge: "assets/icons/Badges/Superior_God.png" }
];

async function calculateGlobalRanking() {
  const res = await pool.query(`
    SELECT
      username,
      avatar,
      country,
      rank,
      hours_played AS "hoursPlayed"
    FROM users
    WHERE rank IS NOT NULL
  `);

  const users = res.rows;

  users.sort((a, b) => {
    const ra = a.rank?.index ?? 0;
    const rb = b.rank?.index ?? 0;
    if (ra !== rb) return rb - ra;

    const ta = a.rank?.totalpoints ?? 0;
    const tb = b.rank?.totalpoints ?? 0;
    if (ta !== tb) return tb - ta;

    return (b.rank?.wins ?? 0) - (a.rank?.wins ?? 0);
  });

  return users.map((u, i) => ({
    name: u.username,
    rankIndex: u.rank?.index ?? 0,
    points: u.rank?.points ?? 0,
    totalpoint: u.rank?.totalpoints ?? 0,
    flag: u.country === "default" ? null : u.country,
    rankIcon: RANKS[u.rank?.index ?? 0]?.badge,
    hoursPlayed: u.hoursPlayed ?? 0,
    position: i + 1
  }));
}

app.get("/ranking/global", async (req, res) => {
  try {
    const ranking = await calculateGlobalRanking();
    res.json(ranking);
  } catch (err) {
    console.error("GLOBAL RANK ERROR:", err);
    res.status(500).json([]);
  }
});

// ===============================
//   Friends SYSTEM
// ===============================

app.post("/friends/get", async (req, res) => {
  const { username } = req.body;

  try {
    if (!username) {
      return res.json({ ok: false, error: "NOT_LOGGED" });
    }

    const userRes = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );

    if (userRes.rowCount === 0) {
      return res.json({
        ok: true,
        data: { friends: [], incoming: [], outgoing: [] }
      });
    }

    const userId = userRes.rows[0].id;

    const friendsRes = await pool.query(`
      SELECT u.username
      FROM friends f
      JOIN users u ON u.id =
        CASE WHEN f.user_id = $1 THEN f.friend_id ELSE f.user_id END
      WHERE (f.user_id = $1 OR f.friend_id = $1)
        AND f.status = 'accepted'
    `, [userId]);

    const incomingRes = await pool.query(`
      SELECT u.username
      FROM friends f
      JOIN users u ON u.id = f.user_id
      WHERE f.friend_id = $1 AND f.status = 'pending'
    `, [userId]);

    const outgoingRes = await pool.query(`
      SELECT u.username
      FROM friends f
      JOIN users u ON u.id = f.friend_id
      WHERE f.user_id = $1 AND f.status = 'pending'
    `, [userId]);

    res.json({
      ok: true,
      data: {
        friends: friendsRes.rows.map(r => r.username),
        incoming: incomingRes.rows.map(r => r.username),
        outgoing: outgoingRes.rows.map(r => r.username)
      }
    });

  } catch (err) {
    console.error("friends:get:", err);
    res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/friends/send", async (req, res) => {
  const { username, toUser } = req.body;

  try {
    if (!username) return res.json({ ok: false, code: "NOT_LOGGED" });
    if (username === toUser) return res.json({ ok: false, code: "ADD_SELF" });

    const meRes = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    const otherRes = await pool.query(
      "SELECT id FROM users WHERE username = $1",
      [toUser]
    );

    if (meRes.rowCount === 0) return res.json({ ok: false, code: "NOT_LOGGED" });
    if (otherRes.rowCount === 0) return res.json({ ok: false, code: "USER_NOT_FOUND" });

    const meId = meRes.rows[0].id;
    const otherId = otherRes.rows[0].id;

    const alreadyFriend = await pool.query(`
      SELECT 1 FROM friends
      WHERE status = 'accepted'
        AND (
          (user_id = $1 AND friend_id = $2) OR
          (user_id = $2 AND friend_id = $1)
        )
    `, [meId, otherId]);

    if (alreadyFriend.rowCount > 0) {
      return res.json({ ok: false, code: "ALREADY_FRIEND" });
    }

    const alreadySent = await pool.query(`
      SELECT 1 FROM friends
      WHERE user_id = $1 AND friend_id = $2 AND status = 'pending'
    `, [meId, otherId]);

    if (alreadySent.rowCount > 0) {
      return res.json({ ok: false, code: "REQUEST_ALREADY_SENT" });
    }

    const inverse = await pool.query(`
      SELECT 1 FROM friends
      WHERE user_id = $2 AND friend_id = $1 AND status = 'pending'
    `, [meId, otherId]);

    if (inverse.rowCount > 0) {
      await pool.query(`
        UPDATE friends
        SET status = 'accepted'
        WHERE user_id = $2 AND friend_id = $1
      `, [meId, otherId]);

      return res.json({ ok: true, autoAccepted: true });
    }

    await pool.query(`
      INSERT INTO friends (user_id, friend_id, status)
      VALUES ($1, $2, 'pending')
    `, [meId, otherId]);

    res.json({ ok: true });

  } catch (err) {
    console.error("friends:send:", err);
    res.status(500).json({ ok: false, code: "INTERNAL_ERROR" });
  }
});

app.post("/friends/accept", async (req, res) => {
  const { username, fromUser } = req.body;

  try {
    const meRes = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    const otherRes = await pool.query("SELECT id FROM users WHERE username = $1", [fromUser]);

    if (meRes.rowCount === 0 || otherRes.rowCount === 0) {
      return res.json({ ok: false, error: "USER_NOT_FOUND" });
    }

    await pool.query(`
      UPDATE friends
      SET status = 'accepted'
      WHERE user_id = $2 AND friend_id = $1
    `, [meRes.rows[0].id, otherRes.rows[0].id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("friends:accept:", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/friends/reject", async (req, res) => {
  const { username, fromUser } = req.body;

  try {
    const me = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    const other = await pool.query("SELECT id FROM users WHERE username = $1", [fromUser]);

    await pool.query(`
      DELETE FROM friends
      WHERE user_id = $2 AND friend_id = $1 AND status = 'pending'
    `, [me.rows[0].id, other.rows[0].id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("friends:reject:", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/friends/remove", async (req, res) => {
  const { username, friend } = req.body;

  try {
    const me = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    const other = await pool.query("SELECT id FROM users WHERE username = $1", [friend]);

    await pool.query(`
      DELETE FROM friends
      WHERE status = 'accepted'
        AND (
          (user_id = $1 AND friend_id = $2) OR
          (user_id = $2 AND friend_id = $1)
        )
    `, [me.rows[0].id, other.rows[0].id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("friends:remove:", err);
    res.status(500).json({ ok: false });
  }
});

