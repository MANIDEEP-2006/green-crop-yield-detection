/* ============================================================
   GreenCrop 2.0 — Product Server
   Express + PostgreSQL + JWT auth + yield prediction API
   Author: Bonugu Sai Kiran Manideep
   ============================================================ */
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "manideep1716@gmail.com").toLowerCase();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("localhost")
    ? false : { rejectUnauthorized: false },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gc_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gc_predictions (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES gc_users(id) ON DELETE CASCADE,
      crop TEXT NOT NULL,
      region TEXT NOT NULL,
      soil TEXT NOT NULL,
      area_ha REAL NOT NULL,
      rainfall_mm REAL NOT NULL,
      temperature_c REAL NOT NULL,
      fertilizer_kg REAL NOT NULL,
      irrigated BOOLEAN NOT NULL,
      yield_t_ha REAL NOT NULL,
      total_t REAL NOT NULL,
      grade TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS gc_scans (
      id SERIAL PRIMARY KEY,
      user_id INT REFERENCES gc_users(id) ON DELETE CASCADE,
      crop TEXT,
      health_pct INT NOT NULL,
      verdict TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`UPDATE gc_users SET role='admin' WHERE email=$1`, [ADMIN_EMAIL]);
  console.log("✅ GreenCrop database ready");
}

