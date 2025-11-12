// app.js — MVP 熱修穩定版：避免整頁中斷、圖表確保顯示、PH 僅做可數值化檔

/***** GitHub 設定 *****/
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO  = "globalhousingdata";
const GITHUB_REF   = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR   = "OECD DATA";

/***** 常數與別名 *****/
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];
const COLUMN_ALIASES = {
  country: ["location","loc","country","country name","country_name","countryname","cou","geo","ref_area","area","economy","countrycode","country code","country_code"],
  year:    ["time","year","time period","time_period","timeperiod","reference period","ref_period","period","date","ref year","ref_year"],
  value:   ["value","obs_value","obs value","val","indicator value","data","amount","measure","obs","estimate","est"]
};

/***** PH 主題 allowlist（MVP 只視覺化這些）*****/
const PH_NUMERIC_ALLOWLIST = new Set([
  "PH2-1-Public-spending-support-to-homebuyers.xlsx",
  "PH3-1-Public-spending-on-housing-allowances.xlsx",
  "PH3-3-Recipients-payment-rates-housing-allowances.xlsx",
  "PH4-1-Public-spending-social-rental-housing.xlsx",
  "PH4-2-Social-rental-housing-stock.xlsx"
]);

/***** 狀態 *****/
let currentFilter = "all"; // all | HC | HM | PH
let allFiles = [];
let currentFile = null;
let workbook = null;

let currentChart = null;

// 一般模式（HC/HM）
let rawRows = [];
let rawKeys = null; // {countryKey, yearKey, valueKey}

// PH 模式（長表）
let normRows = []; // {country, year|null, value:number}
let phViewMode = "top"; // top | bottom | all

/***** DOM *****/
const datasetListEl        = document.getElementById("datasetList");
const mainChartEl          = document.getElementById("mainChart");
const dataFiltersEl        = document.getElementById("dataFilters");
const dataTableEl          = document.getElementById("dataTable");
const statisticsPanelEl    = document.getElementById("statisticsPanel");
const chartTypeSelect      = document.getElementById("chartType");
const downloadBtn          = document.getElementById("downloadBtn");
const currentDatasetTitleEl= document.getElementById("currentDatasetTitle");
const welcomeScreenEl      = document.getElementById("welcomeScreen");
const visualizationAreaEl  = document.getElementById("visualizationArea");
const lastUpdateEl         = document.getElementById("lastUpdate");

/* 初始化 */
document.addEventListener("DOMContentLoaded", () => {
  bindSidebarFilterButtons();
  loadGitHubList();
  bindGlobals();
  setLastUpdateToday();
});

/* 安全輔助：顯示錯誤訊息在右側 */
function showError(msg) {
  ensureVizShown();
  clearMain();
  const box = document.createElement("div");
  box.className = "stat-card";
  box.style.gridColumn = "1 / -1";
  box.style.color = "#ef4444";
  box.textContent = msg || "發生錯誤";
  statisticsPanelEl.innerHTML = "";
  statisticsPanelEl.appendChild(box);
  console.error("[app] ", msg);
}

/* 顯示可視化區域（確保畫布可用） */
function ensureVizShown() {
  if (welcomeScreenEl) welcomeScreenEl.style.display = "none";
  if (visualizationAreaEl) {
    visualizationAreaEl.style.display = "block";     // 強制 block
    visualizationAreaEl.hidden = false;              // 同步 hidden 狀態
  }
}

/* 清除主區塊 */
function clearMain() {
  if (currentChart) { try { currentChart.destroy(); } catch(e) {} currentChart = null; }
  if (dataFiltersEl) dataFiltersEl.innerHTML = "";
  if (dataTableEl) dataTableEl.innerHTML = "";
  if (statisticsPanelEl) statisticsPanelEl.innerHTML = "";
}

/* 綁定左側主題按鈕 */
function bindSidebarFilterButtons() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    if (!btn.dataset.filter) return;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter; // all / HC / HM / PH
      renderDatasetList();
      clearMain();
    });
  });
}

