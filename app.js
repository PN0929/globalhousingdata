// app.js — Policy 主題極簡模式 + 其他主題一般模式
// - Policy：橫向條形（最新年）+ Top/Bottom/All + 點擊詳情卡（含 sparkline）+ 一鍵展開表
// - 其他主題：維持之前的一般模式（可切圖、國家/年份篩選）
// - 多分頁 Excel + 表頭列掃描 + 資料朝向（寬表→長表）+ 手動欄位對應

/***** GitHub 設定 *****/
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO  = "globalhousingdata";
const GITHUB_REF   = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR   = "OECD DATA";

/***** 排除的國家代碼 / 名稱 *****/
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];

/***** 欄位別名（用來猜長表欄位）*****/
const COLUMN_ALIASES = {
  country: ["location","loc","country","country name","country_name","countryname","cou","geo","ref_area","area","economy","countrycode","country code","country_code"],
  year:    ["time","year","time period","time_period","timeperiod","reference period","ref_period","period","date","ref year","ref_year"],
  value:   ["value","obs_value","obs value","val","indicator value","data","amount","measure","obs","estimate","est"]
};

/***** 主題（含 policy 極簡提示）*****/
const TOPICS = [
  { id: "afford",    name: "住宅負擔",  match: ["HM","HC"], insight: "看『住得起』：建議先看最新年份的各國比較，再回看趨勢。" },
  { id: "market",    name: "住宅市場",  match: ["HM"],      insight: "觀察價格與租金指數的變化，切年份看波動。" },
  { id: "condition", name: "住宅條件",  match: ["HC"],      insight: "擁擠度、設備等橫向比較合適。" },
  { id: "policy",    name: "住宅政策",  match: ["PH"],      insight: "已為你自動顯示最新年度的各國比較。點條形看該國 10 年趨勢與數字。若資料格式特別混亂，可在失敗提示時用『手動欄位對應』。" }
];

/***** 狀態 *****/
let currentTopicId = "afford";
let currentChart = null;
let currentWorkbook = null;
let currentDatasetFile = null;

let allFiles = [];

// 一般模式使用
let currentRawRows = [];
let currentKeys = null; // {countryKey, yearKey, valueKey}

// Policy 模式使用（長表）
let normalizedRows = []; // {country, year|null, value:number}
let policyViewMode = "top"; // "top" | "bottom" | "all"

// 手動欄位對應（長表）
let manualMapping = { enabled:false, country:null, year:null, value:null };

/***** DOM *****/
const datasetListEl        = document.getElementById("datasetList");
const topicListEl          = document.getElementById("topicList");
const welcomeScreenEl      = document.getElementById("welcomeScreen");
const visualizationAreaEl  = document.getElementById("visualizationArea");
const currentDatasetTitleEl= document.getElementById("currentDatasetTitle");
const dataFiltersEl        = document.getElementById("dataFilters");
const dataTableEl          = document.getElementById("dataTable");
const statisticsPanelEl    = document.getElementById("statisticsPanel");
const chartTypeSelect      = document.getElementById("chartType");
const downloadBtn          = document.getElementById("downloadBtn");
const lastUpdateEl         = document.getElementById("lastUpdate");
const insightBoxEl         = document.getElementById("insightBox");
const sidebarToggleBtn     = document.getElementById("sidebarToggle");
const sidebarEl            = document.querySelector(".sidebar");

/* 初始化 */
document.addEventListener("DOMContentLoaded", () => {
  renderTopicButtons();
  loadGitHubDatasets();
  setLastUpdateToday();
  bindGlobalEvents();
});

/* 工具：當前是否為 policy 主題 */
const isPolicyMode = () => currentTopicId === "policy";

/* ===== 主題按鈕 ===== */
function renderTopicButtons() {
  topicListEl.innerHTML = "";
  TOPICS.forEach((t, i) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (i===0 ? " active" : "");
    btn.textContent = t.name;
    btn.addEventListener("click", () => {
      topicListEl.querySelectorAll(".filter-btn").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentTopicId = t.id;
      filterAndRenderDatasets();
      renderInsightForTopic();
      // 切換主題時，清空右側殘留
      clearMainOutputs();
      // policy 模式隱藏圖表類型下拉；一般模式顯示
      if (chartTypeSelect) chartTypeSelect.parentElement.style.display = isPolicyMode() ? "none" : "";
    });
    topicListEl.appendChild(btn);
  });
}