app.use(express.json({ limit: "300kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

const cookieOpts = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 3600 * 1000 };
const sign = u => jwt.sign({ id: u.id, email: u.email, name: u.name, role: u.role }, JWT_SECRET, { expiresIn: "7d" });
function auth(req, res, next) {
  const t = req.cookies.gc_token;
  if (!t) return res.status(401).json({ error: "Not logged in" });
  try { req.user = jwt.verify(t, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: "Session expired" }); }
}

/* ---------- auth ---------- */
app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body || {};
    name = (name || "").trim(); email = (email || "").trim().toLowerCase();
    if (name.length < 3) return res.status(400).json({ error: "Enter your full name" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email" });
    if (!password || password.length < 6) return res.status(400).json({ error: "Password min 6 characters" });
    const hash = await bcrypt.hash(password, 10);
    const role = email === ADMIN_EMAIL ? "admin" : "user";
    const r = await pool.query(
      `INSERT INTO gc_users(name,email,pass_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role`,
      [name, email, hash, role]);
    res.cookie("gc_token", sign(r.rows[0]), cookieOpts);
    res.json({ ok: true, user: r.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(400).json({ error: "Account exists — please login" });
    console.error(e); res.status(500).json({ error: "Server error" });
  }
});
app.post("/api/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();
    const r = await pool.query(`SELECT * FROM gc_users WHERE email=$1`, [email]);
    const u = r.rows[0];
    if (!u || !(await bcrypt.compare(req.body.password || "", u.pass_hash)))
      return res.status(401).json({ error: "Invalid email or password" });
    res.cookie("gc_token", sign(u), cookieOpts);
    res.json({ ok: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.post("/api/logout", (req, res) => { res.clearCookie("gc_token"); res.json({ ok: true }); });
app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));

/* ---------- yield prediction model ----------
   Regression-style model with per-crop coefficients derived from
   public agricultural yield ranges (t/ha). Deterministic & explainable. */
const CROPS = {
  RICE:      { base: 3.8, optT: 27, tSens: 0.045, optR: 1400, rSens: 0.00055, fMax: 0.9,  fHalf: 110, irr: 0.55 },
  WHEAT:     { base: 3.2, optT: 21, tSens: 0.055, optR: 650,  rSens: 0.00075, fMax: 0.85, fHalf: 100, irr: 0.50 },
  MAIZE:     { base: 5.5, optT: 25, tSens: 0.050, optR: 800,  rSens: 0.00065, fMax: 1.2,  fHalf: 130, irr: 0.60 },
  COTTON:    { base: 1.7, optT: 28, tSens: 0.040, optR: 750,  rSens: 0.00060, fMax: 0.45, fHalf: 90,  irr: 0.30 },
  SUGARCANE: { base: 70,  optT: 28, tSens: 0.030, optR: 1600, rSens: 0.00045, fMax: 14,   fHalf: 180, irr: 9.0  },
  GROUNDNUT: { base: 1.6, optT: 26, tSens: 0.045, optR: 700,  rSens: 0.00070, fMax: 0.5,  fHalf: 80,  irr: 0.35 },
};
const SOIL = { ALLUVIAL: 1.08, BLACK: 1.05, RED: 0.95, LATERITE: 0.88, SANDY: 0.82, CLAY: 0.97, LOAMY: 1.10 };
const REGION = { COASTAL: 1.04, DELTA: 1.08, PLATEAU: 0.94, PLAINS: 1.0, HILLY: 0.88, ARID: 0.82 };

function predictYield(p) {
  const c = CROPS[p.crop];
  const tempF = Math.exp(-c.tSens * Math.pow(p.temperature_c - c.optT, 2) / 10);
  const rainF = Math.exp(-c.rSens * Math.pow(p.rainfall_mm - c.optR, 2) / 1000);
  const fertF = (c.fMax * p.fertilizer_kg) / (c.fHalf + p.fertilizer_kg);
  const irrB  = p.irrigated ? c.irr : 0;
  const soilF = SOIL[p.soil] ?? 1.0;
  const regF  = REGION[p.region] ?? 1.0;
  let y = (c.base * tempF * rainF * soilF * regF) + fertF + irrB;
  y = Math.max(0.1, +y.toFixed(2));
  const pct = y / c.base;
  const grade = pct >= 1.05 ? "EXCELLENT" : pct >= 0.85 ? "GOOD" : pct >= 0.6 ? "MODERATE" : "POOR";
  return {
    yield_t_ha: y, total_t: +(y * p.area_ha).toFixed(2), grade,
    factors: {
      temperature: +tempF.toFixed(2), rainfall: +rainF.toFixed(2),
      soil: soilF, region: regF, fertilizer: +fertF.toFixed(2), irrigation: irrB,
    },
  };
}

app.post("/api/predict", auth, async (req, res) => {
  try {
    const b = req.body || {};
    const p = {
      crop: String(b.crop || "").toUpperCase(), region: String(b.region || "").toUpperCase(),
      soil: String(b.soil || "").toUpperCase(), area_ha: +b.area_ha,
      rainfall_mm: +b.rainfall_mm, temperature_c: +b.temperature_c,
      fertilizer_kg: +b.fertilizer_kg, irrigated: !!b.irrigated,
    };
    if (!CROPS[p.crop]) return res.status(400).json({ error: "Pick a crop" });
    if (!SOIL[p.soil]) return res.status(400).json({ error: "Pick a soil type" });
    if (!REGION[p.region]) return res.status(400).json({ error: "Pick a region" });
    for (const [k, lo, hi] of [["area_ha", 0.05, 10000], ["rainfall_mm", 0, 5000], ["temperature_c", -5, 55], ["fertilizer_kg", 0, 1000]])
      if (!(p[k] >= lo && p[k] <= hi)) return res.status(400).json({ error: `Invalid ${k.replace("_", " ")}` });
    const out = predictYield(p);
    await pool.query(
      `INSERT INTO gc_predictions(user_id,crop,region,soil,area_ha,rainfall_mm,temperature_c,fertilizer_kg,irrigated,yield_t_ha,total_t,grade)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [req.user.id, p.crop, p.region, p.soil, p.area_ha, p.rainfall_mm, p.temperature_c, p.fertilizer_kg, p.irrigated, out.yield_t_ha, out.total_t, out.grade]);
    res.json({ ok: true, ...out, input: p });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});

app.get("/api/predictions", auth, async (req, res) => {
  const r = await pool.query(`SELECT * FROM gc_predictions WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [req.user.id]);
  res.json({ predictions: r.rows });
});

/* ---------- leaf scan history (analysis runs client-side) ---------- */
app.post("/api/scans", auth, async (req, res) => {
  try {
    const { crop, healthPct, verdict, detail } = req.body || {};
    const hp = Math.max(0, Math.min(100, parseInt(healthPct) || 0));
    await pool.query(`INSERT INTO gc_scans(user_id,crop,health_pct,verdict,detail) VALUES($1,$2,$3,$4,$5)`,
      [req.user.id, String(crop || "").slice(0, 40), hp, String(verdict || "").slice(0, 60), String(detail || "").slice(0, 400)]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Server error" }); }
});
app.get("/api/scans", auth, async (req, res) => {
  const r = await pool.query(`SELECT * FROM gc_scans WHERE user_id=$1 ORDER BY id DESC LIMIT 30`, [req.user.id]);
  res.json({ scans: r.rows });
});

app.get("/health", (req, res) => res.json({ ok: true }));

initDb()
  .then(() => app.listen(PORT, () => console.log(`🌾 GreenCrop running on :${PORT}`)))
  .catch(e => { console.error("DB init failed:", e.message); process.exit(1); });
