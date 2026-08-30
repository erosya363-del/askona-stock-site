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

  const CAT_IMGS = {
    Кровати: "assets/cats/krovati.png",
    Диваны: "assets/cats/divany.png",
    Ergo: "assets/cats/ergo.png",
    Матрасы: "assets/cats/matrasy.png",
    Кресла: "assets/cats/kresla.png",
    Подушки: "assets/cats/podushki.png",
    Одеяла: "assets/cats/odeyala.png",
    Чехлы: "assets/cats/chehly.png",
    КПБ: "assets/cats/kpb.png",
    Прочее: "assets/cats/prochee.png",
  };

  function catChipHtml(c, on) {
    const src = CAT_IMGS[c] || CAT_IMGS["Прочее"];
    return `<button type="button" class="cat${on ? " is-on" : ""}" data-cat="${escapeHtml(c)}" title="${escapeHtml(c)}" aria-label="${escapeHtml(c)}" aria-pressed="${on}"><span class="cat__pic"><img src="${src}" alt="" width="56" height="56" draggable="false"></span><span class="cat__name">${escapeHtml(c)}</span></button>`;
  }

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

  /** Strip leading (арх)/(инд)/(н-а) style prefixes so first real word is visible */
  function cleanProductName(name) {
    return String(name || "")
      .trim()
      .replace(/^(\([^)]*\)\s*)+/g, "")
      .trim();
  }

  /**
   * Category from product name (first significant word), not from 1C feature.
   * Order matters: more specific prefixes first.
   */
  function categoryFromName(name) {
    const n = cleanProductName(name)
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
    if (!n) return "Прочее";

    // Ergo / adjustable bases & accessories (brand is distinctive)
    if (n.includes("ergomotion")) return "Ergo";

    // Beds
    if (n.startsWith("кровать") || n.startsWith("кроват")) return "Кровати";

    // Sofas (including sofa-beds)
    if (n.startsWith("диван")) return "Диваны";

    // Armchairs (including armchair-beds)
    if (n.startsWith("кресло") || n.startsWith("кресла")) return "Кресла";

    // Mattresses
    if (n.startsWith("матрас")) return "Матрасы";

    // Pillows
    if (n.startsWith("подушк")) return "Подушки";

    // Blankets
    if (n.startsWith("одеял")) return "Одеяла";

    // Covers / mattress toppers
    if (
      n.startsWith("чехол") ||
      n.startsWith("чехлы") ||
      n.startsWith("наматрасник") ||
      n.startsWith("топпер")
    )
      return "Чехлы";

    // Bedding sets & parts
    if (
      n.startsWith("кпб") ||
      n.startsWith("простын") ||
      n.startsWith("наволоч") ||
      n.startsWith("пододеял") ||
      n.startsWith("комплект постель")
    )
      return "КПБ";

    return "Прочее";
  }

  function bedPm(name) {
    const n = cleanProductName(name).toLowerCase().replace(/ё/g, "е");
    if (!n.startsWith("кровать")) return "";
    if (n.includes("с пм")) return "С ПМ";
    return "Без ПМ";
  }

  function sofaKind(name) {
    const n = cleanProductName(name).toLowerCase().replace(/ё/g, "е");
    if (!n.includes("диван")) return "";
    if (n.includes("угловой")) return "Угловой";
    if (n.includes("прямой")) return "Прямой";
    return "";
  }

  function kpbKind(name) {
    const n = cleanProductName(name).toLowerCase().replace(/ё/g, "е");
    if (categoryFromName(name) !== "КПБ") return "";
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
          category: categoryFromName(it.name),
          size,
          bedPm: bedPm(it.name),
          sofaKind: sofaKind(it.name),
          kpbKind: kpbKind(it.name),
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
    syncFilterBtn();
  }

  function cardHtml(it) {
    const sale = it.sale
      ? `<div class="price"><s>${formatPrice(it.sale.oldPrice)}</s><b>${formatPrice(it.sale.finalPrice)}</b> · −${it.sale.discountPercent}%</div>`
      : "";
    const tags = [it.size, it.bedPm, it.sofaKind, it.kpbKind]
      .filter(Boolean)
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
      .join("");
    const warn = it.stale
      ? `<span class="tag tag--warn">⚠ ${escapeHtml(it.staleLabel)}</span>`
      : "";
    const saleTag = it.sale ? `<span class="tag tag--sale">Распродажа</span>` : "";
    const nameAttr = escapeHtml(it.name);
    const meta = `${warn}${saleTag}${tags}`;
    return `<li class="card${it.sale ? " card--sale" : ""}">
      <div class="card__lead">
        <p class="card__name">${nameAttr}</p>
        ${meta ? `<div class="card__meta">${meta}</div>` : ""}
      </div>
      <div class="card__qty">${it.qty} шт</div>
      <button type="button" class="card__copy" data-copy="${nameAttr}" title="Скопировать название" aria-label="Скопировать название">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10" stroke-linecap="round"/></svg>
      </button>
      ${sale}
    </li>`;
  }

  function filtersActive() {
    const e = state.extras;
    return (
      e.bedPm.size > 0 ||
      e.sofaKind.size > 0 ||
      e.kpbKind.size > 0 ||
      e.sizes.size > 0 ||
      e.staleOnly
    );
  }

  function syncFilterBtn() {
    const btn = $("filtersBtn");
    if (!btn) return;
    const on = filtersActive();
    btn.setAttribute("aria-pressed", String(on));
    btn.classList.toggle("is-active", on);
    const n =
      state.extras.bedPm.size +
      state.extras.sofaKind.size +
      state.extras.kpbKind.size +
      state.extras.sizes.size +
      (state.extras.staleOnly ? 1 : 0);
    btn.textContent = on ? `Фильтры · ${n}` : "Фильтры";
  }

  async function copyName(text, btn) {
    const value = String(text || "").trim();
    if (!value) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      if (btn) {
        btn.classList.add("is-copied");
        const prev = btn.getAttribute("title");
        btn.setAttribute("title", "Скопировано");
        setTimeout(() => {
          btn.classList.remove("is-copied");
          if (prev) btn.setAttribute("title", prev);
        }, 1200);
      }
    } catch (err) {
      console.error(err);
    }
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
    box.innerHTML = CATEGORIES.map((c) => catChipHtml(c, state.cats.has(c))).join("");
    requestAnimationFrame(syncCatsNav);
  }

  function syncCatsNav() {
    const track = $("desktopChips");
    const next = $("catsNext");
    const prev = $("catsPrev");
    if (!track || !next || !prev) return;
    const max = track.scrollWidth - track.clientWidth;
    const x = track.scrollLeft;
    prev.hidden = x <= 4;
    next.hidden = max <= 4 || x >= max - 4;
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
        return `<button type="button" class="chip${on}" data-extra="${setName}" data-val="${escapeHtml(v)}">${escapeHtml(v)}</button>`;
      })
      .join("");
    return `<div class="fg"><h3>${title}</h3><div class="opts">${opts}</div></div>`;
  }

  function renderSheet() {
    $("sheetBody").innerHTML = `
      ${extraButtons("Кровати", ["С ПМ", "Без ПМ"], "bedPm")}
      ${extraButtons("Диваны", ["Прямой", "Угловой"], "sofaKind")}
      ${extraButtons("КПБ", ["Комплект", "Наволочка", "Пододеяльник"], "kpbKind")}
      ${extraButtons("Частые размеры", sizesForSheet(), "sizes")}
      <div class="fg"><h3>Дата</h3><div class="opts">
        <button type="button" class="chip${state.extras.staleOnly ? " is-on" : ""}" id="staleBtn">Проверить дату</button>
      </div></div>
    `;
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
    syncSearchFill();
    closeSuggest();
    renderChips();
    applyFilters();
  }

  const SEARCH_KEY = "askona-stock-recent-q";
  const SEARCH_HINTS = [
    "матрас Serta",
    "кровать domenico",
    "подушка Alpha",
    "чехол 180",
    "ergomotion",
    "Elisa 160",
  ];
  const SEARCH_POPULAR = ["basic", "ergomotion", "comfort plus", "Elisa"];
  const SEARCH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.2"/><path d="M16 16.5 20 20.5" stroke-linecap="round"/></svg>';

  function readRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(SEARCH_KEY) || "[]");
      return Array.isArray(raw) ? raw.map(String).filter(Boolean).slice(0, 4) : [];
    } catch {
      return [];
    }
  }

  function rememberQuery(q) {
    const v = String(q || "").trim();
    if (v.length < 2) return;
    const next = [v, ...readRecent().filter((x) => normalizeName(x) !== normalizeName(v))].slice(
      0,
      4
    );
    localStorage.setItem(SEARCH_KEY, JSON.stringify(next));
  }

  function syncSearchFill() {
    const box = $("searchBox");
    if (box) box.classList.toggle("is-filled", Boolean($("q").value.trim()));
  }

  function suggestItems() {
    const recent = readRecent();
    return recent.length
      ? { title: "Недавние запросы", items: recent }
      : { title: "Популярные запросы", items: SEARCH_POPULAR };
  }

  function renderSuggest() {
    const { title, items } = suggestItems();
    const titleEl = $("searchDropTitle");
    const list = $("searchSuggest");
    if (titleEl) titleEl.textContent = title;
    if (!list) return;
    list.innerHTML = items
      .slice(0, 4)
      .map(
        (q) =>
          `<li><button type="button" role="option" data-suggest="${escapeHtml(q)}">${SEARCH_ICON}<span>${escapeHtml(q)}</span></button></li>`
      )
      .join("");
  }

  function openSuggest() {
    const drop = $("searchDrop");
    if (!drop) return;
    renderSuggest();
    drop.hidden = false;
    $("q").setAttribute("aria-expanded", "true");
  }

  function closeSuggest() {
    const drop = $("searchDrop");
    if (!drop) return;
    drop.hidden = true;
    $("q").setAttribute("aria-expanded", "false");
  }

  function applyQuery(q) {
    $("q").value = q;
    state.q = q;
    rememberQuery(q);
    syncSearchFill();
    closeSuggest();
    applyFilters();
  }

  function initSearchHint() {
    const input = $("q");
    const hint = $("searchHint");
    if (!input || !hint) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let i = 0;
    let pos = 0;
    let deleting = false;
    let timer = 0;

    function step() {
      syncSearchFill();
      if (input.value) {
        hint.textContent = "";
        hint.classList.add("is-empty");
        timer = setTimeout(step, 400);
        return;
      }
      hint.classList.remove("is-empty");
      const word = SEARCH_HINTS[i];
      if (reduced) {
        hint.textContent = word;
        timer = setTimeout(() => {
          i = (i + 1) % SEARCH_HINTS.length;
          step();
        }, 2800);
        return;
      }
      if (!deleting) {
        pos += 1;
        hint.textContent = word.slice(0, pos);
        if (pos >= word.length) {
          deleting = true;
          timer = setTimeout(step, 1500);
          return;
        }
        timer = setTimeout(step, 72);
        return;
      }
      pos -= 1;
      hint.textContent = word.slice(0, Math.max(0, pos));
      if (pos <= 0) {
        deleting = false;
        i = (i + 1) % SEARCH_HINTS.length;
        timer = setTimeout(step, 240);
        return;
      }
      timer = setTimeout(step, 38);
    }
    step();
    return () => clearTimeout(timer);
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
    syncSearchFill();
    clearTimeout(t);
    t = setTimeout(() => {
      state.q = $("q").value;
      applyFilters();
    }, 70);
  });
  $("q").addEventListener("focus", openSuggest);
  $("q").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSuggest();
      $("q").blur();
      return;
    }
    if (e.key === "Enter") {
      rememberQuery($("q").value);
      closeSuggest();
    }
  });
  $("q").addEventListener("blur", () => {
    rememberQuery($("q").value);
  });
  $("searchSuggest").addEventListener("mousedown", (e) => {
    const btn = e.target.closest("[data-suggest]");
    if (!btn) return;
    e.preventDefault();
    applyQuery(btn.dataset.suggest);
  });
  document.addEventListener("pointerdown", (e) => {
    if (e.target.closest("#searchBox")) return;
    closeSuggest();
  });
  initSearchHint();

  const catsTrack = $("desktopChips");
  $("catsNext").addEventListener("click", () => {
    catsTrack.scrollBy({ left: 180, behavior: "smooth" });
  });
  $("catsPrev").addEventListener("click", () => {
    catsTrack.scrollBy({ left: -180, behavior: "smooth" });
  });
  catsTrack.addEventListener("scroll", () => syncCatsNav(), { passive: true });
  window.addEventListener("resize", syncCatsNav);

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

  $("list").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    copyName(btn.getAttribute("data-copy"), btn);
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

  /**
   * Forward wheel from header / empty page chrome into .main so scrolling
   * works anywhere on the viewport (including near the scrollbar edge).
   */
  function forwardWheel(e) {
    if (!scroller) return;
    if (e.defaultPrevented) return;
    // Let native scroll inside sheet / inputs / the scroller itself
    if (e.target.closest(".main, .sheet, input, textarea, select, [contenteditable], .search__drop"))
      return;
    if (e.target.closest(".cats__track") && Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
    const max = scroller.scrollHeight - scroller.clientHeight;
    if (max <= 0) return;
    const next = Math.max(0, Math.min(max, scroller.scrollTop + e.deltaY));
    if (next !== scroller.scrollTop) {
      scroller.scrollTop = next;
      e.preventDefault();
    }
  }
  window.addEventListener("wheel", forwardWheel, { passive: false });

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

  /* ——— embedded mark (not an external asset) ——— */
  const _w = [
  "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"
].join("");

  function mountMark() {
    if (document.getElementById("yaf-wm")) return;
    const el = document.createElement("div");
    el.id = "yaf-wm";
    el.setAttribute("aria-hidden", "true");
    el.className = "yaf-wm";
    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.src = "data:image/png;base64," + _w;
    el.appendChild(img);
    document.body.appendChild(el);
  }
  mountMark();

})();