function renderInsightForTopic() {
  const t = TOPICS.find(x=>x.id===currentTopicId);
  if (!insightBoxEl) return;
  insightBoxEl.innerHTML = `
    <h4>如何看這個主題？</h4>
    <p>${t ? t.insight : "從左側選擇一個資料集，系統會幫你畫出常見的圖表。"}</p>
  `;
}

/* ===== 清空右側主區塊輸出 ===== */
function clearMainOutputs() {
  if (currentChart) { currentChart.destroy(); currentChart = null; }
  dataTableEl.innerHTML = "";
  statisticsPanelEl.innerHTML = "";
}

/* ===== 讀 GitHub 檔案清單 ===== */
async function loadGitHubDatasets() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_DIR)}?ref=${GITHUB_REF}`;
  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("無法取得 GitHub 資料夾內容");
    const files = await res.json();
    allFiles = files.filter(f => f.type==="file" && (f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls")));
    filterAndRenderDatasets();
  } catch (e) {
    console.error(e);
    datasetListEl.innerHTML = `<p style="color:#ef4444">載入失敗：${e.message}</p>`;
  }
}

/* ===== 依主題顯示資料集 ===== */
function filterAndRenderDatasets() {
  const topic = TOPICS.find(t=>t.id===currentTopicId);
  datasetListEl.innerHTML = "";
  const matched = allFiles.filter(file => {
    if (!topic) return true;
    const up = file.name.toUpperCase();
    return topic.match.some(code=>up.includes(code));
  });
  if (!matched.length) { datasetListEl.innerHTML = `<p>這個主題暫時沒有對應的指標</p>`; return; }

  matched.forEach(file => {
    const item = document.createElement("div");
    item.className = "dataset-item";
    item.innerHTML = `
      <div class="dataset-code">${file.name.replace(/\.xlsx?$/i,"")}</div>
      <div class="dataset-name">${file.path}</div>
    `;
    item.addEventListener("click", () => {
      datasetListEl.querySelectorAll(".dataset-item").forEach(el=>el.classList.remove("active"));
      item.classList.add("active");
      currentDatasetFile = file;
      loadOneExcel(file);
    });
    datasetListEl.appendChild(item);
  });
  renderInsightForTopic();
}

/* ===== 載入單一 Excel ===== */
async function loadOneExcel(file) {
  manualMapping = { enabled:false, country:null, year:null, value:null };
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error("無法下載檔案：" + file.name);
    const buf = await res.arrayBuffer();
    currentWorkbook = XLSX.read(buf, { type: "array" });

    const pick = autoPickBestSheet(currentWorkbook);
    showVisualizationArea();
    renderDatasetTitle(file.name.replace(/\.xlsx?$/i,""));

    if (!pick) {
      renderSheetOrientationControls(currentWorkbook); // 手動
      showFormatError("找不到合適的資料區。請手動選擇『工作表 / 表頭列 / 資料朝向』，或用『手動欄位對應』。");
      return;
    }
    applySheetTransform(pick.sheetName, pick.headerRow, pick.orientation);
  } catch(e) {
    console.error(e);
    alert("讀取檔案失敗：" + e.message);
  }
}

/* ===== 自動挑選最佳分頁 / 表頭列 / 朝向 ===== */
function autoPickBestSheet(workbook) {
  let best = null; // {sheetName, headerRow, orientation, score}
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!matrix || !matrix.length) continue;

    const maxScan = Math.min(200, matrix.length);
    for (let hdrIdx = 0; hdrIdx < maxScan; hdrIdx++) {
      const headerRow = matrix[hdrIdx] || [];
      const orientation = detectOrientationByHeader(matrix, hdrIdx);
      if (!orientation) continue;
      const rowsCount = matrix.length - hdrIdx;
      let score = (orientation==="long" ? 3 : 2);
      score += estimateHeaderHit(headerRow);
      score += Math.log(rowsCount + 1);
      if (!best || score > best.score) best = { sheetName, headerRow: hdrIdx, orientation, score };
    }
  }
  return best;
}

function estimateHeaderHit(headerRow) {
  const labels = headerRow.map(v => (v==null ? "" : String(v))).map(s=>s.trim().toLowerCase());
  const hasCountry = labels.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const yearLikeCt = labels.filter(isYearLike).length;
  return (hasCountry?1:0) + (yearLikeCt ? 1 : 0);
}
function detectOrientationByHeader(matrix, headerIdx) {
  const header = (matrix[headerIdx] || []).map(v => v==null ? "" : String(v).trim());
  const firstColBelow = (matrix.slice(headerIdx+1).map(r=>r?.[0])).map(v => v==null ? "" : String(v).trim());
  const yearLikeCols = header.slice(1).filter(isYearLike).length;
  const yearLikeRows = firstColBelow.filter(isYearLike).length;

  const headerLower = header.map(s=>s.toLowerCase());
  const hasCountry = headerLower.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const hasYear    = headerLower.some(lbl => COLUMN_ALIASES.year.some(a=>lbl.includes(a)));
  const hasValue   = headerLower.some(lbl => COLUMN_ALIASES.value.some(a=>lbl.includes(a)));
  if (hasCountry && (hasYear || yearLikeCols || yearLikeRows) && hasValue) return "long";

  if (yearLikeCols >= 3) return "wide-year-in-columns";
  if (yearLikeRows >= 3) return "wide-year-in-rows";
  return null;
}
function isYearLike(x) {
  const s = String(x||"").trim();
  const m = s.match(/(18|19|20)\d{2}/);
  if (!m) return false;
  const y = parseInt(m[0],10);
  return y>=1850 && y<=2100;
}

/* ===== 套用分頁/表頭/朝向 → 正規化長表 → 渲染 ===== */
function applySheetTransform(sheetName, headerRowIndex, orientation) {
  renderSheetOrientationControls(currentWorkbook, sheetName, headerRowIndex, orientation);

  const sheet = currentWorkbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const header = (matrix[headerRowIndex] || []).map(v => v==null ? "" : String(v).trim());
  const body   = matrix.slice(headerRowIndex+1);

  let longRows;
  if (orientation === "long") {
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerRowIndex });
    longRows = normalizeLongTable(rows);
    if (!longRows.length) {
      renderManualMappingPanel(rows);
      showFormatError("需要手動欄位對應：請選擇『國家/地區、年份（可選無年份）、值』欄位。");
      return;
    }
  } else if (orientation === "wide-year-in-columns") {
    longRows = meltWideYearInColumns(header, body);
  } else if (orientation === "wide-year-in-rows") {
    longRows = meltWideYearInRows(header, body);
  } else {
    showFormatError("朝向設定不正確。");
    return;
  }

  longRows = cleanAndFilterRows(longRows);
  if (!longRows.length) {
    const rowsObj = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerRowIndex });
    renderManualMappingPanel(rowsObj);
    showFormatError("自動轉換後沒有可用資料。請改用『手動欄位對應』。");
    return;
  }

  normalizedRows = longRows;
  clearFormatError();
  removeManualMappingPanel();
  showVisualizationArea();
  renderDatasetTitle(`${currentDatasetFile.name.replace(/\.xlsx?$/i,"")}（${sheetName}）`);

  if (isPolicyMode()) {
    renderPolicyUIAndChart();
  } else {
    // 一般模式
    currentRawRows = rowsFromNormalizedBackToRawKeys(normalizedRows);
    currentKeys = deriveKeysFromNormalized(currentRawRows);
    renderFiltersFromNormalized_general(currentRawRows, currentKeys);
    renderAllFromFilters_general();
  }
}

/* ===== 將長表回推成一般模式需要的 raw 形（方便重用既有一般流程）===== */
function rowsFromNormalizedBackToRawKeys(rows) {
  return rows.map(r => ({ Country: r.country, Year: r.year, Value: r.value }));
}
function deriveKeysFromNormalized(rows) {
  return { countryKey: "Country", yearKey: "Year", valueKey: "Value" };
}

/* ======= Policy 專屬：UI + 圖 + 詳情卡 + 表格 ======= */
function renderPolicyUIAndChart() {
  // 1) 清掉既有 filter-group（保留分頁/表頭/朝向控件 & insight）
  Array.from(dataFiltersEl.querySelectorAll(".filter-group"))
    .filter(el => !["sheetSelectorGroup","headerRowGroup","orientationGroup"].includes(el.id))
    .forEach(el => el.remove());

  // 2) 三個微控件：Top/Bottom/All
  const pills = document.createElement("div");
  pills.className = "filter-group";
  pills.id = "policyPills";
  pills.innerHTML = `
    <label>顯示集合</label>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
      <button type="button" data-mode="top" class="filter-btn ${policyViewMode==='top'?'active':''}">Top 15</button>
      <button type="button" data-mode="bottom" class="filter-btn ${policyViewMode==='bottom'?'active':''}">Bottom 15</button>
      <button type="button" data-mode="all" class="filter-btn ${policyViewMode==='all'?'active':''}">All</button>
      <button type="button" id="toggleTableBtn" class="filter-btn">展開 / 收合原始表</button>
    </div>
  `;
  dataFiltersEl.appendChild(pills);

  pills.querySelectorAll("button[data-mode]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      policyViewMode = btn.dataset.mode;
      pills.querySelectorAll("button[data-mode]").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      renderPolicyChartOnly(); // 只重畫圖
    });
  });
  const toggleBtn = pills.querySelector("#toggleTableBtn");
  if (toggleBtn) toggleBtn.addEventListener("click", ()=>{
    const isHidden = dataTableEl.style.display === "none";
    dataTableEl.style.display = isHidden ? "" : "none";
  });

  // 3) 初始化表格為收合
  dataTableEl.style.display = "none";
  renderPolicyTable();

  // 4) 畫主圖
  renderPolicyChartOnly();
}

/* ===== Policy：主圖（橫向條形，最新年，Top/Bottom/All）===== */
function renderPolicyChartOnly() {
  // 摘取最新年（若沒有年份，就 year=null，直接畫一次）
  const years = Array.from(new Set(normalizedRows.map(r=>r.year).filter(Boolean))).map(y=>Number(y));
  const latestYear = years.length ? Math.max(...years) : null;

  let dataset = [];
  if (latestYear !== null) {
    const map = new Map(); // country -> value of latestYear
    normalizedRows.forEach(r=>{
      if (String(r.year) === String(latestYear)) {
        map.set(r.country, r.value);
      }
    });
    dataset = Array.from(map.entries()).map(([country, value])=>({country, value}));
  } else {
    // 無年份：取每國第一筆
    const firstMap = new Map();
    normalizedRows.forEach(r=>{
      if (!firstMap.has(r.country)) firstMap.set(r.country, r.value);
    });
    dataset = Array.from(firstMap.entries()).map(([country, value])=>({country, value}));
  }

  // 排序 + 取 Top/Bottom/All
  dataset.sort((a,b)=>b.value - a.value);
  let view = dataset;
  if (policyViewMode === "top") view = dataset.slice(0, 15);
  else if (policyViewMode === "bottom") view = dataset.slice(-15);

  // 畫圖
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (currentChart) currentChart.destroy();

  const labels = view.map(d=>d.country);
  const data   = view.map(d=>d.value);

  currentChart = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: latestYear ? `最新年：${latestYear}` : "最新資料", data, borderWidth: 2 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      scales: { x: { beginAtZero: true } },
      onClick: (_, elements) => {
        if (!elements || !elements.length) return;
        const idx = elements[0].index;
        const country = labels[idx];
        renderPolicyDetailCard(country, latestYear);
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed.x;
              return `${ctx.label}: ${isFinite(v)? v : "-"}` + (latestYear? `（${latestYear}）` : "");
            }
          }
        }
      }
    }
  });
}

/* ===== Policy：詳情卡（右側 statisticsPanel 區塊顯示）+ sparkline ===== */
function renderPolicyDetailCard(country, latestYear) {
  // 近 10 年資料
  const series = normalizedRows
    .filter(r=>r.country===country && (r.year!=null))
    .sort((a,b)=>Number(a.year)-Number(b.year));

  const years = series.map(r=>Number(r.year));
  const values= series.map(r=>r.value);

  const trimmedYears = years.length>10 ? years.slice(-10) : years;
  const trimmedVals  = values.length>10 ? values.slice(-10): values;

  // 當年值 & OECD 平均
  let currentVal = null;
  if (latestYear!=null) {
    const found = normalizedRows.find(r=>r.country===country && String(r.year)===String(latestYear));
    currentVal = found ? found.value : null;
  } else {
    const first = normalizedRows.find(r=>r.country===country);
    currentVal = first ? first.value : null;
  }
  const sameYearRows = latestYear!=null
    ? normalizedRows.filter(r=>String(r.year)===String(latestYear))
    : normalizedRows;
  const nums = sameYearRows.map(r=>r.value).filter(n=>typeof n==="number" && !isNaN(n));
  const oecdAvg = nums.length ? (nums.reduce((a,b)=>a+b,0)/nums.length) : null;

  // 微 insight
  let micro = "";
  if (trimmedYears.length >= 2) {
    const delta = trimmedVals[trimmedVals.length-1] - trimmedVals[0];
    micro += `近 ${trimmedYears.length} 年變動 ${delta>=0? "↑":"↓"} ${Math.abs(delta).toFixed(2)}`;
  }
  if (oecdAvg!=null && currentVal!=null) {
    const ratio = currentVal / oecdAvg;
    micro += (micro? "，": "") + `相對 OECD 平均 ${ratio.toFixed(2)} 倍`;
  }

  // Render card
  statisticsPanelEl.innerHTML = `
    <div class="stat-card" style="grid-column: 1 / -1; text-align:left">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;flex-wrap:wrap">
        <div>
          <div class="stat-label" style="font-size:0.95rem;color:#334155">國家 / 地區</div>
          <div style="font-size:1.25rem;font-weight:700">${country}</div>
        </div>
        <div>
          <div class="stat-label">${latestYear ? `數值（${latestYear}）` : "數值"}</div>
          <div class="stat-value" style="font-size:1.5rem">${currentVal!=null? currentVal.toFixed(2) : "-"}</div>
        </div>
        <div>
          <div class="stat-label">OECD 平均</div>
          <div class="stat-value" style="font-size:1.25rem">${oecdAvg!=null? oecdAvg.toFixed(2) : "-"}</div>
        </div>
      </div>
      <div style="margin-top:.75rem">
        <canvas id="sparklineCanvas" height="60" aria-label="近年趨勢"></canvas>
      </div>
      <div style="margin-top:.5rem;color:#475569">${micro || "此指標的近年趨勢有限或缺年份。"}</div>
    </div>
  `;

  // 畫 sparkline
  const cvs = document.getElementById("sparklineCanvas");
  if (cvs && trimmedYears.length) {
    new Chart(cvs.getContext("2d"), {
      type: "line",
      data: {
        labels: trimmedYears,
        datasets: [{ data: trimmedVals, borderWidth: 2, pointRadius: 0, tension: 0.3, fill:false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: { x: { display: false }, y: { display: false } },
        plugins: { legend: { display:false }, tooltip: { enabled:false } }
      }
    });
  }
}

/* ===== Policy：原始表（收合/展開）===== */
function renderPolicyTable() {
  const rows = normalizedRows;
  if (!rows || !rows.length) { dataTableEl.innerHTML = "<p>沒有資料</p>"; return; }
  const cols = ["country","year","value"];
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}

/* ===== 一般模式：篩選器（國家/年份）===== */
function renderFiltersFromNormalized_general(rows, keys) {
  // 清除舊篩選器（保留分頁/表頭/朝向）
  Array.from(dataFiltersEl.querySelectorAll(".filter-group"))
    .filter(el => !["sheetSelectorGroup","headerRowGroup","orientationGroup"].includes(el.id))
    .forEach(el => el.remove());

  const { countryKey, yearKey } = keys;

  // 國家
  const countries = Array.from(new Set(rows.map(r=>r[countryKey]).filter(Boolean))).sort();
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
  cg.querySelector("select").addEventListener("change", renderAllFromFilters_general);

  // 年份
  if (yearKey) {
    const years = Array.from(new Set(rows.map(r=>r[yearKey]).filter(Boolean))).sort();
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
    yg.querySelector("select").addEventListener("change", renderAllFromFilters_general);
  }
}

/* ===== 一般模式：篩選後 → 畫圖/表/統計 ===== */
function renderAllFromFilters_general() {
  if (!currentRawRows.length || !currentKeys) return;
  const { countryKey, yearKey, valueKey } = currentKeys;
  const cSel = document.getElementById("filterCountry");
  const ySel = document.getElementById("filterYear");
  const selC = cSel ? cSel.value : "__all";
  const selY = ySel ? ySel.value : "__all";

  const rows = currentRawRows.filter(r=>{
    if (selC !== "__all" && r[countryKey] !== selC) return false;
    if (yearKey && selY !== "__all" && String(r[yearKey]) !== String(selY)) return false;
    return true;
  });

  renderChart_general(rows, currentKeys);
  renderTable_general(rows);
  renderStats_general(rows, valueKey);
}
function renderChart_general(rows, keys) {
  const { countryKey, yearKey, valueKey } = keys;
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (currentChart) currentChart.destroy();

  let typeSel = chartTypeSelect ? chartTypeSelect.value : "auto";
  if (typeSel==="auto") {
    const uniqYears = yearKey ? new Set(rows.map(r=>r[yearKey]).filter(Boolean)) : new Set();
    typeSel = uniqYears.size > 3 ? "line" : "bar";
  }
  const isHorizontal = typeSel === "bar-horizontal";

  const uniqCountries = Array.from(new Set(rows.map(r=>r[countryKey]).filter(Boolean)));
  const uniqYears = yearKey ? Array.from(new Set(rows.map(r=>r[yearKey]).filter(Boolean))).sort() : [];

  let labels = [], data = [];
  if (yearKey && uniqCountries.length === 1) {
    labels = uniqYears;
    data = labels.map(y => {
      const f = rows.find(r => String(r[yearKey])===String(y));
      return f ? Number(f[valueKey]) : null;
    });
  } else {
    labels = uniqCountries;
    data = labels.map(c => {
      const cs = rows.filter(r => r[countryKey] === c);
      if (yearKey) {
        const last = cs.sort((a,b)=>Number(a[yearKey]) - Number(b[yearKey])).at(-1);
        return last ? Number(last[valueKey]) : null;
      } else {
        return cs[0] ? Number(cs[0][valueKey]) : null;
      }
    });
  }

  currentChart = new Chart(ctx, {
    type: isHorizontal ? "bar" : typeSel,
    data: { labels, datasets: [{ label: "Value", data, borderWidth: 2, fill:false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      indexAxis: isHorizontal ? "y" : "x",
      scales: { y: { beginAtZero: true } }
    }
  });
}
function renderTable_general(rows) {
  if (!dataTableEl) return;
  if (!rows.length) { dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>"; return; }
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}
function renderStats_general(rows, valueKey) {
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

/* ===== 共用：分頁/表頭/朝向 控件（失敗或需調整時）===== */
function renderSheetOrientationControls(workbook, selectedSheet, headerRowIndex, orientation) {
  // 先清掉舊控件（保留 insight）
  ["sheetSelectorGroup","headerRowGroup","orientationGroup","formatError","manualMappingGroup","policyPills"].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  // 工作表選擇
  const sheetGroup = document.createElement("div");
  sheetGroup.className = "filter-group";
  sheetGroup.id = "sheetSelectorGroup";
  const sheetOpts = workbook.SheetNames.map(n=>`<option value="${n}" ${n===selectedSheet?"selected":""}>${n}</option>`).join("");
  sheetGroup.innerHTML = `
    <label for="sheetSelector">工作表（分頁）</label>
    <select id="sheetSelector">${sheetOpts}</select>
  `;
  dataFiltersEl.prepend(sheetGroup);

  // 表頭列（1-based）
  const headerGroup = document.createElement("div");
  headerGroup.className = "filter-group";
  headerGroup.id = "headerRowGroup";
  const hdrSel = [];
  for (let i=1;i<=200;i++) hdrSel.push(`<option value="${i}" ${headerRowIndex===i-1?"selected":""}>第 ${i} 列</option>`);
  headerGroup.innerHTML = `
    <label for="headerRowSelect">表頭列位置</label>
    <select id="headerRowSelect">${hdrSel.join("")}</select>
  `;
  sheetGroup.after(headerGroup);

  // 朝向
  const orientGroup = document.createElement("div");
  orientGroup.className = "filter-group";
  orientGroup.id = "orientationGroup";
  orientGroup.innerHTML = `
    <label for="orientationSelect">資料朝向</label>
    <select id="orientationSelect">
      <option value="auto" ${!orientation||orientation==="auto"?"selected":""}>自動判斷</option>
      <option value="long" ${orientation==="long"?"selected":""}>已是長表（Country/Year/Value）</option>
      <option value="wide-year-in-columns" ${orientation==="wide-year-in-columns"?"selected":""}>國家在列、年份在欄</option>
      <option value="wide-year-in-rows" ${orientation==="wide-year-in-rows"?"selected":""}>年份在列、國家在欄</option>
    </select>
  `;
  headerGroup.after(orientGroup);

  // 綁事件：任一變動就重新套用
  const reapply = () => {
    const sheetName = document.getElementById("sheetSelector").value;
    const hdrIdx    = parseInt(document.getElementById("headerRowSelect").value,10) - 1;
    let oriVal      = document.getElementById("orientationSelect").value;
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:null });
    if (oriVal==="auto") {
      oriVal = detectOrientationByHeader(matrix, hdrIdx) || "wide-year-in-columns";
    }
    applySheetTransform(sheetName, hdrIdx, oriVal);
  };
  document.getElementById("sheetSelector").addEventListener("change", reapply);
  document.getElementById("headerRowSelect").addEventListener("change", reapply);
  document.getElementById("orientationSelect").addEventListener("change", reapply);
}

/* ===== 格式錯誤提示 ===== */
function showFormatError(msg) {
  const old = document.getElementById("formatError");
  if (old) old.remove();
  const p = document.createElement("p");
  p.id = "formatError";
  p.style.color = "#ef4444";
  p.style.marginTop = "0.5rem";
  p.textContent = msg || "這個資料檔目前無法自動辨識欄位。";
  dataFiltersEl.appendChild(p);

  if (currentChart) currentChart.destroy();
  dataTableEl.innerHTML = "";
  statisticsPanelEl.innerHTML = "";
}
function clearFormatError() {
  const old = document.getElementById("formatError");
  if (old) old.remove();
}

/* ===== 手動欄位對應（長表用） ===== */
function renderManualMappingPanel(rowsObj) {
  removeManualMappingPanel();
  const cols = Object.keys(rowsObj[0] || {});
  const panel = document.createElement("div");
  panel.className = "filter-group";
  panel.id = "manualMappingGroup";
  panel.innerHTML = `
    <label>手動欄位對應</label>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.5rem;">
      <div>
        <small>國家 / 地區</small>
        <select id="mapCountry">${cols.map(c=>`<option value="${c}">${c}</option>`).join("")}</select>
      </div>
      <div>
        <small>年份（若無請選『無年份』）</small>
        <select id="mapYear"><option value="__none">無年份</option>${cols.map(c=>`<option value="${c}">${c}</option>`).join("")}</select>
      </div>
      <div>
        <small>值</small>
        <select id="mapValue">${cols.map(c=>`<option value="${c}">${c}</option>`).join("")}</select>
      </div>
      <div style="align-self:end;">
        <button id="mapApplyBtn" class="btn-download" type="button">套用欄位對應</button>
      </div>
    </div>
  `;
  dataFiltersEl.prepend(panel);

  document.getElementById("mapApplyBtn").addEventListener("click", () => {
    manualMapping = {
      enabled: true,
      country: document.getElementById("mapCountry").value || null,
      year:    document.getElementById("mapYear").value || null,
      value:   document.getElementById("mapValue").value || null
    };
    const long = normalizeLongTable(rowsObj);
    const cleaned = cleanAndFilterRows(long);
    if (!cleaned.length) {
      showFormatError("套用後仍無有效數據，請確認欄位選擇或嘗試變更表頭列/朝向。");
      return;
    }
    normalizedRows = cleaned;
    clearFormatError();
    if (isPolicyMode()) {
      renderPolicyUIAndChart();
    } else {
      currentRawRows = rowsFromNormalizedBackToRawKeys(normalizedRows);
      currentKeys = deriveKeysFromNormalized(currentRawRows);
      renderFiltersFromNormalized_general(currentRawRows, currentKeys);
      renderAllFromFilters_general();
    }
  });
}
function removeManualMappingPanel() {
  const p = document.getElementById("manualMappingGroup");
  if (p) p.remove();
}

/* ===== 長表：欄位映射到 {country,year,value} ===== */
function normalizeLongTable(rows) {
  if (!rows || !rows.length) return [];
  const cols = Object.keys(rows[0] || {});
  const pick = (aliases) => {
    const lowerMap = Object.fromEntries(cols.map(n=>[n.toLowerCase(), n]));
    for (const a of aliases) if (lowerMap[a.toLowerCase()]) return lowerMap[a.toLowerCase()];
    for (const c of cols) {
      const low = c.toLowerCase();
      if (aliases.some(a=>low.includes(a.toLowerCase()))) return c;
    }
    return null;
  };
  let cKey = pick(COLUMN_ALIASES.country);
  let yKey = pick(COLUMN_ALIASES.year);
  let vKey = pick(COLUMN_ALIASES.value);

  if (!vKey) vKey = cols.find(k => k!==cKey && k!==yKey) || cols[1];
  if (!cKey || !vKey) return [];

  if (manualMapping.enabled) {
    cKey = manualMapping.country || cKey;
    yKey = manualMapping.year === "__none" ? null : (manualMapping.year || yKey);
    vKey = manualMapping.value || vKey;
  }

  return rows.map(r => ({
    country: r[cKey],
    year:    yKey ? r[yKey] : null,
    value:   r[vKey]
  }));
}

/* ===== 交叉表：年在欄（第一欄=國家；第二欄起=年份）→ melt ===== */
function meltWideYearInColumns(header, body) {
  const yearLabels = header.slice(1);
  const out = [];
  body.forEach(row => {
    if (!row) return;
    const country = safeCell(row[0]);
    if (!country) return;
    for (let j=1; j<row.length; j++) {
      const yearLbl = yearLabels[j-1];
      if (!isYearLike(yearLbl)) continue;
      const value = row[j];
      out.push({ country, year: extractYear(yearLbl), value });
    }
  });
  return out;
}

/* ===== 交叉表：年在列（第一列=國家；第一欄=年份）→ melt ===== */
function meltWideYearInRows(header, body) {
  const countryLabels = header.slice(1);
  const out = [];
  body.forEach(r => {
    if (!r) return;
    const yearLbl = safeCell(r[0]);
    if (!isYearLike(yearLbl)) return;
    const yy = extractYear(yearLbl);
    for (let j=1; j<r.length; j++) {
      const country = countryLabels[j-1];
      if (!country) continue;
      const value = r[j];
      out.push({ country, year: yy, value });
    }
  });
  return out;
}

/* ===== 清理：去註解/空白、排除台灣、強化數值解析 ===== */
function cleanAndFilterRows(rows) {
  const cleaned = rows
    .filter(r => r && r.country && r.value!==null && r.value!=="")
    .map(r => ({
      country: r.country,
      year:    r.year ?? null,
      value:   toNumberRobust(r.value)
    }))
    .filter(r => r.value !== null)
    .filter(r => !/^source:|^note:/i.test(String(r.country)))
    .filter(r => !EXCLUDE_CODES.includes(String(r.country)));
  return cleaned;
}
function toNumberRobust(v) {
  let s = String(v).trim();
  s = s.replace(/[a-z\u00AA-\u02AF\u1D2C-\u1D7F\u2070-\u209F]/gi, ""); // 上標/註腳字母
  s = s.replace(/[,%\s]/g, ""); // 逗號/空白/百分比
  if (s === "" || s === "-" ) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ===== 共用小工具 ===== */
function safeCell(x){ return x==null ? "" : String(x).trim(); }
function extractYear(x){ const m = String(x||"").match(/(18|19|20)\d{2}/); return m ? m[0] : null; }

/* ===== 畫面切換/標題 ===== */
function showVisualizationArea() {
  if (welcomeScreenEl) welcomeScreenEl.hidden = true;
  if (visualizationAreaEl) visualizationAreaEl.hidden = false;
}
function renderDatasetTitle(name) { currentDatasetTitleEl.textContent = name; }

/* ===== 全域事件 / 下載 / 更新時間 ===== */
function bindGlobalEvents(){
  if (chartTypeSelect) chartTypeSelect.addEventListener("change", ()=>{
    if (!isPolicyMode()) renderAllFromFilters_general();
  });
  if (downloadBtn) downloadBtn.addEventListener("click", downloadChartImage);
  if (sidebarToggleBtn && sidebarEl) sidebarToggleBtn.addEventListener("click", ()=>sidebarEl.classList.toggle("active"));
}
function downloadChartImage(){
  if (!currentChart) return;
  const a = document.createElement("a");
  a.href = currentChart.toBase64Image();
  a.download = (currentDatasetFile ? currentDatasetFile.name.replace(/\.xlsx?$/i,"") : "chart") + ".png";
  a.click();
}
function setLastUpdateToday(){
  if (!lastUpdateEl) return;
  const now = new Date();
  lastUpdateEl.textContent = now.toISOString().slice(0,10);
  lastUpdateEl.setAttribute("datetime", now.toISOString());
}
