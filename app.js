/* =========================================================================
   國際住宅數據庫 — Home + Topic Router + Definitions Explorer
   - Hash 路由：#/, #/definitions
   - 首頁顯示主題卡（部分 Coming soon）
   - Definitions Explorer：讀 CSV + 搜尋/標籤/比較
   ======================================================================= */

/** CSV 路徑（目前只用於 "各國社宅定義" 主題） */
const CSV_URL = "https://raw.githubusercontent.com/PN0929/globalhousingdata/3c9bdf0d7ad4bd2cc65b670a45ddc99ffc0d3de9/data/social_housing_definitions_clean_utf8.csv";

/** 主題清單（你之後要開新主題，只要把 available 改 true 並在 router 裡加對應渲染器） */
const TOPICS = [
  {
    slug: "definitions",
    emoji: "🏘️",
    title: "各國社宅定義",
    desc: "快速查找、比較各國社會住宅的稱呼與定義",
    available: true,
    cta: "開始探索"
  },
  {
    slug: "conditions",
    emoji: "📊",
    title: "居住條件（HC）",
    desc: "面積、人均空間、設備可近性等指標",
    available: false,
    cta: "即將推出"
  },
  {
    slug: "market",
    emoji: "🏠",
    title: "住宅市場（HM）",
    desc: "持有/租賃結構、房屋型態、價格與供給",
    available: false,
    cta: "即將推出"
  },
  {
    slug: "policy",
    emoji: "🧩",
    title: "住宅政策（PH）",
    desc: "補貼、租金管制、社宅供給、稅務與貸款措施",
    available: false,
    cta: "即將推出"
  }
];

/** 快速標籤偵測規則（用於 definitions） */
const TAG_RULES = [
  { key: "HasPublicProvider",    label: "公部門提供",     regex: /(public|municipal|state[-\s]?owned|government|local authority|authorities)/i },
  { key: "HasNonProfitProvider", label: "非營利/合作社",   regex: /(non[-\s]?profit|co-?operative|cooperative)/i },
  { key: "HasBelowMarketRent",   label: "低於市價/租控",    regex: /(below market|rent cap|capped rent|regulated rent|moderate rent)/i },
  { key: "HasIncomeTargeting",   label: "收入審查/目標族群", regex: /(income limit|low[-\s]?income|vulnerable|eligible|means[-\s]?test)/i },
  { key: "HasSubsidyOrLoans",    label: "補貼/貸款/稅優惠",  regex: /(subsid(y|ies)|grant(s)?|loan(s)?|tax|preferential rate)/i },
  { key: "LegalDefined",         label: "法律定義",         regex: /(law|act|defined in law|regulation|legal)/i },
];

/* ======================  Utility  ====================== */
const $  = (q, el = document) => el.querySelector(q);
const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

function escapeHTML(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function shortText(s, n=180) {
  if (!s) return "";
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= n) return clean;
  const cut = clean.slice(0, n);
  const lastDot = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("。"));
  return (lastDot > 60 ? cut.slice(0, lastDot+1) : cut + "…");
}
function csvParse(text) {
  // Simple CSV parser (handles commas inside quotes)
  const rows = [];
  let cur = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i+1];
    if (inQ) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { cell += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === "," ) { cur.push(cell); cell=""; }
      else if (c === "\n") { cur.push(cell); rows.push(cur); cur=[]; cell=""; }
      else if (c === "\r") { /* ignore */ }
      else { cell += c; }
    }
  }
  if (cell || cur.length) { cur.push(cell); rows.push(cur); }
  return rows;
}

/* ======================  Router  ====================== */
window.addEventListener("DOMContentLoaded", () => {
  renderRoute();
  window.addEventListener("hashchange", renderRoute);
});

