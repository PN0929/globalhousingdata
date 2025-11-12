// app.js － 多分頁自動偵測 & 表頭掃描版

/***** 0) GitHub 與基本設定 *****/
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO = "globalhousingdata";
const GITHUB_REF  = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR  = "OECD DATA";

// 排除的國家（口徑可能不同）
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];

/** 欄位別名（可自行增修） */
const COLUMN_ALIASES = {
  country: [
    "location","loc","country","country name","country_name","countryname",
    "cou","geo","ref_area","area","economy","countrycode","country code","country_code"
  ],
  year: [
    "time","year","time period","time_period","timeperiod","reference period",
    "ref_period","period","date","ref year","ref_year"
  ],
  value: [
    "value","obs_value","obs value","val","indicator value","data",
    "amount","measure","obs","estimate","est"
  ]
};

/***** 1) 主題定義（沿用 MVP） *****/
const TOPICS = [
  { id: "afford",   name: "住宅負擔",   match: ["HM","HC"], insight: "看『住得起』：建議先看最新年份的各國比較，再回看趨勢。" },
  { id: "market",   name: "住宅市場",   match: ["HM"],      insight: "觀察價格與租金指數的變化，切年份看波動。" },
  { id: "condition",name: "住宅條件",   match: ["HC"],      insight: "擁擠度、設備等橫向比較合適。" },
  { id: "policy",   name: "住宅政策",   match: ["PH"],      insight: "補助與支出等政策性指標，可能非每國皆有。" }
];

/***** 2) 狀態變數 *****/
let currentTopicId = "afford";
let currentChart = null;
let currentRawRows = [];
let currentDatasetFile = null;
let currentWorkbook = null;
let currentKeys = null; // {countryKey, yearKey, valueKey}
let allFiles = [];

/***** 3) DOM 參照 *****/
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

/***** 4) 初始化 *****/
document.addEventListener("DOMContentLoaded", () => {
  renderTopicButtons();
  loadGitHubDatasets();
  setLastUpdateToday();
  bindGlobalEvents();
});

/* =========================
   主題按鈕
   ========================= */
function renderTopicButtons() {
  topicListEl.innerHTML = "";
  TOPICS.forEach((topic, idx) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (idx === 0 ? " active" : "");
    btn.textContent = topic.name;
    btn.dataset.topicId = topic.id;
    btn.addEventListener("click", () => {
      topicListEl.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTopicId = topic.id;
      filterAndRenderDatasets();
      renderInsightForTopic();
    });
    topicListEl.appendChild(btn);
  });
}

/* =========================
   讀 GitHub 檔案列表
   ========================= */
