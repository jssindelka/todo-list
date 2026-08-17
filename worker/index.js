/* ═══════════════════════════════════════════════════════════════════
   Todo — sync worker

   Two endpoints, both POST. There is no login: the list key IS the
   credential. It is generated in the browser with 128 bits of
   randomness, lives in the URL fragment (which browsers never send to
   any server), and only ever leaves the device inside these request
   bodies, over TLS.

   The worker holds no secret the client could steal — it can only
   touch the one KV entry whose key you already know.
   ═══════════════════════════════════════════════════════════════════ */

const ALLOWED_ORIGINS = new Set([
  'https://jssindelka.github.io',   // the deployed app
  'http://localhost:4173',          // local testing
  'http://127.0.0.1:4173',
]);

const KEY_RE   = /^[A-Za-z0-9_-]{32,64}$/;   // shape of a generated list key
const MAX_BODY = 512 * 1024;                 // a to-do list is not megabytes
const TOMBSTONE_TTL = 30 * 24 * 60 * 60 * 1000;   // forget deletions after 30d

function corsHeaders(origin) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin);
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...corsHeaders(origin),
    },
  });
}

const emptyDoc = () => ({ tasks: [], order: [], orderUpdatedAt: 0, name: '' });

/* ── merge ──────────────────────────────────────────────────────────
   Per-task last-write-wins on `updatedAt`, so edits made offline on two
   devices both survive as long as they touched different tasks.

   Deletions are tombstones, not removals. Without them a device holding
   an older copy would happily re-upload a task you deleted elsewhere,
   and it would come back from the dead on the next sync.

   Ordering is the one thing that cannot merge cleanly — reconciling two
   different orderings is a genuinely hard problem and any automatic
   answer is a guess. So ordering is a whole-document decision: whoever
   reordered most recently wins. Task *contents* still merge per-task.
   ─────────────────────────────────────────────────────────────────── */
function mergeDocs(stored, incoming, now) {
  const byId = new Map();

  for (const t of [...(stored.tasks || []), ...(incoming.tasks || [])]) {
    if (!t || typeof t.id !== 'string') continue;
    const prev = byId.get(t.id);
    if (!prev || (t.updatedAt || 0) >= (prev.updatedAt || 0)) byId.set(t.id, t);
  }

  // retire tombstones once both devices have certainly seen them
  for (const [id, t] of byId) {
    if (t.deletedAt && now - t.deletedAt > TOMBSTONE_TTL) byId.delete(id);
  }

  const newer = (incoming.orderUpdatedAt || 0) >= (stored.orderUpdatedAt || 0)
    ? incoming : stored;

  const seen = new Set();
  const order = [];
  for (const id of (newer.order || [])) {
    if (byId.has(id) && !seen.has(id)) { order.push(id); seen.add(id); }
  }
  // anything the winning order never knew about (created on the other
  // device) still has to land somewhere — append it
  for (const id of byId.keys()) if (!seen.has(id)) order.push(id);

  return {
    tasks: order.map(id => byId.get(id)),
    order,
    orderUpdatedAt: Math.max(stored.orderUpdatedAt || 0, incoming.orderUpdatedAt || 0),
    name: (incoming.nameUpdatedAt || 0) >= (stored.nameUpdatedAt || 0)
      ? (incoming.name || '') : (stored.name || ''),
    nameUpdatedAt: Math.max(stored.nameUpdatedAt || 0, incoming.nameUpdatedAt || 0),
    syncedAt: now,
  };
}

async function readDoc(env, key) {
  const raw = await env.TODO.get('list:' + key, { type: 'json' });
  return raw && typeof raw === 'object' ? { ...emptyDoc(), ...raw } : emptyDoc();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (url.pathname === '/health') {
      return json({ ok: true, kv: !!env.TODO }, 200, origin);
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, origin);
    }
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return json({ error: 'origin_not_allowed' }, 403, origin);
    }

    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_BODY) return json({ error: 'too_large' }, 413, origin);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad_json' }, 400, origin);
    }

    const key = body && body.key;
    if (typeof key !== 'string' || !KEY_RE.test(key)) {
      return json({ error: 'bad_key' }, 400, origin);
    }

    const now = Date.now();

    if (url.pathname === '/pull') {
      return json({ doc: await readDoc(env, key), now }, 200, origin);
    }

    if (url.pathname === '/push') {
      const incoming = body.doc;
      if (!incoming || typeof incoming !== 'object' || !Array.isArray(incoming.tasks)) {
        return json({ error: 'bad_doc' }, 400, origin);
      }
      if (incoming.tasks.length > 5000) {
        return json({ error: 'too_many_tasks' }, 413, origin);
      }

      const stored = await readDoc(env, key);
      const merged = mergeDocs(stored, incoming, now);

      // KV has no transactions, so two devices pushing in the same instant
      // could interleave. Single-user traffic makes that vanishingly
      // unlikely, and the next pull reconciles it either way.
      await env.TODO.put('list:' + key, JSON.stringify(merged));
      return json({ doc: merged, now }, 200, origin);
    }

    return json({ error: 'not_found' }, 404, origin);
  },
};
