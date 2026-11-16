"use strict";
const $ = (id) => document.getElementById(id);
const paths = {
  bag: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M7 8v12m10-12v12m-5-9 2 2-2 2-2-2z"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zM9 3v15m6-12v15"/>',
  book: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18m3-13h5m-5 4h4"/>',
  chart: '<path d="M3 20h18M6 16v-5m6 5V4m6 12V8"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m0-15a3 3 0 0 1 0 6m2 3q4 1 4 6"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-3 5-5 3 3-5z"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  fit: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',
};
document.querySelectorAll("[data-i]").forEach((el) => {
  el.innerHTML =
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' +
    paths[el.dataset.i] +
    "</svg>";
});
const types = {
  country: "国家及地区",
  region: "省 / 州",
  city: "旅行城市",
  prefecture: "地市及直辖县",
  county: "区 / 县",
  sight: "主要景点",
};
const titles = {
  map: [
    "OUR TRAVEL ATLAS",
    "我们的旅行地图",
    "一起去过的地方，和下一次想抵达的远方。",
  ],
  journal: [
    "TRAVEL JOURNAL",
    "足迹手记",
    "翻看共同的回忆，也为下一趟旅行留个位置。",
  ],
  stats: [
    "TRAVEL STATISTICS",
    "旅行统计",
    "数一数，我们一起走过了多大的世界。",
  ],
};
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const btn = (id, label, cls = "") =>
  '<button type="button" class="action ' +
  cls +
  '" id="' +
  id +
  '">' +
  label +
  "</button>";
let places = [],
  byId = new Map(),
  controller,
  statsController,
  worldShapes,
  statsScope = "world",
  scope = "world",
  transit = true,
  railway = false,
  layer = "country",
  selected = "",
  filter = "visited",
  page = "map";
