// A stand-in for Supabase, just big enough for the app: the auth "who is
// this" call and PostgREST reads and writes against in-memory tables seeded
// from fixtures.mjs. Lets the browser tests (and local previews) run the
// real pages with no database, no secrets and no network.
//
//   node e2e/start-mock-supabase.mjs      # listens on 54321
//   GET /__e2e/login?next=http://localhost:3100/   signs the browser in
//   POST /__e2e/reset                     # back to the fixture data
//   GET  /__e2e/writes, /__e2e/pushes      # what the app saved and pushed

import http from "node:http";
import { buildFixtures, TEST_USER } from "./fixtures.mjs";

export const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);

// Column defaults the real tables have, for rows inserted without them.
const DEFAULTS = { manual_subscriptions: { is_active: true } };

const b64url = (s) => Buffer.from(s).toString("base64url");

export function sessionCookie(host = "localhost") {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
  const user = { id: TEST_USER.id, aud: "authenticated", role: "authenticated", email: TEST_USER.email, app_metadata: {}, user_metadata: {}, created_at: "2025-01-01T00:00:00Z" };
  const accessToken = [b64url(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64url(JSON.stringify({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", exp })), "sig"].join(".");
  const session = { access_token: accessToken, refresh_token: "e2e-refresh", token_type: "bearer", expires_in: 60 * 60 * 24 * 365, expires_at: exp, user };
  return { name: `sb-${host.split(".")[0]}-auth-token`, value: `base64-${b64url(JSON.stringify(session))}`, user };
}

// --- select parsing and embedding -----------------------------------------

function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseSelect(select) {
  return splitTopLevel(select || "*").map((part) => {
    const embed = part.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s);
    if (embed) return { kind: "embed", alias: embed[1] ?? embed[2], table: embed[2], fields: parseSelect(embed[3]) };
    const [alias, col] = part.includes(":") ? part.split(":") : [part, part];
    return { kind: "col", alias, col };
  });
}

const singular = (t) => t.replace(/s$/, "");

function project(db, table, row, fields) {
  const out = {};
  for (const f of fields) {
    if (f.kind === "col") {
      if (f.col === "*") Object.assign(out, row);
      else out[f.alias] = row[f.col] ?? null;
      continue;
    }
    const fk = `${singular(f.table)}_id`;
    if (fk in row) {
      const target = (db[f.table] ?? []).find((r) => r.id === row[fk]);
      out[f.alias] = target ? project(db, f.table, target, f.fields) : null;
    } else {
      const back = `${singular(table)}_id`;
      out[f.alias] = (db[f.table] ?? []).filter((r) => r[back] === row.id).map((r) => project(db, f.table, r, f.fields));
    }
  }
  return out;
}

// --- filters and ordering ---------------------------------------------------

function parseValue(v) {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function matches(row, key, expr) {
  let negate = false;
  if (expr.startsWith("not.")) {
    negate = true;
    expr = expr.slice(4);
  }
  const dot = expr.indexOf(".");
  const op = expr.slice(0, dot);
  const raw = expr.slice(dot + 1);
  const value = row[key];
  let result;
  switch (op) {
    case "eq": result = String(value) === raw; break;
    case "neq": result = String(value) !== raw; break;
    case "gt": result = value > raw || Number(value) > Number(raw); break;
    case "gte": result = value >= raw || Number(value) >= Number(raw); break;
    case "lt": result = value < raw || Number(value) < Number(raw); break;
    case "lte": result = value <= raw || Number(value) <= Number(raw); break;
    case "is": result = value === parseValue(raw) || (raw === "null" && value === undefined); break;
    case "in": result = raw.replace(/^\(|\)$/g, "").split(",").map((s) => s.replace(/^"|"$/g, "")).includes(String(value)); break;
    case "ilike":
    case "like": {
      const re = new RegExp(`^${raw.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/%/g, ".*")}$`, op === "ilike" ? "i" : "");
      result = re.test(String(value ?? ""));
      break;
    }
    default: result = true;
  }
  return negate ? !result : result;
}

const RESERVED = new Set(["select", "order", "limit", "offset", "on_conflict", "columns"]);

function filterRows(rows, params) {
  return rows.filter((row) => {
    for (const [key, expr] of params) {
      if (RESERVED.has(key)) continue;
      if (!matches(row, key, expr)) return false;
    }
    return true;
  });
}

function orderRows(rows, order) {
  if (!order) return rows;
  const keys = order.split(",").map((o) => {
    const [col, dir] = o.split(".");
    return { col, desc: dir === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const { col, desc } of keys) {
      const x = a[col];
      const y = b[col];
      if (x === y) continue;
      const cmp = x === null || x === undefined ? 1 : y === null || y === undefined ? -1 : x < y ? -1 : 1;
      return desc ? -cmp : cmp;
    }
    return 0;
  });
}

// --- server -----------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export function startMockSupabase({ port = MOCK_PORT } = {}) {
  let db = buildFixtures();
  // Every write the app makes, and every push it sends, for tests that
  // check what was saved or notified.
  const writes = [];
  const pushes = [];

  // For timing pages locally: MOCK_SUPABASE_LATENCY_MS adds a network-like
  // delay to every database call, and /__e2e/requests counts them.
  const latency = Number(process.env.MOCK_SUPABASE_LATENCY_MS ?? 0);
  const requests = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    if (path === "/__e2e/requests") {
      if (req.method === "DELETE") requests.length = 0;
      return send(res, 200, requests);
    }
    if (!path.startsWith("/__e2e/")) {
      requests.push({ at: Date.now(), method: req.method, path: `${path}${url.search}`.slice(0, 160) });
      if (latency > 0) await new Promise((r) => setTimeout(r, latency));
    }

    if (req.method === "OPTIONS") return send(res, 204, undefined, { "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" });

    if (path === "/__e2e/login") {
      const cookie = sessionCookie(url.hostname);
      res.writeHead(302, {
        "Set-Cookie": `${cookie.name}=${cookie.value}; Path=/; SameSite=Lax`,
        Location: url.searchParams.get("next") ?? "http://localhost:3100/",
      });
      return res.end();
    }
    if (path === "/__e2e/reset") {
      db = buildFixtures();
      writes.length = 0;
      pushes.length = 0;
      return send(res, 200, { ok: true });
    }
    if (path === "/__e2e/writes") return send(res, 200, writes);
    if (path === "/__e2e/pushes") return send(res, 200, pushes);
    if (path === "/__e2e/ntfy") {
      pushes.push(JSON.parse((await readBody(req)) || "{}"));
      return send(res, 200, { ok: true });
    }

    if (path === "/auth/v1/user") {
      const auth = req.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ") || auth.includes("anon")) return send(res, 401, { message: "no session" });
      return send(res, 200, sessionCookie().user);
    }
    if (path.startsWith("/auth/v1/")) return send(res, 200, {});

    const table = path.match(/^\/rest\/v1\/(\w+)$/)?.[1];
    if (!table) return send(res, 404, { message: `mock: no route for ${path}` });
    const rows = (db[table] ??= []);
    const params = [...url.searchParams.entries()];
    const prefer = req.headers.prefer ?? "";
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object+json");
    const fields = parseSelect(url.searchParams.get("select"));

    const reply = (result) => {
      const shaped = result.map((r) => project(db, table, r, fields));
      if (wantsObject) {
        if (shaped.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: "", hint: null });
        return send(res, 200, shaped[0]);
      }
      return send(res, 200, shaped, { "Content-Range": `0-${Math.max(shaped.length - 1, 0)}/${shaped.length}` });
    };

    if (req.method === "GET" || req.method === "HEAD") {
      let result = orderRows(filterRows(rows, params), url.searchParams.get("order"));
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const limit = url.searchParams.get("limit");
      result = result.slice(offset, limit === null ? undefined : offset + Number(limit));
      return reply(result);
    }

    const bodyText = await readBody(req);
    const body = bodyText ? JSON.parse(bodyText) : null;
    writes.push({ method: req.method, table, query: Object.fromEntries(params), body });

    if (req.method === "POST") {
      const incoming = Array.isArray(body) ? body : [body];
      const conflict = url.searchParams.get("on_conflict")?.split(",") ?? ["id"];
      const inserted = [];
      for (const r of incoming) {
        const existing = rows.find((x) => conflict.every((c) => r[c] !== undefined && x[c] === r[c]));
        if (existing) {
          if (prefer.includes("ignore-duplicates")) continue;
          Object.assign(existing, r);
          inserted.push(existing);
        } else {
          const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...DEFAULTS[table], ...r };
          rows.push(row);
          inserted.push(row);
        }
      }
      return prefer.includes("return=representation") ? reply(inserted) : send(res, 201, undefined);
    }
    if (req.method === "PATCH") {
      const hit = filterRows(rows, params);
      for (const r of hit) Object.assign(r, body);
      return prefer.includes("return=representation") ? reply(hit) : send(res, 204, undefined);
    }
    if (req.method === "DELETE") {
      const hit = new Set(filterRows(rows, params));
      db[table] = rows.filter((r) => !hit.has(r));
      return prefer.includes("return=representation") ? reply([...hit]) : send(res, 204, undefined);
    }
    return send(res, 405, { message: "mock: method not supported" });
  });

  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