function renderRoute() {
  const hash = (location.hash || "#/").replace(/^#/, "");
  const main = $(".main-content");
  main.innerHTML = ""; // clear

  // nav active
  $$(".topnav .nav-link").forEach(a => a.classList.remove("active"));
  if (hash.startsWith("/definitions")) {
    $$(".topnav .nav-link").find(a => a.getAttribute("href")==="#/definitions")?.classList.add("active");
    renderDefinitions(main);
  } else {
    $$(".topnav .nav-link").find(a => a.getAttribute("href")==="#/")?.classList.add("active");
    renderHome(main);
  }
}

/* ======================  Home ====================== */
function renderHome(root) {
  const wrap = document.createElement("section");
  wrap.className = "home fade-in";
  wrap.innerHTML = `
    <div class="home-hero">
      <h2>主題總覽</h2>
      <p>我們會持續更新更多住宅主題。現在可以先探索「各國社宅定義」。</p>
    </div>
    <div class="topics" id="topicsGrid"></div>
  `;
  root.appendChild(wrap);

  const grid = $("#topicsGrid", wrap);
  grid.innerHTML = TOPICS.map(t => topicCardHTML(t)).join("");
  grid.addEventListener("click", e => {
    const card = e.target.closest(".topic-card");
    if (!card) return;
    const slug = card.dataset.slug;
    const topic = TOPICS.find(tt => tt.slug === slug);
    if (topic?.available) {
      location.hash = `#/${slug}`;
    }
  });
}
function topicCardHTML(t) {
  const cls = `topic-card ${t.available ? "available" : "coming"}`;
  return `
    <article class="${cls}" data-slug="${t.slug}">
      <span class="topic-badge">${t.available ? "" : "即將推出"}</span>
      <div class="topic-emoji">${t.emoji}</div>
      <div class="topic-title">${escapeHTML(t.title)}</div>
      <div class="topic-desc">${escapeHTML(t.desc)}</div>
      <div class="topic-actions">
        <button class="btn ${t.available ? "primary" : ""}">
          ${t.cta}
        </button>
      </div>
    </article>
  `;
}

/* ======================  Definitions Explorer ====================== */
const DefState = {
  data: [],
  filtered: [],
  selectedTags: new Set(),
  selectedCountry: "ALL",
  searchText: "",
  compareSet: new Set(),
};

async function renderDefinitions(root) {
  const section = document.createElement("section");
  section.id = "definitionsExplorer";
  section.innerHTML = `
    <div class="controls fade-in">
      <div class="searchbox">
        <input id="searchInput" type="text" placeholder="搜尋國家、稱呼或定義關鍵字…" />
      </div>
      <div class="selectbox">
        <select id="countrySelect"></select>
      </div>
      <div class="tags" id="tagBar"></div>
    </div>

    <div id="cardsWrap" class="cards fade-in"></div>

    <div id="emptyState" class="empty" style="display:none;">
      找不到符合條件的結果，換個關鍵字或取消一些標籤看看～
    </div>

    <aside id="compareDrawer" class="compare-drawer">
      <div class="compare-title">比較（最多 3 國）</div>
      <div id="compareList"></div>
      <div class="compare-actions">
        <button class="btn" id="btnClearCompare">清空</button>
        <button class="btn primary" id="btnCopyCompare">複製摘要</button>
      </div>
    </aside>
  `;
  root.appendChild(section);

  await loadDefinitionsCSV();
  buildDefControls();
  renderDefAll();
}

async function loadDefinitionsCSV() {
  try {
    const resp = await fetch(CSV_URL, { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    const rows = csvParse(text);
    if (!rows.length) throw new Error("CSV 空白");
    const headers = rows[0].map(h => h.trim());
    const idxCountry = headers.findIndex(h => /country/i.test(h));
    const idxTerms   = headers.findIndex(h => /terms?used/i.test(h));
    const idxDef     = headers.findIndex(h => /definition/i.test(h));
    if (idxCountry < 0 || idxDef < 0) throw new Error("缺少必要欄位 (Country/Definition)");

    const data = rows.slice(1).map(r => {
      const country = (r[idxCountry] || "").trim();
      const terms   = (idxTerms >= 0 ? r[idxTerms] : "" ) || "";
      const def     = (r[idxDef] || "").trim();
      const flags = {};
      const textForMatch = `${terms}\n${def}`;
      TAG_RULES.forEach(rule => flags[rule.key] = rule.regex.test(textForMatch));
      return {
        Country: country,
        TermsUsed: terms,
        Definition: def,
        short: shortText(def, 200),
        flags
      };
    }).filter(d => d.Country && d.Definition);

    DefState.data = data;
    DefState.filtered = data.slice();
  } catch (err) {
    $("#cardsWrap").innerHTML = `
      <div class="empty">
        無法讀取 CSV（${err.message}）。<br/>
        請確認檔案位於 <code>${CSV_URL}</code>。
      </div>
    `;
  }
}

function buildDefControls() {
  const uniqueCountries = Array.from(new Set(DefState.data.map(d => d.Country))).sort((a,b)=>a.localeCompare(b));
  const sel = $("#countrySelect");
  sel.innerHTML = `<option value="ALL">全部國家</option>` + uniqueCountries.map(c => `<option>${escapeHTML(c)}</option>`).join("");
  sel.addEventListener("change", e => {
    DefState.selectedCountry = e.target.value;
    applyDefFilters();
  });

  $("#searchInput").addEventListener("input", e => {
    DefState.searchText = e.target.value.trim();
    applyDefFilters();
  });

  const tagBar = $("#tagBar");
  tagBar.innerHTML = TAG_RULES.map(t =>
    `<button class="tag" data-key="${t.key}">${t.label}</button>`
  ).join("");
  tagBar.addEventListener("click", e => {
    const btn = e.target.closest(".tag");
    if (!btn) return;
    const key = btn.dataset.key;
    if (DefState.selectedTags.has(key)) DefState.selectedTags.delete(key);
    else DefState.selectedTags.add(key);
    btn.classList.toggle("active");
    applyDefFilters();
  });

  $("#btnClearCompare").addEventListener("click", () => {
    DefState.compareSet.clear();
    renderDefCompare();
    $$(".card input[type='checkbox']").forEach(cb => (cb.checked = false));
  });
  $("#btnCopyCompare").addEventListener("click", copyDefCompare);
}

function applyDefFilters() {
  const q = DefState.searchText.toLowerCase();
  DefState.filtered = DefState.data.filter(d => {
    if (DefState.selectedCountry !== "ALL" && d.Country !== DefState.selectedCountry) return false;
    for (const key of DefState.selectedTags) if (!d.flags[key]) return false;
    if (q) {
      const hay = (d.Country + " " + d.TermsUsed + " " + d.Definition).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  renderDefCards();
}

function renderDefAll() {
  renderDefCards();
  renderDefCompare();
}

function renderDefCards() {
  const wrap = $("#cardsWrap");
  const empty = $("#emptyState");
  if (!DefState.filtered.length) {
    wrap.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  wrap.innerHTML = DefState.filtered.map((d, idx) => defCardHTML(d, idx)).join("");
  wrap.addEventListener("click", onDefCardClick, { once: true });
}

function defCardHTML(d, idx) {
  const chips = TAG_RULES
    .filter(t => d.flags[t.key])
    .slice(0, 3)
    .map(t => `<span class="chip">${t.label}</span>`)
    .join("");

  const checked = DefState.compareSet.has(d.Country) ? "checked" : "";
  const safeCountry = escapeHTML(d.Country);
  const safeTerms   = escapeHTML(d.TermsUsed || "—");
  const safeShort   = escapeHTML(d.short);
  const safeFull    = escapeHTML(d.Definition);

  return `
    <article class="card" data-idx="${idx}">
      <div class="card-header">
        <div>
          <div class="country">${safeCountry}</div>
          <div class="terms">${safeTerms}</div>
        </div>
        <label class="mini">
          <input type="checkbox" class="cmp" data-country="${safeCountry}" ${checked} />
          加入比較
        </label>
      </div>
      <div class="summary">${safeShort}</div>
      <div class="actions">
        <button class="btn toggle">展開全文</button>
        <div class="chips">${chips}</div>
      </div>
      <div class="fulltext" style="display:none;">${safeFull}</div>
    </article>
  `;
}

function onDefCardClick(e) {
  const btn = e.target.closest(".toggle");
  const cmp = e.target.closest("input.cmp");
  if (btn) {
    const card = e.target.closest(".card");
    const full = $(".fulltext", card);
    const open = full.style.display !== "none";
    full.style.display = open ? "none" : "block";
    btn.textContent = open ? "展開全文" : "收合全文";
  } else if (cmp) {
    const country = cmp.dataset.country;
    if (cmp.checked) {
      if (DefState.compareSet.size >= 3) {
        cmp.checked = false;
        alert("一次最多比較 3 個國家");
        return;
      }
      DefState.compareSet.add(country);
    } else {
      DefState.compareSet.delete(country);
    }
    renderDefCompare();
  }
  $("#cardsWrap").addEventListener("click", onDefCardClick, { once: true });
}

function renderDefCompare() {
  const drawer = $("#compareDrawer");
  const list = $("#compareList");
  const arr = Array.from(DefState.compareSet);

  if (!arr.length) {
    drawer.classList.remove("open");
    list.innerHTML = `<div class="mini" style="color:#64748b;">尚未選擇國家。勾選卡片右上「加入比較」。</div>`;
    return;
  }
  drawer.classList.add("open");

  const items = arr.map((c) => {
    const d = DefState.data.find(x => x.Country === c);
    const bullets = deriveDefBullets(d).map(b => `• ${escapeHTML(b)}`).join("<br>");
    return `
      <div class="compare-item">
        <h4>${escapeHTML(d.Country)}</h4>
        <div class="mini"><strong>稱呼：</strong>${escapeHTML(d.TermsUsed || "—")}</div>
        <div class="mini" style="margin-top:4px">${bullets}</div>
      </div>
    `;
  }).join("");

  list.innerHTML = items;
}

function deriveDefBullets(d) {
  const out = [];
  if (d.flags.HasPublicProvider) out.push("由公部門/地方政府提供或管理");
  if (d.flags.HasNonProfitProvider) out.push("非營利/合作社為主要提供者之一");
  if (d.flags.HasBelowMarketRent) out.push("租金低於市價或受管制");
  if (d.flags.HasIncomeTargeting) out.push("針對低收入/弱勢族群，需收入審查");
  if (d.flags.HasSubsidyOrLoans) out.push("提供補貼/貸款/稅務優惠等支持");
  if (d.flags.LegalDefined) out.push("有法律/法規上的明確定義");
  if (!out.length) out.push(shortText(d.Definition, 120));
  return out.slice(0, 5);
}

async function copyDefCompare() {
  try {
    const arr = Array.from(DefState.compareSet);
    if (!arr.length) return;
    const blocks = arr.map(c => {
      const d = DefState.data.find(x => x.Country === c);
      const lines = [
        `國家：${d.Country}`,
        `稱呼：${d.TermsUsed || "—"}`,
        `重點：${deriveDefBullets(d).join("；")}`,
      ];
      return lines.join("\n");
    });
    await navigator.clipboard.writeText(blocks.join("\n\n"));
    alert("已複製比較摘要！");
  } catch {
    alert("複製失敗，請手動選取文字。");
  }
}
