(() => {
  const STOCK_STALE_DAYS = 14;
  const PAGE = 50;

  const BUILD_PROFILE = Object.freeze({
    renderer: "28fda05f",
    schema: "fc7d95b0",
    revision: "fff0c7e6",
    profile: "7789eacd",
  });
  
  const CATEGORIES = [
    "Кровати",
    "Диваны",
    "Ergo",
    "Матрасы",
    "Кресла",
    "Подушки",
    "Одеяла",
    "Чехлы",
    "КПБ",
    "Прочее",
  ];

  const state = {
    items: [],
    q: "",
    saleOnly: false,
    cats: new Set(),
    extras: {
      bedPm: new Set(),
      sofaKind: new Set(),
      kpbKind: new Set(),
      sizes: new Set(),
      staleOnly: false,
    },
    shown: 0,
    filtered: [],
    generatedAt: "",
    publishedAt: "",
    stockIntervalSec: 1800,
    agentOnlineTtlSec: 600,
  };

  const THEME_KEY = "askona-stock-theme";
  const THEME_PREFS = ["system", "light", "dark"];

  function systemIsDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function readThemePref() {
    const stored = localStorage.getItem(THEME_KEY);
    return THEME_PREFS.includes(stored) ? stored : "system";
  }

  function resolvedTheme(pref) {
    if (pref === "light") return "light";
    if (pref === "dark") return "dark";
    return systemIsDark() ? "dark" : "light";
  }

  function applyTheme(pref) {
    const next = THEME_PREFS.includes(pref) ? pref : "system";
    const resolved = resolvedTheme(next);
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolved);
    root.dataset.theme = next;
    root.style.colorScheme = resolved;
    localStorage.setItem(THEME_KEY, next);
    const meta = document.getElementById("themeColor");
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#121214" : "#f8fafc");
    document.querySelectorAll("[data-theme-pref]").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.themePref === next));
    });
  }

  function initTheme() {
    applyTheme(readThemePref());
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystem = () => {
      if (readThemePref() === "system") applyTheme("system");
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystem);
    else mq.addListener(onSystem);
    document.querySelector(".theme-switch")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-theme-pref]");
      if (!btn) return;
      applyTheme(btn.dataset.themePref);
    });
  }

  initTheme();

  const $ = (id) => document.getElementById(id);

  function normalizeName(s) {
    return String(s || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[×хx]/gi, "*");
  }

  function daysBetween(isoDay, generatedAt) {
    if (!isoDay) return null;
    const a = new Date(`${isoDay}T00:00:00`);
    const g = generatedAt ? new Date(generatedAt) : new Date();
    if (Number.isNaN(a.getTime()) || Number.isNaN(g.getTime())) return null;
    const gDay = new Date(g.getFullYear(), g.getMonth(), g.getDate());
    return Math.floor((gDay - a) / 86400000);
  }

  /** Single place for stale-stock UI rule. Change STOCK_STALE_DAYS to tune. */
  function needsStockCheck(item, generatedAt, staleDays = STOCK_STALE_DAYS) {
    const days = daysBetween(item.modifiedDate, generatedAt);
    if (days == null) return false;
    return days >= staleDays;
  }

  function stockCheckLabel(item, generatedAt) {
    if (!needsStockCheck(item, generatedAt)) return "";
    const d = item.modifiedDate || "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "Давно не менялся · проверить";
    return `Остаток от ${m[3]}.${m[2]} · проверить`;
  }

  function normalizeSize(s) {
    const m = String(s || "").match(/(\d+)\s*\*\s*(\d+)/);
    if (!m) return "";
    return `${Number(m[1])}*${Number(m[2])}`;
  }

  function ruCount(n, one, few, many) {
    const n10 = n % 10;
    const n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
    return many;
  }

  const FEATURE_CAT = {
    кровати: "Кровати",
    "кровать откидная": "Кровати",
    диваны: "Диваны",
    ergomotion: "Ergo",
    матрасы: "Матрасы",
    кресла: "Кресла",
    "кресла массажные": "Кресла",
    подушки: "Подушки",
    одеяла: "Одеяла",
    чехлы: "Чехлы",
    "чехол пф": "Чехлы",
    наматрасники: "Чехлы",
    кпб: "КПБ",
  };

  function categoryFromFeature(feature) {
    const f = String(feature || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
    return FEATURE_CAT[f] || "Прочее";
  }

  function bedPm(name) {
    const n = name.toLowerCase();
    if (!n.startsWith("кровать")) return "";
    if (n.includes("с пм")) return "С ПМ";
    return "Без ПМ";
  }

  function sofaKind(name) {
    const n = name.toLowerCase();
    if (!n.includes("диван")) return "";
    if (n.includes("угловой")) return "Угловой";
    if (n.includes("прямой")) return "Прямой";
    return "";
  }

  function kpbKind(name, feature) {
    if (categoryFromFeature(feature) !== "КПБ") return "";
    const n = name.toLowerCase();
    if (n.includes("наволоч")) return "Наволочка";
    if (n.includes("пододеял")) return "Пододеяльник";
    return "Комплект";
  }

  function seriesOf(name) {
    const m = name.match(
      /\b(Elisa|Extra|Mira|Margot|Ральф|Лофт|Манхэттен|Classic|Serta|Ergomotion|Protect-a-Bed|Tencel)\b/i
    );
    return m ? m[1] : "";
  }

  function formatPrice(n) {
    return `${Number(n).toLocaleString("ru-RU")} ₽`;
  }

  function formatRuDateTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatAgo(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const sec = Math.round((Date.now() - d.getTime()) / 1000);
    if (sec < 45) return "только что";
    if (sec < 3600) {
      const n = Math.max(1, Math.round(sec / 60));
      return `${n} ${ruCount(n, "минуту", "минуты", "минут")} назад`;
    }
    if (sec < 86400) {
      const n = Math.max(1, Math.round(sec / 3600));
      return `${n} ${ruCount(n, "час", "часа", "часов")} назад`;
    }
    const n = Math.max(1, Math.round(sec / 86400));
    return `${n} ${ruCount(n, "день", "дня", "дней")} назад`;
  }

  function agentIsOnline(iso, ttlSec) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const ttl = Math.max(120, Number(ttlSec) || 600);
    return Date.now() - d.getTime() <= ttl * 1000;
  }

  function renderLive() {
    const stockIso = state.generatedAt;
    const beatIso = state.publishedAt || stockIso;
    const on = agentIsOnline(beatIso, state.agentOnlineTtlSec);
    const pill = $("livePill");
    const label = $("liveLabel");
    const text = $("liveText");
    if (!pill || !label || !text) return;
    pill.classList.toggle("is-on", on);
    label.textContent = on ? "Онлайн" : "Офлайн";
    const when = formatRuDateTime(stockIso);
    const ago = formatAgo(stockIso);
    const mins = Math.max(1, Math.round((Number(state.stockIntervalSec) || 1800) / 60));
    text.innerHTML = stockIso
      ? `Обновлено <time datetime="${stockIso}">${when}</time> · ${ago}<span class="live__cadence"> · каждые ${mins} мин</span>`
      : "Нет отметки обновления";
  }

  function merge(stock, sale) {
    const saleMap = new Map();
    for (const row of sale.items || []) {
      saleMap.set(normalizeName(row.name), row);
    }
    const generatedAt = stock.meta.generatedAt;
    return (stock.items || [])
      .filter((it) => Number(it.qty) > 0)
      .map((it) => {
        const saleRow = saleMap.get(normalizeName(it.name)) || null;
        const size = normalizeSize(it.size) || normalizeSize(it.name);
        return {
          ...it,
          qty: Number(it.qty) || 0,
          category: categoryFromFeature(it.feature),
          size,
          bedPm: bedPm(it.name),
          sofaKind: sofaKind(it.name),
          kpbKind: kpbKind(it.name, it.feature),
          series: (saleRow && saleRow.series) || seriesOf(it.name),
          sale: saleRow,
          stale: needsStockCheck(it, generatedAt),
          staleLabel: stockCheckLabel(it, generatedAt),
          search: normalizeName(
            [it.name, it.feature, size, saleRow && saleRow.series]
              .filter(Boolean)
              .join(" ")
          ),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }

  function tokensMatch(searchHay, query) {
    const parts = normalizeName(query).split(" ").filter(Boolean);
    return parts.every((p) => searchHay.includes(p));
  }

  function applyFilters() {
    const extras = state.extras;
    state.filtered = state.items.filter((it) => {
      if (state.q && !tokensMatch(it.search, state.q)) return false;
      if (state.saleOnly && !it.sale) return false;
      if (extras.staleOnly && !it.stale) return false;
      if (state.cats.size && !state.cats.has(it.category)) return false;
      if (extras.bedPm.size && it.category === "Кровати" && !extras.bedPm.has(it.bedPm)) {
        return false;
      }
      if (
        extras.sofaKind.size &&
        it.category === "Диваны" &&
        !extras.sofaKind.has(it.sofaKind)
      ) {
        return false;
      }
      if (extras.kpbKind.size && it.category === "КПБ" && !extras.kpbKind.has(it.kpbKind)) {
        return false;
      }
      if (extras.sizes.size && it.size && !extras.sizes.has(it.size)) return false;
      if (extras.sizes.size && !it.size) return false;
      return true;
    });
    state.shown = 0;
    $("list").innerHTML = "";
    const scroller = document.querySelector(".main");
    if (scroller) scroller.scrollTop = 0;
    fillIfNeeded();
    $("empty").hidden = state.filtered.length > 0;
    const n = state.filtered.length;
    const stale = state.filtered.filter((x) => x.stale).length;
    $("metaLine").textContent = `${n} ${ruCount(n, "товар", "товара", "товаров")} · Обухово${stale ? ` · проверить дату: ${stale}` : ""}`;
  }

  function cardHtml(it) {
    const sale = it.sale
      ? `<div class="price"><s>${formatPrice(it.sale.oldPrice)}</s><b>${formatPrice(it.sale.finalPrice)}</b> · −${it.sale.discountPercent}%</div>`
      : "";
    const tags = [
      it.category,
      it.size,
      it.bedPm,
      it.sofaKind,
      it.kpbKind,
    ]
      .filter(Boolean)
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");
    const warn = it.stale
      ? `<span class="tag tag--warn">⚠ ${escapeHtml(it.staleLabel)}</span>`
      : "";
    const saleTag = it.sale ? `<span class="tag tag--sale">Распродажа</span>` : "";
    return `<li class="card${it.sale ? " card--sale" : ""}">
      <p class="card__name">${escapeHtml(it.name)}</p>
      <div class="card__qty">${it.qty} шт</div>
      <div class="card__meta">${tags}${saleTag}${warn}</div>
      ${sale}
    </li>`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let filling = false;
  function renderMore() {
    const next = state.filtered.slice(state.shown, state.shown + PAGE);
    if (!next.length) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = next.map(cardHtml).join("");
    const list = $("list");
    while (wrap.firstChild) list.appendChild(wrap.firstChild);
    state.shown += next.length;
  }

  function fillIfNeeded() {
    if (filling) return;
    if (state.shown >= state.filtered.length) return;
    const sen = $("sentinel");
    const scroller = document.querySelector(".main");
    if (!sen || !scroller) return;
    const limit = scroller.getBoundingClientRect().bottom + 400;
    if (sen.getBoundingClientRect().top > limit) return;
    filling = true;
    renderMore();
    requestAnimationFrame(() => {
      filling = false;
      fillIfNeeded();
    });
  }

  function toggleSet(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function renderChips() {
    const box = $("desktopChips");
    box.innerHTML = CATEGORIES.map((c) => {
      const on = state.cats.has(c) ? " is-on" : "";
      return `<button type="button" class="chip${on}" data-cat="${c}">${c}</button>`;
    }).join("");
  }

  function sizesForSheet() {
    let pool = state.items;
    if (state.cats.size) {
      pool = pool.filter((i) => state.cats.has(i.category));
    }
    const counts = new Map();
    for (const i of pool) {
      if (!i.size) continue;
      counts.set(i.size, (counts.get(i.size) || 0) + 1);
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"))
      .slice(0, 24)
      .map((x) => x[0]);
    for (const s of state.extras.sizes) {
      if (!top.includes(s)) top.push(s);
    }
    return top;
  }

  function extraButtons(title, values, setName) {
    const set = state.extras[setName];
    const opts = values
      .map((v) => {
        const on = set.has(v) ? " is-on" : "";
        return `<button type="button" class="chip${on}" data-extra="${setName}" data-val="${v}">${v}</button>`;
      })
      .join("");
    return `<div class="fg"><h3>${title}</h3><div class="opts">${opts}</div></div>`;
  }

  function renderSheet() {
    $("sheetBody").innerHTML = `
      <div class="fg"><h3>Категории</h3><div class="opts" id="sheetCats"></div></div>
      ${extraButtons("Кровати", ["С ПМ", "Без ПМ"], "bedPm")}
      ${extraButtons("Диваны", ["Прямой", "Угловой"], "sofaKind")}
      ${extraButtons("КПБ", ["Комплект", "Наволочка", "Пододеяльник"], "kpbKind")}
      ${extraButtons("Частые размеры", sizesForSheet(), "sizes")}
      <div class="fg"><h3>Дата</h3><div class="opts">
        <button type="button" class="chip${state.extras.staleOnly ? " is-on" : ""}" id="staleBtn">Проверить дату</button>
      </div></div>
    `;
    $("sheetCats").innerHTML = CATEGORIES.map((c) => {
      const on = state.cats.has(c) ? " is-on" : "";
      return `<button type="button" class="chip${on}" data-cat="${c}">${c}</button>`;
    }).join("");
  }

  function openSheet() {
    renderSheet();
    $("sheet").hidden = false;
  }

  function closeSheet() {
    $("sheet").hidden = true;
  }

  function resetAll() {
    state.q = "";
    state.saleOnly = false;
    state.cats.clear();
    state.extras.bedPm.clear();
    state.extras.sofaKind.clear();
    state.extras.kpbKind.clear();
    state.extras.sizes.clear();
    state.extras.staleOnly = false;
    $("q").value = "";
    $("saleBtn").setAttribute("aria-pressed", "false");
    renderChips();
    applyFilters();
  }

  function dataUrl(file) {
    return `./data/${file}?t=${Date.now()}`;
  }

  function fetchJson(file, optional = false) {
    return fetch(dataUrl(file), { cache: "no-store" }).then((r) => {
      if (!r.ok) {
        if (optional) return null;
        throw new Error(`${file}: ${r.status}`);
      }
      return r.json();
    });
  }

  function applyStatus(status, stock) {
    const fromStock = stock && stock.meta && stock.meta.generatedAt;
    state.generatedAt = (status && status.generatedAt) || fromStock || state.generatedAt;
    state.publishedAt = (status && status.publishedAt) || state.generatedAt;
    if (status && status.stockIntervalSec) state.stockIntervalSec = status.stockIntervalSec;
    if (status && status.agentOnlineTtlSec) state.agentOnlineTtlSec = status.agentOnlineTtlSec;
  }

  async function loadCatalog(status) {
    const [stock, sale] = await Promise.all([
      fetchJson("stock.json"),
      fetchJson("sale.json"),
    ]);
    applyStatus(status, stock);
    state.items = merge(stock, sale);
    renderLive();
    renderChips();
    if ($("sheet") && !$("sheet").hidden) renderSheet();
    applyFilters();
  }

  async function boot() {
    const status = await fetchJson("status.json", true).catch(() => null);
    await loadCatalog(status);
  }

  let ticking = false;
  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const status = await fetchJson("status.json", true).catch(() => null);
      if (status) {
        const catalogChanged =
          Boolean(status.generatedAt) && status.generatedAt !== state.generatedAt;
        if (catalogChanged) await loadCatalog(status);
        else applyStatus(status, null);
      }
      renderLive();
    } catch (err) {
      console.error(err);
      renderLive();
    } finally {
      ticking = false;
    }
  }

  let t = 0;
  $("q").addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = $("q").value;
      applyFilters();
    }, 70);
  });

  $("resetBtn").addEventListener("click", resetAll);
  $("saleBtn").addEventListener("click", () => {
    state.saleOnly = !state.saleOnly;
    $("saleBtn").setAttribute("aria-pressed", String(state.saleOnly));
    applyFilters();
  });
  $("filtersBtn").addEventListener("click", openSheet);
  $("sheetClose").addEventListener("click", closeSheet);
  $("sheetBackdrop").addEventListener("click", closeSheet);

  $("desktopChips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    toggleSet(state.cats, b.dataset.cat);
    renderChips();
    applyFilters();
  });

  $("sheetBody").addEventListener("click", (e) => {
    const cat = e.target.closest("[data-cat]");
    if (cat) {
      toggleSet(state.cats, cat.dataset.cat);
      renderSheet();
      renderChips();
      applyFilters();
      return;
    }
    const extra = e.target.closest("[data-extra]");
    if (extra) {
      toggleSet(state.extras[extra.dataset.extra], extra.dataset.val);
      renderSheet();
      applyFilters();
      return;
    }
    if (e.target.id === "staleBtn") {
      state.extras.staleOnly = !state.extras.staleOnly;
      renderSheet();
      applyFilters();
    }
  });

  const scroller = document.querySelector(".main");
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((x) => x.isIntersecting)) fillIfNeeded();
    },
    { root: scroller, rootMargin: "400px 0px" }
  );
  io.observe($("sentinel"));

  boot().catch((err) => {
    $("metaLine").textContent = "Не удалось загрузить данные. Запустите локальный сервер.";
    const label = $("liveLabel");
    const text = $("liveText");
    if (label) label.textContent = "Офлайн";
    if (text) text.textContent = "Нет данных";
    console.error(err);
  });

  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    tick();
  }, 30000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });

  window.addEventListener("pageshow", (e) => {
    if (e.persisted) tick();
  });
})();
