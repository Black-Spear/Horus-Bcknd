const express = require("express");
const cors = require("cors");

const app = express();

const DUEL_EXPIRE_TIME = 1000 * 60 * 60; // 1 hora

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

// ===============================
//   Tournament SYSTEM
// ===============================

app.get("/users/get", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        username,
        avatar,
        status,
        country,
        level,
        xp,
        rank,
        is_admin AS "isAdmin"
      FROM users
      ORDER BY username ASC
    `);

    res.json(result.rows);

  } catch (err) {
    console.error("users:get:", err);
    res.status(500).json([]);
  }
});

app.get("/tournament/get", async (req, res) => {
  try {
    const activeRes = await pool.query(`
      SELECT *
      FROM tournaments
      WHERE status = 'active'
      LIMIT 1
    `);

    const pastRes = await pool.query(`
      SELECT *
      FROM tournaments
      WHERE status = 'finished'
      ORDER BY finished_at ASC
    `);

    res.json({
      activeTournament: activeRes.rows[0] || null,
      pastTournaments: pastRes.rows.map(t => ({
        ...t,
        finishedAt: t.finished_at,
        winnerAvatar: t.winner_avatar,
        trophy: t.trophy || "Trophy_0"
      }))
    });

  } catch (err) {
    console.error("tournament:get:", err);
    res.status(500).json({
      activeTournament: null,
      pastTournaments: []
    });
  }
});

app.post("/tournament/create", async (req, res) => {
  const {
    name,
    size,
    players,
    rewards,
    bracket,
    trophy
  } = req.body;

  try {
    const exists = await pool.query(`
      SELECT 1 FROM tournaments WHERE status = 'active'
    `);

    if (exists.rowCount > 0) {
      return res.json({ error: "already_active" });
    }

    const result = await pool.query(`
      INSERT INTO tournaments
        (name, size, players, rewards, bracket, trophy, status)
      VALUES
        ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, 'active')
      RETURNING *
    `, [
      name,
      size,
      JSON.stringify(players),
      JSON.stringify(rewards),
      JSON.stringify(bracket),
      trophy || "Trophy_0"
    ]);

    res.json({ ok: true, tournament: result.rows[0] });

  } catch (err) {
    console.error("tournament:create:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

app.post("/tournament/update", async (req, res) => {
  const { id, bracket, winner } = req.body;

  try {
    await pool.query(`
      UPDATE tournaments
      SET
        bracket = $1::jsonb,
        winner = $2
      WHERE id = $3 AND status = 'active'
    `, [
      JSON.stringify(bracket),
      winner,
      id
    ]);

    res.json({ ok: true });

  } catch (err) {
    console.error("tournament:update:", err);
    res.status(500).json({ ok: false });
  }
});

app.post("/tournament/finish", async (req, res) => {
  try {
    const activeRes = await pool.query(`
      SELECT *
      FROM tournaments
      WHERE status = 'active'
      LIMIT 1
    `);

    if (activeRes.rowCount === 0) {
      return res.json({ error: "no_active" });
    }

    const t = activeRes.rows[0];

    let winnerAvatar = "default";

    if (t.winner) {
      const u = await pool.query(
        "SELECT avatar FROM users WHERE username = $1",
        [t.winner]
      );
      if (u.rowCount > 0 && u.rows[0].avatar) {
        winnerAvatar = u.rows[0].avatar;
      }
    }

    await pool.query(`
      UPDATE tournaments
      SET
        status = 'finished',
        winner_avatar = $1,
        finished_at = NOW()
      WHERE id = $2
    `, [winnerAvatar, t.id]);

    res.json({ ok: true });

  } catch (err) {
    console.error("tournament:finish:", err);
    res.status(500).json({ ok: false });
  }
});

// ===============================
//   Duel SYSTEM
// ===============================

async function getUserId(username) {
  const res = await pool.query(
    "SELECT id FROM users WHERE username = $1",
    [username]
  );
  return res.rowCount ? res.rows[0].id : null;
}

async function expireOldDuels() {
  const now = Date.now();
  await pool.query(`
    UPDATE duels
    SET status = 'expired'
    WHERE status IN ('pending','accepted')
      AND expires_at < $1
  `, [now]);
}

app.post("/duel/send", async (req, res) => {
  try {
    const { username, toUsername } = req.body;

    if (!username) {
      return res.json({ ok: false, error: "NOT_LOGGED" });
    }

    if (username === toUsername) {
      return res.json({ ok: false, error: "INVALID_DUEL" });
    }

    await expireOldDuels();

    const fromId = await getUserId(username);
    const toId   = await getUserId(toUsername);

    if (!fromId) {
      return res.json({ ok: false, error: "NOT_LOGGED" });
    }

    if (!toId) {
      return res.json({ ok: false, error: "USER_NOT_FOUND" });
    }

    // ¿ya está en duelo?
    const active = await pool.query(`
      SELECT 1 FROM duels
      WHERE status IN ('pending','accepted')
        AND (from_user = $1 OR to_user = $1)
    `, [fromId]);

    if (active.rowCount > 0) {
      return res.json({ ok: false, error: "ALREADY_IN_DUEL" });
    }

    const now = Date.now();

    const insert = await pool.query(`
      INSERT INTO duels (from_user, to_user, status, created_at, expires_at)
      VALUES ($1, $2, 'pending', $3, $4)
      RETURNING id
    `, [fromId, toId, now, now + DUEL_EXPIRE_TIME]);

    const duel = {
      id: insert.rows[0].id,
      from: username,
      to: toUsername,
      status: "pending",
      createdAt: now,
      expiresAt: now + DUEL_EXPIRE_TIME
    };

    return res.json({ ok: true, duel });

  } catch (err) {
    console.error("POST /duel/send:", err);
    return res.json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/duel/accept", async (req, res) => {
  try {
    const { username, duelId } = req.body;

    if (!username) {
      return res.json({ ok: false, error: "NOT_LOGGED" });
    }

    await expireOldDuels();

    const q = await pool.query(`
      SELECT d.*,
             uf.username AS from_name,
             ut.username AS to_name
      FROM duels d
      JOIN users uf ON uf.id = d.from_user
      JOIN users ut ON ut.id = d.to_user
      WHERE d.id = $1 AND d.status = 'pending'
    `, [duelId]);

    if (q.rowCount === 0) {
      return res.json({ ok: false, error: "DUEL_NOT_FOUND" });
    }

    await pool.query(
      "UPDATE duels SET status = 'accepted' WHERE id = $1",
      [duelId]
    );

    const d = q.rows[0];

    return res.json({
      ok: true,
      duel: {
        id: d.id,
        from: d.from_name,
        to: d.to_name,
        status: "accepted",
        createdAt: Number(d.created_at),
        expiresAt: Number(d.expires_at)
      }
    });

  } catch (err) {
    console.error("POST /duel/accept:", err);
    return res.json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/duel/reject", async (req, res) => {
  try {
    const { username, duelId } = req.body;

    if (!username) {
      return res.json({ ok: false, error: "NOT_LOGGED" });
    }

    await pool.query(`
      UPDATE duels
      SET status = 'expired'
      WHERE id = $1 AND status = 'pending'
    `, [duelId]);

    return res.json({ ok: true });

  } catch (err) {
    console.error("POST /duel/reject:", err);
    return res.json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

app.post("/duel/expire", async (req, res) => {
  try {
    const { duelId } = req.body;

    await pool.query(`
      UPDATE duels
      SET status = 'expired'
      WHERE id = $1
    `, [duelId]);

    return res.json({ ok: true });

  } catch (err) {
    console.error("POST /duel/expire:", err);
    return res.json({ ok: false });
  }
});

app.get("/duel/current/:username", async (req, res) => {
  try {
    const { username } = req.params;
    if (!username) return res.json(null);

    await expireOldDuels();

    const userId = await getUserId(username);
    if (!userId) return res.json(null);

    const q = await pool.query(`
      SELECT d.*,
             uf.username AS from_name,
             ut.username AS to_name
      FROM duels d
      JOIN users uf ON uf.id = d.from_user
      JOIN users ut ON ut.id = d.to_user
      WHERE (d.from_user = $1 OR d.to_user = $1)
        AND d.status IN ('pending','accepted')
      ORDER BY d.created_at DESC
      LIMIT 1
    `, [userId]);

    if (!q.rowCount) return res.json(null);

    const d = q.rows[0];

    return res.json({
      id: d.id,
      from: d.from_name,
      to: d.to_name,
      status: d.status,
      createdAt: Number(d.created_at),
      expiresAt: Number(d.expires_at)
    });

  } catch (err) {
    console.error("GET /duel/current:", err);
    return res.json(null);
  }
});

app.post("/duel/report", async (req, res) => {
  try {
    const { duelId, player, result } = req.body;
    if (!duelId || !player || !["win", "loss"].includes(result)) {
      return res.json({ ok: false });
    }

    const q = await pool.query(`
      SELECT d.*,
             uf.id AS from_id, uf.username AS from_name,
             ut.id AS to_id,   ut.username AS to_name
      FROM duels d
      JOIN users uf ON uf.id = d.from_user
      JOIN users ut ON ut.id = d.to_user
      WHERE d.id = $1 AND d.status = 'accepted'
    `, [duelId]);

    if (!q.rowCount) return res.json({ ok: false });

    const duel = q.rows[0];

    let userId = null;
    if (player === duel.from_name) userId = duel.from_id;
    if (player === duel.to_name)   userId = duel.to_id;
    if (!userId) return res.json({ ok: false });

    await pool.query(`
      INSERT INTO duel_reports (duel_id, user_id, result, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (duel_id, user_id) DO NOTHING
    `, [duelId, userId, result, Date.now()]);

    return res.json({ ok: true });

  } catch (err) {
    console.error("POST /duel/report:", err);
    return res.json({ ok: false });
  }
});

app.get("/duel/check/:duelId", async (req, res) => {
  try {
    const { duelId } = req.params;

    const q = await pool.query(`
      SELECT dr.result, u.username
      FROM duel_reports dr
      JOIN users u ON u.id = dr.user_id
      WHERE dr.duel_id = $1
    `, [duelId]);

    if (q.rowCount < 2) {
      return res.json({ finished: false });
    }

    const reports = q.rows;
    const wins  = reports.filter(r => r.result === "win");
    const loses = reports.filter(r => r.result === "loss");

    if (wins.length !== 1 || loses.length !== 1) {
      await pool.query(
        "UPDATE duels SET status = 'invalid' WHERE id = $1",
        [duelId]
      );

      return res.json({ finished: true, invalid: true });
    }

    const winner = wins[0].username;
    const loser  = loses[0].username;

    await pool.query(`
      UPDATE duels
      SET status = 'finished',
          winner = (SELECT id FROM users WHERE username = $1),
          loser  = (SELECT id FROM users WHERE username = $2)
      WHERE id = $3
    `, [winner, loser, duelId]);

    return res.json({
      finished: true,
      winner,
      loser
    });

  } catch (err) {
    console.error("GET /duel/check:", err);
    return res.json({ finished: false });
  }
});