const S = window.TravelStore;
let msgTimer;
function notify(text, undo) {
  $("toast").textContent = text;
  $("toast").className = "show";
  clearTimeout(msgTimer);
  if (undo) {
    const button = document.createElement("button");
    button.textContent = "撤销";
    button.onclick = async () => {
      button.disabled = true;
      try {
        await undo();
      } catch (e) {
        handle(e);
      }
    };
    $("toast").append(" ", button);
  }
  msgTimer = setTimeout(
    () => {
      $("toast").className = "";
      $("toast").replaceChildren();
    },
    undo ? 6500 : 2200,
  );
}
function handle(err) {
  notify(err.message || "操作失败，请重试");
}
function showSheet(label) {
  $("dialog-label").textContent = label;
  if (!$("sheet").open) $("sheet").showModal();
}
$("close").onclick = () => $("sheet").close();
$("sheet").addEventListener("click", (e) => {
  if (
    e.target === $("sheet") &&
    (e.clientX < $("sheet").getBoundingClientRect().left ||
      e.clientX > $("sheet").getBoundingClientRect().right ||
      e.clientY < $("sheet").getBoundingClientRect().top ||
      e.clientY > $("sheet").getBoundingClientRect().bottom)
  )
    $("sheet").close();
});
function layers() {
  let keys =
    scope === "world"
      ? ["country", "city", "region"]
      : ["prefecture", "county", "region", "sight", "city"];
  $("layer").innerHTML = keys
    .map((k) => '<option value="' + k + '">' + types[k] + "</option>")
    .join("");
  $("layer").value = layer;
  document
    .querySelectorAll("[data-scope]")
    .forEach((b) => b.classList.toggle("active", b.dataset.scope === scope));
}
function mapUpdate() {
  controller?.update({
    scope,
    layer,
    transit,
    railway,
    records: S.records(),
    selected,
  });
}
document.querySelectorAll("[data-scope]").forEach(
  (b) =>
    (b.onclick = () => {
      scope = b.dataset.scope;
      $("search").value = "";
      $("results").hidden = true;
      layer = scope === "world" ? "country" : "prefecture";
      selected = "";
      layers();
      mapUpdate();
      controller?.reset();
    }),
);
$("layer").onchange = (e) => {
  layer = e.target.value;
  selected = "";
  mapUpdate();
};
$("transit").onclick = () => {
  transit = !transit;
  $("transit").setAttribute("aria-pressed", String(transit));
  if (transit) notify("地铁按线路颜色显示，放大可查看站名");
  mapUpdate();
};
$("railway").onclick = () => {
  railway = !railway;
  $("railway").setAttribute("aria-pressed", String(railway));
  mapUpdate();
};
$("plus").onclick = () => controller?.zoom(1.55);
$("minus").onclick = () => controller?.zoom(1 / 1.55);
$("reset").onclick = () => controller?.reset();
function navigate() {
  page = location.hash.slice(1);
  if (!Object.hasOwn(titles, page)) page = "map";
  document.body.dataset.view = page;
  const [k, h, p] = titles[page];
  $("kicker").textContent = k;
  $("page-title").innerHTML = h + "<span>.</span>";
  $("subtitle").textContent = p;
  Object.keys(titles).forEach(
    (key) => ($(key + "-page").hidden = key !== page),
  );
  document.querySelectorAll("nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === page);
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  refresh();
}
window.addEventListener("hashchange", navigate);
function entry(p, r) {
  return (
    '<button class="entry" data-place="' +
    esc(p.id) +
    '"><em class="dot ' +
    r.status +
    '"></em><span><strong>' +
    esc(p.name) +
    "</strong><small>" +
    esc([countryLabel(p), types[p.type], r.date].filter(Boolean).join(" · ")) +
    "</small>" +
    esc(r.note.slice(0, 80)) +
    "</span>↗</button>"
  );
}
function countryLabel(place) {
  const code = place.countryCode || "";
  if (!/^[A-Z]{2}$/.test(code)) return place.country;
  const flag = String.fromCodePoint(
    ...[...code].map((c) => 127397 + c.charCodeAt(0)),
  );
  return flag + " " + place.country;
}
function refreshStatsMap(records) {
  if (!worldShapes) return;
  if (!statsController)
    statsController = TravelMap.mount($("stats-atlas"), {
      places,
      world: worldShapes,
      stats: true,
      onSelect: (id) => showPlace(id),
    });
  const selection = $("stat-filter").value;
  const matching = Object.fromEntries(
    Object.entries(records).filter(
      ([id, r]) =>
        byId.has(id) &&
        (selection === "all" || r.status === selection) &&
        (statsScope === "world" || byId.get(id).country === "中国"),
    ),
  );
  statsController.update({
    scope: statsScope,
    layer: "records",
    records: matching,
    selected: "",
  });
  const empty = !Object.keys(matching).length;
  $("stat-empty").hidden = !empty;
  $("stat-empty").textContent = empty
    ? "当前范围还没有符合条件的标记。去旅行地图记下一站吧。"
    : "";
  document
    .querySelectorAll("[data-stat-scope]")
    .forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.statScope === statsScope),
    );
}
document.querySelectorAll("[data-stat-scope]").forEach(
  (b) =>
    (b.onclick = () => {
      statsScope = b.dataset.statScope;
      refreshStatsMap(S.records());
    }),
);
$("stat-filter").onchange = () => refreshStatsMap(S.records());
$("stats-plus").onclick = () => statsController?.zoom(1.55);
$("stats-minus").onclick = () => statsController?.zoom(1 / 1.55);
$("stats-reset").onclick = () => statsController?.reset();
function refresh() {
  const records = S.records(),
    items = Object.entries(records).filter(([id]) => byId.has(id)),
    visited = items.filter(([, r]) => r.status === "visited"),
    wish = items.filter(([, r]) => r.status === "wish");

  if (page === "map") mapUpdate();
  if (page === "journal") {
    document
      .querySelectorAll("[data-filter]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.filter === filter),
      );
    const rows = (filter === "visited" ? visited : wish).sort(
      (a, b) =>
        b[1].date.localeCompare(a[1].date) ||
        byId.get(a[0]).name.localeCompare(byId.get(b[0]).name, "zh"),
    );
    $("journal").innerHTML =
      rows.map(([id, r]) => entry(byId.get(id), r)).join("") ||
      '<div class="box empty">' +
        (filter === "visited"
          ? "你的第一篇旅行手记，从地图上的一个地点开始。"
          : "在地图上选一个想一起去的地方吧。") +
        ' <a href="#map">打开地图 ↗</a></div>';
  }
  if (page === "stats") {
    const counts = Object.keys(types).map((k) => [
      types[k],
      visited.filter(([id]) => byId.get(id).type === k).length,
    ]);
    const countries = new Set(
      visited.map(([id]) => byId.get(id).countryCode || byId.get(id).country),
    );
    $("stats").innerHTML =
      '<div class="stats-grid">' +
      [
        [visited.length, "去过的地点"],
        [wish.length, "想去的地点"],
        [countries.size, "到访国家及地区"],
      ]
        .map(
          ([n, t]) =>
            '<div class="box"><strong class="stat-number">' +
            n +
            "</strong>" +
            t +
            "</div>",
        )
        .join("") +
      "</div>";
    refreshStatsMap(records);
    $("stats-breakdown").innerHTML =
      '<section class="box"><h2>足迹分布</h2>' +
      counts
        .map(
          ([t, n]) =>
            '<div class="bar-row"><span>' +
            t +
            '</span><div><em style="width:' +
            (100 * n) / Math.max(1, ...counts.map((r) => r[1])) +
            '%"></em></div><b>' +
            n +
            "</b></div>",
        )
        .join("") +
      "</section>";
  }
}
window.addEventListener("travelstore:change", () => {
  refresh();
  if (
    $("sheet").open &&
    $("dialog-label").textContent === "SHARED PASSPORT" &&
    !$("loginForm")
  )
    account();
});
document.querySelectorAll("[data-filter]").forEach(
  (b) =>
    (b.onclick = () => {
      filter = b.dataset.filter;
      refresh();
    }),
);
let markMode = "browse";
document.querySelectorAll("[data-mark]").forEach(
  (b) =>
    (b.onclick = () => {
      markMode = b.dataset.mark;
      document
        .querySelectorAll("[data-mark]")
        .forEach((t) => t.setAttribute("aria-pressed", t === b));
      $("mark-hint").textContent =
        markMode === "browse" ? "点地点或地名查看" : "连续点选地点即可标记";
    }),
);
async function markPlace(id, next, fields) {
  const previous = S.records()[id] || null;
  const record = {
    status: next,
    note: previous?.note || "",
    date: previous?.date || "",
    ...fields,
  };
  await S.save(id, record);
  const name = byId.get(id).name;
  notify(
    name + " · " + (next === "visited" ? "已标去过" : "已标想去"),
    async () => {
      const current = S.records()[id];
      if (
        !current ||
        current.status !== record.status ||
        current.note !== record.note ||
        current.date !== record.date
      ) {
        notify("这条记录已更新");
        return;
      }
      await S.save(id, previous);
      notify("已撤销标记");
    },
  );
}
function chooseOnMap(id) {
  if (markMode === "browse") {
    showPlace(id);
    return;
  }
  selected = id;
  markPlace(id, markMode).catch(handle);
}
function countryJournal(p) {
  if (p.type !== "country") return "";
  const records = Object.entries(S.records()).filter(([id]) => {
    const child = byId.get(id);
    return (
      child && child.type !== "country" && child.countryCode === p.countryCode
    );
  });
  const rows = records.sort((a, b) => b[1].date.localeCompare(a[1].date));
  const visited = rows.filter(([, r]) => r.status === "visited").length;
  return (
    '<section class="country-journal"><h3>在' +
    esc(p.name) +
    "的旅行记录</h3>" +
    (rows.length
      ? "<p>" +
        visited +
        " 个去过 · " +
        (rows.length - visited) +
        " 个想去</p>" +
        rows.map(([id, r]) => entry(byId.get(id), r)).join("")
      : "<p>在这里标过的城市、地区和景点会汇集在这张卡片。</p>") +
    "</section>"
  );
}
function showPlace(id, fly = false) {
  const p = byId.get(id);
  if (!p) return;
  selected = id;
  $("results").hidden = true;
  if (fly) {
    location.hash = "map";
    scope = p.country === "中国" && p.type !== "country" ? "china" : "world";
    layer = p.type;
    layers();
    navigate();
    controller?.focus(id);
  } else mapUpdate();
  const r = S.records()[id] || { note: "", date: "", status: "" };
  const status = r.status;
  const links = [];
  function link(label, url) {
    try {
      if (new URL(url).protocol === "https:")
        links.push(
          '<a class="action" href="' +
            esc(url) +
            '" target="_blank" rel="noopener noreferrer">' +
            label +
            " ↗</a>",
        );
    } catch {}
  }
  link(
    "地理与历史",
    p.wiki?.startsWith("https://")
      ? p.wiki
      : "https://zh.wikipedia.org/wiki/" + encodeURIComponent(p.wiki || p.name),
  );
  link(
    "旅行指南",
    p.guideUrl ||
      "https://zh.wikivoyage.org/wiki/Special:Search?search=" +
        encodeURIComponent(p.name),
  );
  if (p.heritageUrl) link("遗产资料", p.heritageUrl);
  if (p.contextUrl) link("国家背景来源", p.contextUrl);
  if (p.sourceUrl) link("地点资料", p.sourceUrl);
  showSheet(types[p.type] + "  /  " + countryLabel(p));
  $("detail").innerHTML =
    "<h2>" +
    esc(p.name) +
    '</h2><div class="quick-status actions">' +
    btn("visited", "✓ 去过", "primary") +
    btn("wish", "♡ 想去", "wanted") +
    '</div><p id="form-msg" role="status">' +
    (status
      ? "当前标记 · " + (status === "visited" ? "去过" : "想去")
      : "点选即保存") +
    "</p>" +
    '<details class="edit-trip" ' +
    (r.note || r.date ? "open" : "") +
    '><summary>日期和手记</summary><label for="trip-date">旅行日期</label><input type="date" id="trip-date" value="' +
    esc(r.date) +
    '"><label for="note">旅行手记</label><textarea rows="3" maxlength="6000" id="note" placeholder="记下那天的回忆或下一次的计划"></textarea>' +
    (status
      ? '<div class="actions">' + btn("save", "保存手记", "primary") + "</div>"
      : "<p>填写后，点上方「去过」或「想去」保存。</p>") +
    "</details>" +
    countryJournal(p) +
    (p.type === "country" ? "" : btn("street-view", "在地图中查看街道 ↗")) +
    "<p>" +
    esc(p.overview || p.name + "位于" + p.country + "。") +
    "</p>" +
    (p.sights ? "<h3>景点与周边</h3><p>" + esc(p.sights) + "</p>" : "") +
    (p.tip ? "<h3>旅行提示</h3><p>" + esc(p.tip) + "</p>" : "") +
    '<div class="actions">' +
    links.join("") +
    "</div>" +
    (status
      ? '<div class="actions">' + btn("remove", "移除标记") + "</div>"
      : "");
  $("note").value = r.note;
  if ($("street-view"))
    $("street-view").onclick = () => {
      $("sheet").close();
      location.hash = "map";
      scope = p.country === "中国" && p.type !== "country" ? "china" : "world";
      layer = p.type;
      layers();
      navigate();
      controller?.focus(id, { street: true });
    };
  async function commit(next) {
    const record = { date: $("trip-date").value, note: $("note").value };
    try {
      await markPlace(id, next, record);
      $("sheet").close();
    } catch (e) {
      $("form-msg").textContent = e.message;
    }
  }
  for (const next of ["visited", "wish"]) {
    $(next).setAttribute("aria-pressed", next === status);
    $(next).onclick = () => commit(next);
  }
  if ($("save")) $("save").onclick = () => commit(status);
  if ($("remove"))
    $("remove").onclick = async () => {
      try {
        await S.save(id, null);
        $("sheet").close();
        notify("已移除标记");
      } catch (e) {
        handle(e);
      }
    };
}
document.body.addEventListener("click", (e) => {
  const b = e.target.closest("[data-place]");
  if (b) {
    if (page === "map" && markMode !== "browse" && b.closest("#results")) {
      $("results").hidden = true;
      chooseOnMap(b.dataset.place);
    } else showPlace(b.dataset.place, !!b.closest("#results"));
  }
  if (!e.target.closest(".search-wrap")) $("results").hidden = true;
});
function search() {
  const q = $("search").value.trim().toLowerCase();
  if (!q) {
    $("results").hidden = true;
    return;
  }
  const rows = places
    .filter((p) => p.lookup.includes(q))
    .sort(
      (a, b) =>
        (b.name.toLowerCase() === q) - (a.name.toLowerCase() === q) ||
        (b.type === "country") - (a.type === "country") ||
        (b.type === "city") - (a.type === "city"),
    )
    .slice(0, 35);
  $("results").innerHTML = rows.length
    ? rows
        .map(
          (p) =>
            '<button data-place="' +
            esc(p.id) +
            '"><strong>' +
            esc(p.name) +
            "</strong><small>" +
            esc(countryLabel(p)) +
            " · " +
            types[p.type] +
            "</small></button>",
        )
        .join("")
    : '<div class="empty">没有找到匹配地点</div>';
  $("results").hidden = false;
}
$("search").oninput = search;
$("search").onfocus = search;
$("search").onkeydown = (e) => {
  if (e.key === "Escape") $("results").hidden = true;
  if (e.key === "Enter") $("results").querySelector("button")?.click();
};
function account() {
  const a = S.state();
  showSheet("SHARED PASSPORT");
  $("detail").innerHTML =
    "<h2>双人空间</h2><p>" +
    esc(a.email || "本机旅行护照") +
    "</p>" +
    (a.email
      ? "<p>" +
        esc(
          a.syncing
            ? "正在同步…"
            : a.error ||
                "待同步 " +
                  a.pending +
                  " 条" +
                  (a.lastSync
                    ? " · 最近同步 " +
                      new Date(a.lastSync).toLocaleString("zh-CN")
                    : ""),
        ) +
        '</p><div class="actions">' +
        btn("sync", "立即同步", "primary") +
        btn("logout", "退出账号") +
        "</div>"
      : a.configured
        ? '<form id="loginForm"><label for="email">邮箱</label><input id="email" required type="email" autocomplete="username"><label for="password">密码</label><input id="password" required type="password" autocomplete="current-password"><div class="actions"><button class="action primary">登录并同步</button></div></form>'
        : "<p>当前记录保存在这台设备。连接项目的 Supabase 后，两个人可用各自的账号登录，共享标记和手记。</p>") +
    '<h3>个人数据存在哪里？</h3><p>用 iPhone 的 Safari 打开时，标记、日期和手记存在这台手机的 Safari「网站数据」里。关闭网页后仍会保留。要看占用空间，可到「设置 → App → Safari → 高级 → 网站数据」搜索 bestioannis.github.io。显示的大小包含离线地图和网页缓存。它们不会提交到 GitHub，也不会自动生成「文件」中的文档。清除网站数据可能删除记录，想留一份独立文件可点「导出备份」。街道底图按当前视野从 OpenFreeMap 加载公开图块。请求中只有地图区域，不包含手记、日期或标记状态。开通同步并登录后，记录也会保存在你们的 Supabase 数据库，仅两位获准成员可通过应用访问。GitHub 公开托管网页代码和地图资料。导出的备份由你保管。</p><h3>备份与恢复</h3><p>导出 JSON 可留存整本护照。导入会合并地点，相同地点使用备份中的记录。</p><div class="actions">' +
    btn("export", "导出备份") +
    btn("import", "导入备份") +
    '</div><input type="file" accept=".json,application/json" id="file" hidden><p id="account-msg" role="status"></p><h3>装到 iPhone</h3><p>在 Safari 打开网站，点分享菜单，选择「添加到主屏幕」。</p><p><a href="SOURCES.md" target="_blank" rel="noopener">地图与目的地资料来源 ↗</a></p>';
  async function perform(fn) {
    try {
      await fn();
      account();
      $("account-msg").textContent = "操作完成";
    } catch (e) {
      $("account-msg").textContent = e.message;
    }
  }
  if ($("loginForm"))
    $("loginForm").onsubmit = (e) => {
      e.preventDefault();
      perform(() => S.login($("email").value, $("password").value));
    };
  if ($("sync")) $("sync").onclick = () => perform(() => S.sync());
  if ($("logout")) $("logout").onclick = () => perform(() => S.logout());
  $("export").onclick = () => {
    const url = URL.createObjectURL(
      new Blob([S.exportBackup()], { type: "application/json" }),
    );
    const el = document.createElement("a");
    el.href = url;
    el.download = "双人旅图-" + new Date().toISOString().slice(0, 10) + ".json";
    el.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  $("import").onclick = () => $("file").click();
  $("file").onchange = async (e) => {
    const f = e.target.files[0];
    if (f)
      await perform(async () => {
        await S.importBackup(await f.text());
      });
  };
}
$("account").onclick = account;
async function boot() {
  layers();
  navigate();
  try {
    const [atlas, world, extra] = await Promise.all(
      ["atlas.json", "world.json", "extra.json"].map(async (url) => {
        const r = await fetch(url);
        if (!r.ok) throw Error(url);
        return r.json();
      }),
    );
    places = [...new Map([...atlas, ...extra].map((p) => [p.id, p])).values()];
    worldShapes = world;
    for (const p of places) {
      byId.set(p.id, p);
      p.lookup = [p.name, p.alias, p.country, p.parent, p.region]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    }
    controller = TravelMap.mount($("atlas"), {
      places,
      world,
      onSelect: chooseOnMap,
    });

    $("loading").hidden = true;
    refresh();
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("./sw.js").catch(() => {});
  } catch (e) {
    $("loading").textContent = "地图载入失败，请联网刷新。";
    console.error(e);
  }
}
boot();
