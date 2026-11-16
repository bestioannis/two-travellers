(() => {
  "use strict";
  const config = window.TRAVEL_CONFIG || {};
  const url = (config.url || "").replace(/\/+$/, "");
  const key = config.publishableKey || "";
  const configured =
    /^https:\/\/[^/]+$/.test(url) &&
    (key.startsWith("sb_publishable_") || isLegacyAnon(key));
  const prefix =
    "two-travellers/v1/" + new URL("./", location.href).pathname + "/";
  const guest = prefix + "local";
  const sessionKey = prefix + url + "/session";
  const activity = { syncing: false, lastSync: "", error: "" };
  let currentSync;
  let wakeup;
  const localLocks = new Map();

  function isLegacyAnon(token) {
    try {
      return (
        JSON.parse(
          atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ).role === "anon"
      );
    } catch {
      return false;
    }
  }
  function read(key, fallback) {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function lock(name, fn) {
    if (navigator.locks) return navigator.locks.request(name, fn);
    const work = (localLocks.get(name) || Promise.resolve())
      .catch(() => {})
      .then(fn);
    localLocks.set(name, work);
    return work;
  }
  function changed() {
    window.dispatchEvent(new Event("travelstore:change"));
  }
  function session() {
    return configured ? read(sessionKey, null) : null;
  }
  function namespace(s = session()) {
    return s ? prefix + url + "/" + s.id : guest;
  }
  function snapshot(ns = namespace()) {
    return read(ns, { rows: {}, pending: {}, lastSync: "" });
  }
  function update(ns, fn) {
    return lock(ns, () => {
      const data = snapshot(ns);
      const result = fn(data);
      write(ns, data);
      changed();
      return result;
    });
  }
  function safeId(id) {
    return (
      typeof id === "string" &&
      id.length > 0 &&
      id.length <= 240 &&
      !Object.hasOwn(Object.prototype, id) &&
      !/[\u0000-\u001f]/.test(id)
    );
  }
  function validate(value) {
    if (
      !value ||
      !["visited", "wish"].includes(value.status) ||
      (value.note != null &&
        (typeof value.note !== "string" || value.note.length > 10000)) ||
      (value.date != null &&
        (typeof value.date !== "string" ||
          (value.date && !/^\d{4}-\d{2}-\d{2}$/.test(value.date))))
    ) {
      throw new Error("记录格式无效，或笔记超过 10,000 字。");
    }
    return {
      status: value.status,
      note: value.note || "",
      date: value.date || "",
    };
  }
  function setRow(data, id, value, queue) {
    const old = data.rows[id];
    const time = Math.max(
      Date.now(),
      old ? Date.parse(old.stamp.slice(0, 24)) + 1 : 0,
    );
    const stamp = new Date(time).toISOString() + "_" + crypto.randomUUID();
    data.rows[id] = {
      place_id: id,
      ...(value || { status: "deleted", note: "", date: "" }),
      stamp,
    };
    if (queue) data.pending[id] = stamp;
  }
  function records() {
    return Object.fromEntries(
      Object.entries(snapshot().rows)
        .filter(([, r]) => r.status !== "deleted")
        .map(([id, { status, note, date }]) => [id, { status, note, date }]),
    );
  }
  function state() {
    const s = session();
    const data = snapshot(namespace(s));
    return {
      ...activity,
      lastSync: data.lastSync || "",
      configured,
      email: s?.email || "",
      pending: Object.keys(data.pending).length,
    };
  }
  function schedule() {
    clearTimeout(wakeup);
    if (session()) wakeup = setTimeout(() => sync().catch(() => {}), 600);
  }
  async function save(id, value) {
    if (!safeId(id)) throw new Error("无效的地点编号。");
    const clean = value === null ? null : validate(value);
    const ns = namespace();
    await update(ns, (d) => setRow(d, id, clean, ns !== guest));
    schedule();
  }
  function exportBackup() {
    return JSON.stringify(
      {
        format: "two-travellers",
        version: 1,
        exportedAt: new Date().toISOString(),
        records: records(),
      },
      null,
      2,
    );
  }
  async function importBackup(input) {
    let b;
    try {
      b = JSON.parse(input);
    } catch {
      throw new Error("无法读取备份文件。");
    }
    if (
      b?.format !== "two-travellers" ||
      b.version !== 1 ||
      !b.records ||
      typeof b.records !== "object" ||
      Array.isArray(b.records)
    )
      throw new Error("需要双人地图导出的 JSON 备份。");
    const entries = Object.entries(b.records).map(([id, r]) => {
      if (!safeId(id)) throw new Error("备份包含无效的地点编号。");
      return [id, validate(r)];
    });
    const ns = namespace();
    await update(ns, (d) => {
      for (const [id, r] of entries) setRow(d, id, r, ns !== guest);
    });
    schedule();
    return entries.length;
  }

  async function api(path, token, body, headers = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          apikey: key,
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
      });
      const text = await response.text();
      let result;
      try {
        result = text ? JSON.parse(text) : null;
      } catch {
        result = null;
      }
      if (!response.ok) {
        const error = new Error(
          result?.message ||
            result?.msg ||
            result?.error_description ||
            "云端请求失败 (" + response.status + ")",
        );
        error.status = response.status;
        throw error;
      }
      return result;
    } catch (error) {
      if (!error.status) throw new Error("网络连接中断或超时，请联网后重试。");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  function authSession(result) {
    return {
      id: result.user.id,
      email: result.user.email,
      access: result.access_token,
      refresh: result.refresh_token,
      expires:
        result.expires_at || Math.floor(Date.now() / 1000) + result.expires_in,
    };
  }
  async function fresh(id) {
    return lock(sessionKey, async () => {
      let s = session();
      if (!s || s.id !== id) throw new Error("登录状态已变更。");
      if (s.expires * 1000 <= Date.now() + 60000) {
        s = authSession(
          await api("/auth/v1/token?grant_type=refresh_token", null, {
            refresh_token: s.refresh,
          }),
        );
        write(sessionKey, s);
      }
      return s;
    });
  }
  async function checkMember(s) {
    const members = await api(
      "/rest/v1/travel_members?select=user_id&user_id=eq." +
        encodeURIComponent(s.id),
      s.access,
    );
    if (!Array.isArray(members) || !members.length)
      throw new Error("此账号尚未加入双人旅行地图。");
  }
  async function login(email, password) {
    if (!configured) throw new Error("请先配置 Supabase。");
    const s = authSession(
      await api("/auth/v1/token?grant_type=password", null, {
        email: email.trim(),
        password,
      }),
    );
    await checkMember(s);
    // Guest edits move into the shared journal only after membership succeeds.
    await lock(sessionKey, () =>
      lock(guest, async () => {
        const local = snapshot(guest);
        await update(namespace(s), (d) => {
          for (const r of Object.values(local.rows)) {
            if (
              r.status !== "deleted" &&
              (!d.rows[r.place_id] || d.rows[r.place_id].stamp < r.stamp)
            ) {
              d.rows[r.place_id] = r;
              d.pending[r.place_id] = r.stamp;
            }
          }
        });
        write(sessionKey, s);
        localStorage.removeItem(guest);
      }),
    );
    activity.error = "";
    changed();
    schedule();
  }
  async function logout() {
    const s = await lock(sessionKey, () => {
      const previous = session();
      localStorage.removeItem(sessionKey);
      return previous;
    });
    activity.error = "";
    changed();
    if (s)
      await api("/auth/v1/logout?scope=local", s.access, {}).catch(() => {});
  }
  async function exchange(id) {
    const s = await fresh(id);
    const ns = namespace(s);
    await checkMember(s);
    const initial = snapshot(ns);
    const edits = Object.keys(initial.pending).map((k) => initial.rows[k]);
    for (let start = 0; start < edits.length; start += 100) {
      const batch = edits.slice(start, start + 100);
      await api("/rest/v1/rpc/travel_apply", (await fresh(id)).access, {
        changes: batch,
      });
      await update(ns, (d) => {
        for (const r of batch)
          if (d.pending[r.place_id] === r.stamp) delete d.pending[r.place_id];
      });
    }
    let cursor = "";
    for (;;) {
      const params = new URLSearchParams({
        select: "place_id,status,note,date,stamp",
        order: "place_id.asc",
        limit: "250",
      });
      if (cursor)
        params.set("place_id", 'gt."' + cursor.replace(/["\\]/g, "\\$&") + '"');
      const page = await api(
        "/rest/v1/travel_places?" + params,
        (await fresh(id)).access,
      );
      if (!Array.isArray(page)) throw new Error("云端返回了无法读取的数据。");
      if (!page.length) break;
      await update(ns, (d) => {
        for (const r of page) {
          if (!safeId(r.place_id)) continue;
          const old = d.rows[r.place_id];
          if (!old || r.stamp > old.stamp) {
            d.rows[r.place_id] = r;
            delete d.pending[r.place_id];
          }
        }
      });
      cursor = page[page.length - 1].place_id;
    }
    await update(ns, (d) => {
      d.lastSync = new Date().toISOString();
    });
  }
  async function sync() {
    if (currentSync) return currentSync;
    const s = session();
    if (!s) return;
    activity.syncing = true;
    activity.error = "";
    currentSync = exchange(s.id)
      .catch((err) => {
        if (session()?.id === s.id) activity.error = err.message;
        throw err;
      })
      .finally(() => {
        currentSync = null;
        activity.syncing = false;
        changed();
        const now = session();
        if (now && (now.id !== s.id || (!activity.error && state().pending)))
          schedule();
      });
    changed();
    return currentSync;
  }
  window.TravelStore = {
    records,
    save,
    state,
    exportBackup,
    importBackup,
    login,
    logout,
    sync,
  };
  window.addEventListener("storage", (e) => {
    if (e.key === null || e.key.startsWith(prefix)) {
      changed();
      if (e.key === sessionKey) schedule();
    }
  });
  window.addEventListener("online", schedule);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });
  setInterval(() => {
    if (session() && !document.hidden && navigator.onLine !== false) schedule();
  }, 30000);
  schedule();
})();