/* 載入 GitHub 檔案清單 */
async function loadGitHubList() {
  if (!datasetListEl) return;
  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;
  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_DIR)}?ref=${GITHUB_REF}`;
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("無法取得 GitHub 資料夾內容");
    const files = await res.json();
    allFiles = files.filter(f => f.type === "file" && /\.xlsx?$/i.test(f.name));
    renderDatasetList();
  } catch (e) {
    datasetListEl.innerHTML = `<p style="color:#ef4444">載入失敗：${e.message}</p>`;
  }
}

/* 依主題顯示資料集（PH 只顯示 allowlist） */
function renderDatasetList() {
  if (!datasetListEl) return;
  datasetListEl.innerHTML = "";
  const list = allFiles.filter(f => {
    if (currentFilter === "all") return true;
    const up = f.name.toUpperCase();
    if (currentFilter === "PH") {
      return up.includes("PH") && PH_NUMERIC_ALLOWLIST.has(f.name);
    }
    return up.includes(currentFilter);
  });

  if (!list.length) {
    datasetListEl.innerHTML = `<p>這個主題暫無可視覺化指標（MVP 僅先做可數值化者）。</p>`;
    return;
  }

  list.forEach(file => {
    const div = document.createElement("div");
    div.className = "dataset-item";
    div.innerHTML = `
      <div class="dataset-code">${file.name.replace(/\.xlsx?$/i,"")}</div>
      <div class="dataset-name">${file.path}</div>
    `;
    div.addEventListener("click", () => {
      datasetListEl.querySelectorAll(".dataset-item").forEach(x => x.classList.remove("active"));
      div.classList.add("active");
      openDataset(file);
    });
    datasetListEl.appendChild(div);
  });
}

/* 打開單一 Excel */
async function openDataset(file) {
  try {
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error("下載失敗：" + file.name);
    const buf = await res.arrayBuffer();
    workbook = XLSX.read(buf, { type: "array" });
    currentFile = file;

    const picked = autoPickBestSheet(workbook);
    if (!picked) {
      showError("自動偵測不到規則表格（可能為純文字/制度描述）。");
      return;
    }

    const longRows = sheetToLong(workbook.Sheets[picked.sheetName], picked.headerIdx, picked.orientation);
    const cleaned = cleanAndFilterRows(longRows);

    if (!cleaned.length) {
      showError("這個檔案沒有可用的數值資料（或欄位為純文字/制度描述）。");
      return;
    }

    ensureVizShown();
    if (currentDatasetTitleEl) currentDatasetTitleEl.textContent = `${file.name.replace(/\.xlsx?$/i,"")}（${picked.sheetName}）`;

    if (currentFilter === "PH") {
      normRows = cleaned;
      renderPHControls();
      renderPHChart();
      renderPHTableCollapsed();
    } else {
      rawRows = rowsFromNormToRaw(cleaned);
      rawKeys = { countryKey:"Country", yearKey:"Year", valueKey:"Value" };
      renderGeneralFilters(rawRows, rawKeys);
      renderGeneralAll();
    }
  } catch (e) {
    showError(e.message || "開啟資料失敗");
  }
}

/* ===== 自動偵測：最佳分頁 / 表頭列 / 朝向 ===== */
function autoPickBestSheet(wb) {
  let best = null;
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!matrix || !matrix.length) continue;
    const maxScan = Math.min(200, matrix.length);
    for (let i = 0; i < maxScan; i++) {
      const orient = detectOrientation(matrix, i);
      if (!orient) continue;
      const score = estimateHeaderHit(matrix[i]) + Math.log((matrix.length - i + 1) || 1) + (orient === "long" ? 3 : 2);
      if (!best || score > best.score) best = { sheetName, headerIdx:i, orientation:orient, score };
    }
  }
  return best;
}
function detectOrientation(matrix, headerIdx) {
  const header = (matrix[headerIdx] || []).map(v => v==null ? "" : String(v).trim());
  const firstCol = matrix.slice(headerIdx+1).map(r => (r && r[0]!=null) ? String(r[0]).trim() : "");
  const yearCols = header.slice(1).filter(isYearLike).length;
  const yearRows = firstCol.filter(isYearLike).length;

  const hl = header.map(s=>s.toLowerCase());
  const hasC = hl.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const hasY = hl.some(lbl => COLUMN_ALIASES.year.some(a=>lbl.includes(a)));
  const hasV = hl.some(lbl => COLUMN_ALIASES.value.some(a=>lbl.includes(a)));
  if (hasC && (hasY || yearCols || yearRows) && hasV) return "long";

  if (yearCols >= 3) return "wide-year-in-columns";
  if (yearRows >= 3) return "wide-year-in-rows";
  return null;
}
function estimateHeaderHit(row) {
  const labels = (row || []).map(v => v==null ? "" : String(v).trim().toLowerCase());
  const hasC = labels.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const anyYear = labels.some(isYearLike);
  return (hasC?1:0) + (anyYear?1:0);
}
function isYearLike(x) {
  const s = String(x||"").trim();
  const m = s.match(/(18|19|20)\d{2}/);
  if (!m) return false;
  const y = Number(m[0]);
  return y>=1850 && y<=2100;
}

/* ===== 交叉/長表 → 長表 {country, year, value} ===== */
function sheetToLong(sheet, headerIdx, orientation) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const header = (matrix[headerIdx] || []).map(v => v==null ? "" : String(v).trim());
  const body   = matrix.slice(headerIdx+1);

  if (orientation === "long") {
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerIdx });
    return normalizeLong(rows);
  }
  if (orientation === "wide-year-in-columns") {
    const out = [];
    body.forEach(r => {
      if (!r || r.length===0) return;
      const country = safeCell(r[0]);
      if (!country) return;
      for (let j=1; j<header.length; j++) {
        const yl = header[j];
        if (!isYearLike(yl)) continue;
        const val = r[j];
        out.push({ country, year: extractYear(yl), value: val });
      }
    });
    return out;
  }
  if (orientation === "wide-year-in-rows") {
    const countries = header.slice(1);
    const out = [];
    body.forEach(r => {
      if (!r || r.length===0) return;
      const yl = safeCell(r[0]);
      if (!isYearLike(yl)) return;
      const year = extractYear(yl);
      for (let j=1; j<r.length; j++) {
        const country = countries[j-1];
        if (!country) continue;
        const val = r[j];
        out.push({ country, year, value: val });
      }
    });
    return out;
  }
  return [];
}
function normalizeLong(rows) {
  if (!rows || !rows.length) return [];
  const cols = Object.keys(rows[0]);
  const pick = (aliases) => {
    const low = Object.fromEntries(cols.map(n=>[n.toLowerCase(), n]));
    for (const a of aliases) if (low[a.toLowerCase()]) return low[a.toLowerCase()];
    for (const c of cols) { const lc = c.toLowerCase(); if (aliases.some(a=>lc.includes(a.toLowerCase()))) return c; }
    return null;
  };
  let cKey = pick(COLUMN_ALIASES.country);
  let yKey = pick(COLUMN_ALIASES.year);
  let vKey = pick(COLUMN_ALIASES.value) || cols.find(k=>k!==cKey && k!==yKey) || cols[1];
  if (!cKey || !vKey) return [];
  return rows.map(r => ({ country:r[cKey], year: yKey ? r[yKey] : null, value:r[vKey] }));
}

/* ===== 清理 / 排除 ===== */
function safeCell(x){ return x==null ? "" : String(x).trim(); }
function extractYear(x){ const m = String(x||"").match(/(18|19|20)\d{2}/); return m ? m[0] : null; }
function toNumberRobust(v) {
  if (v==null) return null;
  let s = String(v).trim();
  s = s.replace(/[a-z\u00AA-\u02AF\u1D2C-\u1D7F\u2070-\u209F]/gi, ""); // 註腳/上標
  s = s.replace(/[,%\s]/g, ""); // 逗號/空白/百分比
  if (s==="" || s==="-" ) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}
function cleanAndFilterRows(rows) {
  const out = (rows||[])
    .filter(r => r && r.country!=null && r.value!=null && String(r.country).trim()!=="")
    .map(r => ({ country: r.country, year: r.year ?? null, value: toNumberRobust(r.value) }))
    .filter(r => r.value!=null)
    .filter(r => !/^source:|^note:/i.test(String(r.country)))
    .filter(r => !EXCLUDE_CODES.includes(String(r.country)));
  return out;
}

/* ===== PH 極簡模式 ===== */
function renderPHControls() {
  if (!dataFiltersEl) return;
  dataFiltersEl.innerHTML = `
    <div class="filter-group" id="phControls">
      <label>顯示集合</label>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button type="button" class="filter-btn ${phViewMode==='top'?'active':''}" data-mode="top">Top 15</button>
        <button type="button" class="filter-btn ${phViewMode==='bottom'?'active':''}" data-mode="bottom">Bottom 15</button>
        <button type="button" class="filter-btn ${phViewMode==='all'?'active':''}" data-mode="all">All</button>
        <button type="button" class="filter-btn" id="toggleTableBtn">展開 / 收合原始表</button>
      </div>
    </div>
  `;
  dataFiltersEl.querySelectorAll("button[data-mode]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      dataFiltersEl.querySelectorAll("button[data-mode]").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      phViewMode = btn.dataset.mode;
      renderPHChart();
    });
  });
  const tbtn = dataFiltersEl.querySelector("#toggleTableBtn");
  if (tbtn) tbtn.addEventListener("click", ()=>{
    const isHidden = dataTableEl.style.display === "none";
    dataTableEl.style.display = isHidden ? "" : "none";
  });
}
function renderPHChart() {
  try {
    const years = Array.from(new Set(normRows.map(r=>r.year).filter(Boolean))).map(Number);
    const latestYear = years.length ? Math.max(...years) : null;

    let dataset = [];
    if (latestYear != null) {
      const map = new Map();
      normRows.forEach(r => {
        if (String(r.year) === String(latestYear)) map.set(r.country, r.value);
      });
      dataset = Array.from(map.entries()).map(([country,value])=>({country, value}));
    } else {
      const map = new Map();
      normRows.forEach(r => { if (!map.has(r.country)) map.set(r.country, r.value); });
      dataset = Array.from(map.entries()).map(([country,value])=>({country, value}));
    }

    dataset.sort((a,b)=>b.value - a.value);
    let view = dataset;
    if (phViewMode === "top") view = dataset.slice(0,15);
    else if (phViewMode === "bottom") view = dataset.slice(-15);

    if (!mainChartEl) { showError("找不到圖表畫布 #mainChart"); return; }
    const ctx = mainChartEl.getContext("2d");
    if (!ctx) { showError("無法取得 canvas context"); return; }
    if (currentChart) { try { currentChart.destroy(); } catch(e) {} }

    const labels = view.map(d=>d.country);
    const data   = view.map(d=>d.value);

    currentChart = new Chart(ctx, {
      type: "bar",
      data: { labels, datasets: [{ label: latestYear? `最新年：${latestYear}`:"最新資料", data, borderWidth:2 }]},
      options: {
        responsive:true, maintainAspectRatio:false,
        indexAxis:"y",
        scales: { x: { beginAtZero:true } },
        onClick: (_, el) => {
          if (!el || !el.length) return;
          const idx = el[0].index;
          const country = labels[idx];
          renderPHDetail(country, latestYear);
        },
        plugins: {
          tooltip: { callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              return `${ctx.label}: ${isFinite(v)? v : "-"}` + (latestYear? `（${latestYear}）`:"");
            }
          } }
        }
      }
    });
  } catch(err) {
    showError("繪製政策圖表時發生錯誤：" + err.message);
  }
}
function renderPHDetail(country, latestYear) {
  const series = normRows.filter(r=>r.country===country && r.year!=null)
                         .sort((a,b)=>Number(a.year)-Number(b.year));
  const ys = series.map(r=>Number(r.year));
  const vs = series.map(r=>r.value);
  const tYs = ys.length>10 ? ys.slice(-10) : ys;
  const tVs = vs.length>10 ? vs.slice(-10) : vs;

  let cur = null;
  if (latestYear!=null) {
    const f = normRows.find(r=>r.country===country && String(r.year)===String(latestYear));
    cur = f? f.value : null;
  } else {
    const f = normRows.find(r=>r.country===country);
    cur = f? f.value : null;
  }
  const sameYearRows = latestYear!=null ? normRows.filter(r=>String(r.year)===String(latestYear)) : normRows;
  const nums = sameYearRows.map(r=>r.value).filter(n=>typeof n==="number" && !isNaN(n));
  const avg = nums.length ? nums.reduce((a,b)=>a+b,0)/nums.length : null;

  let micro = "";
  if (tYs.length>=2) {
    const delta = tVs[tVs.length-1] - tVs[0];
    micro += `近 ${tYs.length} 年 ${delta>=0?"↑":"↓"} ${Math.abs(delta).toFixed(2)}`;
  }
  if (avg!=null && cur!=null) {
    micro += (micro? "，": "") + `相對 OECD 平均 ${ (cur/avg).toFixed(2) } 倍`;
  }

  if (!statisticsPanelEl) return;
  statisticsPanelEl.innerHTML = `
    <div class="stat-card" style="grid-column:1/-1;text-align:left">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div>
          <div class="stat-label" style="color:#334155">國家 / 地區</div>
          <div style="font-size:1.25rem;font-weight:700">${country}</div>
        </div>
        <div>
          <div class="stat-label">${latestYear?`數值（${latestYear}）`:"數值"}</div>
          <div class="stat-value" style="font-size:1.5rem">${cur!=null? cur.toFixed(2): "-"}</div>
        </div>
        <div>
          <div class="stat-label">OECD 平均</div>
          <div class="stat-value" style="font-size:1.25rem">${avg!=null? avg.toFixed(2): "-"}</div>
        </div>
      </div>
      <div style="margin-top:.75rem"><canvas id="sparklineCanvas" height="60"></canvas></div>
      <div style="margin-top:.5rem;color:#475569">${micro || "此指標缺乏連續年份，僅顯示最新資料。"}</div>
    </div>
  `;

  const cvs = document.getElementById("sparklineCanvas");
  if (cvs && tYs.length) {
    try {
      new Chart(cvs.getContext("2d"), {
        type: "line",
        data: { labels: tYs, datasets: [{ data: tVs, borderWidth:2, pointRadius:0, tension:0.3, fill:false }]},
        options: {
          responsive:true, maintainAspectRatio:false,
          scales:{ x:{display:false}, y:{display:false} },
          plugins:{ legend:{display:false}, tooltip:{enabled:false} }
        }
      });
    } catch(e) {
      console.warn("sparkline 失敗：", e);
    }
  }
}
function renderPHTableCollapsed() {
  if (!dataTableEl) return;
  if (!normRows.length) { dataTableEl.innerHTML = "<p>沒有資料</p>"; return; }
  const cols = ["country","year","value"];
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${normRows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
  dataTableEl.style.display = "none";
}

/* ===== 一般模式（HC/HM）===== */
function rowsFromNormToRaw(rows) { return rows.map(r=>({ Country:r.country, Year:r.year, Value:r.value })); }
function renderGeneralFilters(rows, keys) {
  if (!dataFiltersEl) return;
  dataFiltersEl.innerHTML = "";
  // 國家
  const countries = Array.from(new Set(rows.map(r=>r[keys.countryKey]).filter(Boolean))).sort();
  const cg = document.createElement("div");
  cg.className = "filter-group";
  cg.innerHTML = `
    <label for="filterCountry">國家 / 地區</label>
    <select id="filterCountry">
      <option value="__all">全部</option>
      ${countries.map(c=>`<option value="${c}">${c}</option>`).join("")}
    </select>
  `;
  dataFiltersEl.appendChild(cg);
  cg.querySelector("select").addEventListener("change", renderGeneralAll);

  // 年份
  const years = Array.from(new Set(rows.map(r=>r[keys.yearKey]).filter(Boolean))).sort();
  if (years.length) {
    const yg = document.createElement("div");
    yg.className = "filter-group";
    yg.innerHTML = `
      <label for="filterYear">年份</label>
      <select id="filterYear">
        <option value="__all">全部</option>
        ${years.map(y=>`<option value="${y}">${y}</option>`).join("")}
      </select>
    `;
    dataFiltersEl.appendChild(yg);
    yg.querySelector("select").addEventListener("change", renderGeneralAll);
  }
}
function renderGeneralAll() {
  if (!rawRows.length || !rawKeys) return;
  const cSel = document.getElementById("filterCountry");
  const ySel = document.getElementById("filterYear");
  const sc = cSel ? cSel.value : "__all";
  const sy = ySel ? ySel.value : "__all";
  const rows = rawRows.filter(r => {
    if (sc !== "__all" && r[rawKeys.countryKey] !== sc) return false;
    if (sy !== "__all" && String(r[rawKeys.yearKey]) !== String(sy)) return false;
    return true;
  });
  renderGeneralChart(rows, rawKeys);
  renderGeneralTable(rows);
  renderGeneralStats(rows, rawKeys.valueKey);
}
function renderGeneralChart(rows, keys) {
  try {
    if (!mainChartEl) { showError("找不到圖表畫布 #mainChart"); return; }
    const ctx = mainChartEl.getContext("2d");
    if (!ctx) { showError("無法取得 canvas context"); return; }
    if (currentChart) { try { currentChart.destroy(); } catch(e) {} }

    let typeSel = chartTypeSelect ? chartTypeSelect.value : "auto";
    if (typeSel === "horizontalBar") typeSel = "bar-horizontal";
    if (typeSel === "auto") {
      const uniqY = new Set(rows.map(r=>r[keys.yearKey]).filter(Boolean));
      typeSel = uniqY.size > 3 ? "line" : "bar";
    }
    const isHorizontal = typeSel === "bar-horizontal";

    const uniqC = Array.from(new Set(rows.map(r=>r[keys.countryKey]).filter(Boolean)));
    const uniqY = keys.yearKey ? Array.from(new Set(rows.map(r=>r[keys.yearKey]).filter(Boolean))).sort() : [];

    let labels=[], data=[];
    if (keys.yearKey && uniqC.length === 1) {
      labels = uniqY;
      data   = labels.map(y => {
        const f = rows.find(r=>String(r[keys.yearKey])===String(y));
        return f ? Number(f[keys.valueKey]) : null;
      });
    } else {
      labels = uniqC;
      data   = labels.map(c=>{
        const cs = rows.filter(r=>r[keys.countryKey]===c);
        if (keys.yearKey) {
          const last = cs.sort((a,b)=>Number(a[keys.yearKey])-Number(b[keys.yearKey])).at(-1);
          return last ? Number(last[keys.valueKey]) : null;
        } else {
          return cs[0] ? Number(cs[0][keys.valueKey]) : null;
        }
      });
    }

    currentChart = new Chart(ctx, {
      type: isHorizontal ? "bar" : typeSel,
      data: { labels, datasets:[{ label:"Value", data, borderWidth:2, fill:false }]},
      options: {
        responsive:true, maintainAspectRatio:false,
        indexAxis: isHorizontal ? "y" : "x",
        scales: { y: { beginAtZero:true } }
      }
    });
  } catch(err) {
    showError("繪製一般圖表時發生錯誤：" + err.message);
  }
}
function renderGeneralTable(rows) {
  if (!dataTableEl) return;
  if (!rows.length) { dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>"; return; }
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}
function renderGeneralStats(rows, valueKey) {
  if (!statisticsPanelEl) return;
  if (!rows.length) { statisticsPanelEl.innerHTML = ""; return; }
  const nums = rows.map(r=>Number(r[valueKey])).filter(n=>!isNaN(n));
  const count= nums.length;
  const min  = Math.min(...nums);
  const max  = Math.max(...nums);
  const avg  = nums.reduce((a,b)=>a+b,0)/(nums.length||1);
  statisticsPanelEl.innerHTML = `
    <div class="stat-card"><div class="stat-label">資料筆數</div><div class="stat-value">${count}</div></div>
    <div class="stat-card"><div class="stat-label">最大值</div><div class="stat-value">${isFinite(max)?max.toFixed(2):"-"}</div></div>
    <div class="stat-card"><div class="stat-label">最小值</div><div class="stat-value">${isFinite(min)?min.toFixed(2):"-"}</div></div>
    <div class="stat-card"><div class="stat-label">平均值</div><div class="stat-value">${isFinite(avg)?avg.toFixed(2):"-"}</div></div>
  `;
}

/* ===== 通用：下載、更新時間 ===== */
function bindGlobals() {
  if (downloadBtn) downloadBtn.addEventListener("click", () => {
    if (!currentChart) return;
    const a = document.createElement("a");
    a.href = currentChart.toBase64Image();
    a.download = (currentFile ? currentFile.name.replace(/\.xlsx?$/i,"") : "chart") + ".png";
    a.click();
  });
}
function setLastUpdateToday() {
  if (!lastUpdateEl) return;
  const now = new Date();
  lastUpdateEl.textContent = now.toISOString().slice(0,10);
  lastUpdateEl.setAttribute("datetime", now.toISOString());
}