async function loadGitHubDatasets() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_DIR)}?ref=${GITHUB_REF}`;
  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("無法取得 GitHub 資料夾內容");
    const files = await res.json();
    allFiles = files.filter(f => f.type === "file" && (f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls")));
    filterAndRenderDatasets();
  } catch (e) {
    console.error(e);
    datasetListEl.innerHTML = `<p style="color:#ef4444">載入失敗：${e.message}</p>`;
  }
}

/* =========================
   依主題顯示資料集
   ========================= */
function filterAndRenderDatasets() {
  const topic = TOPICS.find(t => t.id === currentTopicId);
  datasetListEl.innerHTML = "";
  if (!allFiles.length) {
    datasetListEl.innerHTML = `<p>沒有可用的檔案</p>`;
    return;
  }
  const matched = allFiles.filter(file => {
    const up = file.name.toUpperCase();
    return topic ? topic.match.some(code => up.includes(code)) : true;
  });
  if (!matched.length) {
    datasetListEl.innerHTML = `<p>這個主題暫時沒有對應的指標</p>`;
    return;
  }
  matched.forEach(file => {
    const item = document.createElement("div");
    item.className = "dataset-item";
    item.dataset.filepath = file.path;
    item.innerHTML = `
      <div class="dataset-code">${file.name.replace(/\.xlsx?$/i, "")}</div>
      <div class="dataset-name">${file.path}</div>
    `;
    item.addEventListener("click", () => {
      datasetListEl.querySelectorAll(".dataset-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      currentDatasetFile = file;
      loadDatasetFileFromGitHub(file);
    });
    datasetListEl.appendChild(item);
  });
  renderInsightForTopic();
}

/* =========================
   主題說明
   ========================= */
function renderInsightForTopic() {
  const topic = TOPICS.find(t => t.id === currentTopicId);
  if (!insightBoxEl) return;
  insightBoxEl.innerHTML = `
    <h4>如何看這個主題？</h4>
    <p>${topic ? topic.insight : "從左側選擇一個資料集，系統會幫你畫出常見的圖表。"}</p>
  `;
}

/* =========================
   下載 Excel 並自動挑分頁 + 表頭
   ========================= */
async function loadDatasetFileFromGitHub(file) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error("無法下載檔案：" + file.name);
    const buf = await res.arrayBuffer();
    currentWorkbook = XLSX.read(buf, { type: "array" });

    const best = pickBestSheet(currentWorkbook);
    if (!best) {
      showFormatError("找不到合適的分頁 / 表頭。請檢查檔案內容。");
      return;
    }

    // 儲存 & 顯示
    showVisualizationArea();
    renderDatasetTitle(`${file.name.replace(/\.xlsx?$/i, "")}（${best.sheetName}）`);

    // 畫分頁下拉（可手動切換）
    renderSheetSelector(currentWorkbook, best.sheetName);

    // 寫入資料
    currentRawRows = excludeTaiwan(best.rows);
    currentKeys = best.keys;

    renderFiltersFromNormalized({ rows: currentRawRows, ...currentKeys });
    renderAllFromFilters();
  } catch (e) {
    console.error(e);
    alert("讀取檔案失敗：" + e.message);
  }
}

/* =========================
   從整本 workbook 找「最佳分頁」
   - 掃每個分頁
   - 先以 header:1 取二維陣列，尋找最像表頭的那一列
   - 再用該列當表頭轉成物件列
   - 以「欄位可辨識度 + 行數」打分數
   ========================= */
function pickBestSheet(workbook) {
  let best = null; // {sheetName, rows, keys, score}
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    // 先讀成二維陣列
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    if (!matrix || !matrix.length) continue;

    // 找候選表頭列（回傳 rowIndex）
    const headerIdx = findHeaderRowIndex(matrix);
    if (headerIdx === -1) continue;

    // 用這一列當表頭，轉成物件陣列
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerIdx });

    if (!rows || rows.length === 0) continue;

    // 嘗試辨識欄位
    const keys = detectKeys(Object.keys(rows[0]));
    if (!keys.countryKey || !keys.valueKey) continue;

    // 分數：辨識欄位數（最多 3） + log(行數)
    let score = (keys.countryKey ? 1 : 0) + (keys.yearKey ? 1 : 0) + (keys.valueKey ? 1 : 0);
    score += Math.log(rows.length + 1);

    if (!best || score > best.score) {
      best = { sheetName, rows, keys, score };
    }
  }
  return best;
}

/* 找最可能是表頭的列：看該列文字中是否包含我們的別名關鍵字 */
function findHeaderRowIndex(matrix) {
  let bestIdx = -1;
  let bestScore = -1;
  for (let i = 0; i < Math.min(matrix.length, 50); i++) { // 前 50 列掃過
    const row = matrix[i];
    if (!row || !row.length) continue;
    const labels = row.map(v => (v == null ? "" : String(v))).map(s => s.trim().toLowerCase());

    // 計分：有多少欄位名稱命中我們的別名（允許包含關鍵字）
    const hit = (aliases) => {
      return labels.some(lbl => aliases.some(a => lbl.includes(a.toLowerCase())));
    };
    let score = 0;
    if (hit(COLUMN_ALIASES.country)) score++;
    if (hit(COLUMN_ALIASES.year))    score++;
    if (hit(COLUMN_ALIASES.value))   score++;

    // 至少命中 1 個就視為候選
    if (score > bestScore && score >= 1) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/* 依欄位名稱偵測 country/year/value（精緻比對：完全相等或含有關鍵字） */
function detectKeys(colNames) {
  const original = [...colNames];
  const lowered  = Object.fromEntries(original.map(n => [n.toLowerCase(), n]));

  const pick = (aliases) => {
    // 完全相等
    for (const a of aliases) {
      if (lowered[a.toLowerCase()]) return lowered[a.toLowerCase()];
    }
    // 包含關鍵字
    for (const name of original) {
      const low = name.toLowerCase();
      if (aliases.some(a => low.includes(a.toLowerCase()))) return name;
    }
    return null;
  };

  const countryKey = pick(COLUMN_ALIASES.country);
  const yearKey    = pick(COLUMN_ALIASES.year);
  const valueKey   = pick(COLUMN_ALIASES.value);

  return { countryKey, yearKey, valueKey };
}

/* 排除台灣 */
function excludeTaiwan(rows) {
  return rows.filter(row => {
    const vals = Object.values(row).map(v => (v != null ? String(v) : ""));
    return !vals.some(v => EXCLUDE_CODES.includes(v));
  });
}

/* =========================
   分頁（工作表）下拉，允許手動切換
   ========================= */
function renderSheetSelector(workbook, selected) {
  // 先移除舊的 selector
  const old = dataFiltersEl.querySelector("#sheetSelectorGroup");
  if (old) old.remove();

  const group = document.createElement("div");
  group.className = "filter-group";
  group.id = "sheetSelectorGroup";

  const opts = workbook.SheetNames.map(name => `<option value="${name}" ${name===selected?"selected":""}>${name}</option>`).join("");

  group.innerHTML = `
    <label for="sheetSelector">工作表（分頁）</label>
    <select id="sheetSelector">${opts}</select>
  `;
  dataFiltersEl.prepend(group);

  group.querySelector("select").addEventListener("change", (e) => {
    const sheetName = e.target.value;
    applySheetByName(workbook, sheetName);
  });
}

/* 手動切換分頁時的處理 */
function applySheetByName(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return;

  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
  const headerIdx = findHeaderRowIndex(matrix);
  if (headerIdx === -1) {
    showFormatError(`分頁「${sheetName}」找不到可辨識的表頭。`);
    return;
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerIdx });
  const keys = detectKeys(Object.keys(rows[0] || {}));
  if (!keys.countryKey || !keys.valueKey) {
    showFormatError(`分頁「${sheetName}」缺少可辨識的「國家 / 數值」欄位。`);
    return;
  }

  currentRawRows = excludeTaiwan(rows);
  currentKeys = keys;

  // 更新標題顯示當前分頁
  if (currentDatasetFile) {
    renderDatasetTitle(`${currentDatasetFile.name.replace(/\.xlsx?$/i, "")}（${sheetName}）`);
  }

  // 重畫篩選與圖表
  renderFiltersFromNormalized({ rows: currentRawRows, ...currentKeys });
  renderAllFromFilters();
}

/* =========================
   畫面切換 / 標題
   ========================= */
function showVisualizationArea() {
  if (welcomeScreenEl) welcomeScreenEl.hidden = true;
  if (visualizationAreaEl) visualizationAreaEl.hidden = false;
}
function renderDatasetTitle(name) {
  currentDatasetTitleEl.textContent = name;
}

/* =========================
   錯誤提示（格式不符）
   ========================= */
function showFormatError(msg) {
  // 清圖清表
  if (currentChart) currentChart.destroy();
  dataTableEl.innerHTML = "";
  statisticsPanelEl.innerHTML = "";

  // 在篩選區顯示錯誤
  const old = dataFiltersEl.querySelector(".format-error");
  if (old) old.remove();
  const p = document.createElement("p");
  p.className = "format-error";
  p.style.color = "#ef4444";
  p.style.marginTop = "0.5rem";
  p.textContent = msg || "這個資料檔目前無法自動辨識欄位。";
  dataFiltersEl.appendChild(p);
}

/* =========================
   產生篩選器（用標準化 keys）
   ========================= */
function renderFiltersFromNormalized({ rows, countryKey, yearKey, valueKey }) {
  // 清掉舊篩選器（保留 sheet selector/insight）
  Array.from(dataFiltersEl.querySelectorAll(".filter-group"))
    .filter(el => el.id !== "sheetSelectorGroup")
    .forEach(el => el.remove());

  dataFiltersEl.dataset.countryKey = countryKey || "";
  dataFiltersEl.dataset.yearKey    = yearKey    || "";
  dataFiltersEl.dataset.valueKey   = valueKey   || "";

  // 國家
  const countries = Array.from(new Set(rows.map(r => r[countryKey]).filter(Boolean)));
  const countryGroup = document.createElement("div");
  countryGroup.className = "filter-group";
  countryGroup.innerHTML = `
    <label for="filterCountry">國家 / 地區</label>
    <select id="filterCountry">
      <option value="__all">全部</option>
      ${countries.map(c => `<option value="${c}">${c}</option>`).join("")}
    </select>
  `;
  dataFiltersEl.appendChild(countryGroup);
  countryGroup.querySelector("select").addEventListener("change", renderAllFromFilters);

  // 年份（若有）
  if (yearKey) {
    const years = Array.from(new Set(rows.map(r => r[yearKey]).filter(Boolean))).sort();
    const yearGroup = document.createElement("div");
    yearGroup.className = "filter-group";
    yearGroup.innerHTML = `
      <label for="filterYear">年份</label>
      <select id="filterYear">
        <option value="__all">全部</option>
        ${years.map(y => `<option value="${y}">${y}</option>`).join("")}
      </select>
    `;
    dataFiltersEl.appendChild(yearGroup);
    yearGroup.querySelector("select").addEventListener("change", renderAllFromFilters);
  }
}

/* =========================
   篩選後 → 畫圖 / 表 / 統計
   ========================= */
function renderAllFromFilters() {
  if (!currentRawRows.length || !currentKeys) return;

  const { countryKey, yearKey, valueKey } = currentKeys;
  const cSel = document.getElementById("filterCountry");
  const ySel = document.getElementById("filterYear");

  const selCountry = cSel ? cSel.value : "__all";
  const selYear    = ySel ? ySel.value : "__all";

  const filtered = currentRawRows.filter(row => {
    if (selCountry !== "__all" && row[countryKey] !== selCountry) return false;
    if (yearKey && selYear !== "__all" && String(row[yearKey]) !== String(selYear)) return false;
    return true;
  });

  renderChartFromData(filtered, currentKeys);
  renderTable(filtered);
  renderStats(filtered, valueKey);
}

/* =========================
   畫圖（自動決定類型 + 支援橫向）
   ========================= */
function renderChartFromData(rows, keys) {
  const { countryKey, yearKey, valueKey } = keys;
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (currentChart) currentChart.destroy();

  let typeSel = chartTypeSelect ? chartTypeSelect.value : "auto";
  if (typeSel === "auto") {
    const uniqYears = yearKey ? new Set(rows.map(r => r[yearKey]).filter(Boolean)) : new Set();
    typeSel = uniqYears.size > 3 ? "line" : "bar";
  }
  const isHorizontal = typeSel === "bar-horizontal";

  const uniqCountries = Array.from(new Set(rows.map(r => r[countryKey]).filter(Boolean)));
  const uniqYears     = yearKey ? Array.from(new Set(rows.map(r => r[yearKey]).filter(Boolean))).sort() : [];

  let labels = [];
  let data   = [];

  if (yearKey && uniqCountries.length === 1) {
    labels = uniqYears;
    data   = labels.map(y => {
      const found = rows.find(r => String(r[yearKey]) === String(y));
      return found ? Number(found[valueKey]) : null;
    });
  } else {
    labels = uniqCountries;
    data   = labels.map(c => {
      const cr = rows.filter(r => r[countryKey] === c);
      if (yearKey) {
        const last = cr.sort((a,b)=>Number(a[yearKey]) - Number(b[yearKey]))?.at(-1);
        return last ? Number(last[valueKey]) : null;
      } else {
        return cr[0] ? Number(cr[0][valueKey]) : null;
      }
    });
  }

  currentChart = new Chart(ctx, {
    type: isHorizontal ? "bar" : typeSel,
    data: {
      labels,
      datasets: [{ label: "Value", data, borderWidth: 2, fill: false }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isHorizontal ? "y" : "x",
      scales: { y: { beginAtZero: true } }
    }
  });
}

/* =========================
   表格 & 統計
   ========================= */
function renderTable(rows) {
  if (!dataTableEl) return;
  if (!rows || !rows.length) { dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>"; return; }
  const cols = Object.keys(rows[0]);
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}

function renderStats(rows, valueKey) {
  if (!statisticsPanelEl) return;
  if (!rows || !rows.length) { statisticsPanelEl.innerHTML = ""; return; }
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

/* =========================
   下載 & 事件 & 更新時間
   ========================= */
function bindGlobalEvents() {
  if (chartTypeSelect) chartTypeSelect.addEventListener("change", renderAllFromFilters);
  if (downloadBtn)     downloadBtn.addEventListener("click", downloadChartImage);
  if (sidebarToggleBtn && sidebarEl) sidebarToggleBtn.addEventListener("click",()=>sidebarEl.classList.toggle("active"));
}
function downloadChartImage() {
  if (!currentChart) return;
  const a = document.createElement("a");
  a.href = currentChart.toBase64Image();
  a.download = (currentDatasetFile ? currentDatasetFile.name.replace(/\.xlsx?$/i,"") : "chart") + ".png";
  a.click();
}
function setLastUpdateToday() {
  if (!lastUpdateEl) return;
  const now = new Date();
  lastUpdateEl.textContent = now.toISOString().slice(0,10);
  lastUpdateEl.setAttribute("datetime", now.toISOString());
}
