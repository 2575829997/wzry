const ROLES = ["中路", "打野", "辅助", "射手", "边路"];
const $ = id => document.getElementById(id);
let players = [];
let history = [];
let selected = new Set();
let toastTimer;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2300);
}
function showError(message) {
  $("errorBox").textContent = message;
  $("errorBox").classList.remove("hidden");
}
function clearError() {
  $("errorBox").textContent = "";
  $("errorBox").classList.add("hidden");
}
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
function chosenRoles() {
  return [...$("rolePicker").querySelectorAll("input:checked")].map(x => x.value);
}
function setRoles(roles) {
  $("rolePicker").querySelectorAll("input").forEach(x => x.checked = roles.includes(x.value));
}
function updateSelection() {
  $("selectedCount").textContent = selected.size;
  $("selectionProgress").style.width = `${selected.size * 10}%`;
  $("createBtn").disabled = selected.size !== 10;
  document.querySelectorAll(".player-check").forEach(check => {
    check.checked = selected.has(check.dataset.id);
    check.closest(".player-row")?.classList.toggle("selected", check.checked);
  });
}
function renderPlayers() {
  const query = $("search").value.trim().toLocaleLowerCase();
  const list = players.filter(p => p.nickname.toLocaleLowerCase().includes(query));
  $("playerCount").textContent = players.length;
  $("listCount").textContent = `${players.length} 人`;
  if (!list.length) {
    $("playerList").innerHTML = `<div class="empty">${players.length ? "没有找到匹配的昵称" : "还没有人报名，来做第一个吧！"}</div>`;
    updateSelection();
    return;
  }
  $("playerList").innerHTML = list.map(p => `
    <div class="player-row ${selected.has(p.id) ? "selected" : ""}">
      <input class="player-check" type="checkbox" data-id="${p.id}" ${selected.has(p.id) ? "checked" : ""} aria-label="选择${escapeHtml(p.nickname)}">
      <div><div class="player-name">${escapeHtml(p.nickname)}</div><div class="player-roles">${p.roles.map(escapeHtml).join(" · ")}</div></div>
      <div class="row-actions">
        <button class="mini-btn" data-edit="${p.id}">修改</button>
        <button class="mini-btn danger" data-delete="${p.id}">删除</button>
      </div>
    </div>`).join("");
  updateSelection();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
async function loadAll() {
  try {
    const [p, h] = await Promise.all([api("players"), api("groups")]);
    players = p.players || [];
    history = h.groups || [];
    selected = new Set([...selected].filter(id => players.some(p => p.id === id)));
    renderPlayers();
    renderHistory();
  } catch (e) {
    $("playerList").innerHTML = `<div class="empty">${escapeHtml(e.message)}<br>请检查 Cloudflare D1 是否已绑定。</div>`;
  }
}
function resetForm() {
  $("editId").value = "";
  $("nickname").value = "";
  setRoles([]);
  $("submitBtn").textContent = "确认报名";
  $("cancelEdit").classList.add("hidden");
}
$("signupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("editId").value;
  const payload = { nickname: $("nickname").value, roles: chosenRoles() };
  try {
    if (id) {
      await api(`players/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      toast("报名信息已更新");
    } else {
      await api("players", { method: "POST", body: JSON.stringify(payload) });
      toast("报名成功，欢迎加入！");
    }
    resetForm();
    await loadAll();
  } catch (err) { toast(err.message); }
});
$("cancelEdit").addEventListener("click", resetForm);
$("playerList").addEventListener("change", e => {
  if (!e.target.matches(".player-check")) return;
  const id = e.target.dataset.id;
  if (e.target.checked) {
    if (selected.size >= 10) { e.target.checked = false; toast("最多选择10名玩家"); return; }
    selected.add(id);
  } else selected.delete(id);
  updateSelection();
});
$("playerList").addEventListener("click", async e => {
  const editId = e.target.dataset.edit;
  const deleteId = e.target.dataset.delete;
  if (editId) {
    const p = players.find(x => x.id === editId);
    if (!p) return;
    $("editId").value = p.id;
    $("nickname").value = p.nickname;
    setRoles(p.roles);
    $("submitBtn").textContent = "保存修改";
    $("cancelEdit").classList.remove("hidden");
    $("nickname").focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  if (deleteId) {
    const p = players.find(x => x.id === deleteId);
    if (!p || !confirm(`确定删除「${p.nickname}」的报名吗？`)) return;
    try {
      await api(`players/${deleteId}`, { method: "DELETE" });
      selected.delete(deleteId);
      toast("已删除报名");
      await loadAll();
    } catch (err) { toast(err.message); }
  }
});
$("search").addEventListener("input", renderPlayers);
$("refreshBtn").addEventListener("click", loadAll);

$("createBtn").addEventListener("click", async () => {
  clearError();
  $("createBtn").disabled = true;
  $("createBtn").textContent = "正在计算合法分组…";
  try {
    const data = await api("groups", {
      method: "POST",
      body: JSON.stringify({ playerIds: [...selected] })
    });
    renderResult(data.result, data.createdAt, true);
    await loadAll();
    toast("成功创建两支队伍！");
  } catch (err) {
    showError(err.message);
  } finally {
    $("createBtn").textContent = "⚔ 随机创建两队";
    updateSelection();
  }
});

function renderTeam(team, cls, title) {
  return `<div class="team-card ${cls}"><div class="team-title">${title}</div>${team.map(item =>
    `<div class="team-player"><span>${escapeHtml(item.role)}</span><strong>${escapeHtml(item.player.nickname)}</strong></div>`
  ).join("")}</div>`;
}
function renderResult(result, createdAt, isCurrent) {
  const date = new Date(createdAt).toLocaleString("zh-CN", { hour12: false });
  $("result").innerHTML = `
    <div class="result-top"><h3>${isCurrent ? "🎉 分组成功" : "历史分组"}</h3>
      <div class="result-actions"><button class="mini-btn" id="copyResult">复制结果</button></div>
    </div>
    <div class="team-grid">
      ${renderTeam(result.teamA, "team-a", "🔴 红队")}
      ${renderTeam(result.teamB, "team-b", "🔵 蓝队")}
    </div>
    <div class="history-date" style="margin-top:10px">创建时间：${escapeHtml(date)}</div>`;
  $("result").classList.remove("hidden");
  $("copyResult").addEventListener("click", () => copyResult(result, date));
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}
async function copyResult(result, date) {
  const lines = ["【王者内战分组】", `创建时间：${date}`, "", "🔴 红队"];
  result.teamA.forEach(x => lines.push(`${x.role}：${x.player.nickname}`));
  lines.push("", "🔵 蓝队");
  result.teamB.forEach(x => lines.push(`${x.role}：${x.player.nickname}`));
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("分组结果已复制");
  } catch {
    toast("复制失败，请检查浏览器剪贴板权限");
  }
}
function renderHistory() {
  if (!history.length) {
    $("historyList").innerHTML = `<div class="empty">暂无历史分组</div>`;
    return;
  }
  $("historyList").innerHTML = history.map((h, i) => {
    const d = new Date(h.createdAt).toLocaleString("zh-CN", { hour12: false });
    const a = h.result.teamA.map(x => x.player.nickname).join("、");
    const b = h.result.teamB.map(x => x.player.nickname).join("、");
    return `<div class="history-item"><div class="history-date">第 ${history.length - i} 场 · ${escapeHtml(d)}</div>
      <div class="history-summary">🔴 ${escapeHtml(a)}<br>🔵 ${escapeHtml(b)}</div></div>`;
  }).join("");
}
loadAll();
