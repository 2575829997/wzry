const VALID_ROLES = ["中路", "打野", "辅助", "射手", "边路"];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeNickname(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateRoles(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(x => VALID_ROLES.includes(x)))];
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch { return null; }
}

function randomize(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * 为两个队伍分别填满五个位置。
 * 每名玩家只能使用一次；每队每个位置恰好一人。
 * 通过动态选择候选人最少的空位，降低回溯搜索量。
 */
function buildValidTeams(players) {
  const slots = [];
  for (const team of ["A", "B"]) {
    for (const role of VALID_ROLES) slots.push({ team, role });
  }

  const assigned = new Map(); // playerId -> {team, role}
  const usedSlots = new Set();

  function search() {
    if (usedSlots.size === slots.length) return true;

    let bestSlot = null;
    let bestCandidates = null;

    for (const slot of slots) {
      const key = `${slot.team}:${slot.role}`;
      if (usedSlots.has(key)) continue;

      const candidates = randomize(players.filter(p =>
        !assigned.has(p.id) && p.roles.includes(slot.role)
      ));

      if (bestCandidates === null || candidates.length < bestCandidates.length) {
        bestSlot = slot;
        bestCandidates = candidates;
      }
      if (bestCandidates.length === 0) return false;
    }

    const slotKey = `${bestSlot.team}:${bestSlot.role}`;
    usedSlots.add(slotKey);

    for (const player of bestCandidates) {
      assigned.set(player.id, { team: bestSlot.team, role: bestSlot.role });
      if (search()) return true;
      assigned.delete(player.id);
    }

    usedSlots.delete(slotKey);
    return false;
  }

  if (!search()) return null;

  const makeTeam = team => VALID_ROLES.map(role => {
    const player = players.find(p => assigned.get(p.id)?.team === team &&
      assigned.get(p.id)?.role === role);
    return { role, player: { id: player.id, nickname: player.nickname } };
  });

  return { teamA: makeTeam("A"), teamB: makeTeam("B") };
}

function diagnose(players) {
  const missing = [];
  for (const role of VALID_ROLES) {
    const count = players.filter(p => p.roles.includes(role)).length;
    if (count < 2) missing.push(`${role}（只有 ${count} 人可选，至少需要 2 人）`);
  }
  if (missing.length) return `分路不满足：${missing.join("；")}`;

  return "虽然每个位置至少有两名候选人，但这些位置组合可能互相冲突，无法将10人拆成两支完整队伍。请更换人员或增加可选位置。";
}

export async function onRequest({ request, env }) {
  if (!env.DB) return json({ error: "数据库尚未绑定，请先在 Cloudflare Pages 绑定 D1，变量名填写 DB。" }, 500);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, "").replace(/\/$/, "");
  const method = request.method;

  try {
    if (path === "players" && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, nickname, roles_json, created_at, updated_at FROM players ORDER BY nickname COLLATE NOCASE"
      ).all();
      return json({ players: (results || []).map(p => ({
        id: p.id, nickname: p.nickname, roles: JSON.parse(p.roles_json),
        createdAt: p.created_at, updatedAt: p.updated_at
      })) });
    }

    if (path === "players" && method === "POST") {
      const body = await bodyJson(request);
      const nickname = normalizeNickname(body?.nickname);
      const roles = validateRoles(body?.roles);
      if (nickname.length < 1 || nickname.length > 20) return json({ error: "昵称长度需要为 1～20 个字符。" }, 400);
      if (!roles.length) return json({ error: "请至少选择一个分路。" }, 400);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(
          "INSERT INTO players (id,nickname,nickname_key,roles_json,created_at,updated_at) VALUES (?,?,?,?,?,?)"
        ).bind(id, nickname, nickname.toLocaleLowerCase(), JSON.stringify(roles), now, now).run();
      } catch (e) {
        if (String(e).toLowerCase().includes("unique")) return json({ error: "这个昵称已经报名过了，请直接修改已有报名，或换一个昵称。" }, 409);
        throw e;
      }
      return json({ player: { id, nickname, roles, createdAt: now, updatedAt: now } }, 201);
    }

    const playerMatch = path.match(/^players\/([a-f0-9-]+)$/i);
    if (playerMatch && method === "PUT") {
      const id = playerMatch[1];
      const body = await bodyJson(request);
      const nickname = normalizeNickname(body?.nickname);
      const roles = validateRoles(body?.roles);
      if (nickname.length < 1 || nickname.length > 20) return json({ error: "昵称长度需要为 1～20 个字符。" }, 400);
      if (!roles.length) return json({ error: "请至少选择一个分路。" }, 400);
      const now = new Date().toISOString();
      try {
        const result = await env.DB.prepare(
          "UPDATE players SET nickname=?, nickname_key=?, roles_json=?, updated_at=? WHERE id=?"
        ).bind(nickname, nickname.toLocaleLowerCase(), JSON.stringify(roles), now, id).run();
        if (!result.meta.changes) return json({ error: "这条报名不存在，可能已被删除。" }, 404);
      } catch (e) {
        if (String(e).toLowerCase().includes("unique")) return json({ error: "另一个玩家已经使用这个昵称。" }, 409);
        throw e;
      }
      return json({ ok: true });
    }

    if (playerMatch && method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM players WHERE id=?").bind(playerMatch[1]).run();
      if (!result.meta.changes) return json({ error: "这条报名不存在，可能已被删除。" }, 404);
      return json({ ok: true });
    }

    if (path === "groups" && method === "GET") {
      const { results } = await env.DB.prepare(
        "SELECT id, result_json, created_at FROM groups_history ORDER BY created_at DESC LIMIT 30"
      ).all();
      return json({ groups: (results || []).map(g => ({
        id: g.id, result: JSON.parse(g.result_json), createdAt: g.created_at
      })) });
    }

    if (path === "groups" && method === "POST") {
      const body = await bodyJson(request);
      const ids = Array.isArray(body?.playerIds) ? [...new Set(body.playerIds.map(String))] : [];
      if (ids.length !== 10) return json({ error: "请准确选择10名不同的玩家。" }, 400);

      const placeholders = ids.map(() => "?").join(",");
      const { results } = await env.DB.prepare(
        `SELECT id,nickname,roles_json FROM players WHERE id IN (${placeholders})`
      ).bind(...ids).all();

      if ((results || []).length !== 10) return json({ error: "部分报名人员已不存在，请刷新名单后重新选择。" }, 409);

      const players = results.map(p => ({
        id: p.id, nickname: p.nickname, roles: JSON.parse(p.roles_json)
      }));

      const teams = buildValidTeams(players);
      if (!teams) return json({ error: diagnose(players), code: "ROLES_UNSATISFIED" }, 422);

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const result = { ...teams, selectedCount: 10 };
      await env.DB.prepare(
        "INSERT INTO groups_history (id,player_ids_json,result_json,created_at) VALUES (?,?,?,?)"
      ).bind(id, JSON.stringify(ids), JSON.stringify(result), createdAt).run();

      // 只保留最近30条历史，避免无意义增长
      await env.DB.prepare(
        "DELETE FROM groups_history WHERE id NOT IN (SELECT id FROM groups_history ORDER BY created_at DESC LIMIT 30)"
      ).run();

      return json({ id, result, createdAt }, 201);
    }

    return json({ error: "接口不存在。" }, 404);
  } catch (error) {
    return json({ error: "服务器处理失败，请稍后重试。", detail: String(error?.message || error) }, 500);
  }
}
