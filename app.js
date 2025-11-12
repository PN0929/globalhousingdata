// app.js — 多分頁 + 表頭列 + 資料朝向（寬表→長表）版
// 1) 自動偵測最像資料的分頁/表頭與朝向
// 2) 失敗時可手動：工作表、表頭列（1-based）、資料朝向（三選）
// 3) 交叉表（年在欄 或 年在列）自動 melt 成 Country, Year, Value
// 4) 排除台灣，圖表/表格/統計照舊

/***** GitHub 設定（你的版本） *****/
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO  = "globalhousingdata";
const GITHUB_REF   = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR   = "OECD DATA";

/***** 排除的國家代碼 / 名稱 *****/
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];

/***** 欄位別名（長表時用）*****/
const COLUMN_ALIASES = {
  country: ["location","loc","country","country name","country_name","countryname","cou","geo","ref_area","area","economy","countrycode","country code","country_code"],
  year:    ["time","year","time period","time_period","timeperiod","reference period","ref_period","period","date","ref year","ref_year"],
  value:   ["value","obs_value","obs value","val","indicator value","data","amount","measure","obs","estimate","est"]
};

/***** 主題（沿用 MVP）*****/
const TOPICS = [
  { id: "afford",    name: "住宅負擔",  match: ["HM","HC"], insight: "看『住得起』：建議先看最新年份的各國比較，再回看趨勢。" },
  { id: "market",    name: "住宅市場",  match: ["HM"],      insight: "觀察價格與租金指數的變化，切年份看波動。" },
  { id: "condition", name: "住宅條件",  match: ["HC"],      insight: "擁擠度、設備等橫向比較合適。" },
  { id: "policy",    name: "住宅政策",  match: ["PH"],      insight: "補助與支出等政策性指標，可能非每國皆有。" }
];

/***** 狀態 *****/
let currentTopicId = "afford";
let currentChart = null;
let currentWorkbook = null;
let currentDatasetFile = null;

let allFiles = [];
let normalizedRows = [];          // 最終長表資料
let normKeys = { country:"country", year:"year", value:"value" }; // 標準鍵名

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

/* ===== 載入單一 Excel：多分頁 + 自動/手動擷取 ===== */
async function loadOneExcel(file) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error("無法下載檔案：" + file.name);
    const buf = await res.arrayBuffer();
    currentWorkbook = XLSX.read(buf, { type: "array" });

    // 自動挑選最佳分頁 + 表頭 + 朝向
    const pick = autoPickBestSheet(currentWorkbook);
    if (!pick) {
      showVisualizationArea();
      renderDatasetTitle(file.name.replace(/\.xlsx?$/i,""));
      renderSheetOrientationControls(currentWorkbook); // 讓使用者手動選
      showFormatError("找不到合適的資料區。請手動選擇「工作表 / 表頭列 / 資料朝向」。");
      return;
    }

    // 成功 → 正常流程
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

    // 嘗試前 50 列當表頭
    const maxScan = Math.min(50, matrix.length);
    for (let hdrIdx = 0; hdrIdx < maxScan; hdrIdx++) {
      const headerRow = matrix[hdrIdx] || [];
      const orientation = detectOrientationByHeader(matrix, hdrIdx); // 'wide-year-in-columns' | 'wide-year-in-rows' | 'long'
      if (!orientation) continue;

      // 分數：命中程度 + 行數
      const rowsCount = matrix.length - hdrIdx;
      let score = (orientation==="long" ? 3 : 2); // 長表更容易用
      score += estimateHeaderHit(headerRow);      // 表頭內像年份/國家詞的命中
      score += Math.log(rowsCount + 1);

      if (!best || score > best.score) best = { sheetName, headerRow: hdrIdx, orientation, score };
    }
  }
  return best;
}

/* ===== 估算表頭命中分數（越高越可能是資料表頭） ===== */
function estimateHeaderHit(headerRow) {
  const labels = headerRow.map(v => (v==null ? "" : String(v))).map(s=>s.trim().toLowerCase());
  const hasCountry = labels.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const yearLikeCt = labels.filter(isYearLike).length;
  return (hasCountry?1:0) + Math.min(2, yearLikeCt>0 ? 1 : 0);
}

/* ===== 判斷朝向（依表頭與第一欄/列分布） ===== */
function detectOrientationByHeader(matrix, headerIdx) {
  const header = (matrix[headerIdx] || []).map(v => v==null ? "" : String(v).trim());
  const colCount = header.length;
  const firstColBelow = (matrix.slice(headerIdx+1).map(r=>r?.[0])).map(v => v==null ? "" : String(v).trim());

  const yearLikeCols = header.slice(1).filter(isYearLike).length;         // 年在欄：表頭第2欄起很多年份
  const yearLikeRows = firstColBelow.filter(isYearLike).length;           // 年在列：第一欄往下很多年份

  // 長表偵測：表頭同時含 country-like & year-like & value-like
  const headerLower = header.map(s=>s.toLowerCase());
  const hasCountry = headerLower.some(lbl => COLUMN_ALIASES.country.some(a=>lbl.includes(a)));
  const hasYear    = headerLower.some(lbl => COLUMN_ALIASES.year.some(a=>lbl.includes(a)));
  const hasValue   = headerLower.some(lbl => COLUMN_ALIASES.value.some(a=>lbl.includes(a)));
  if (hasCountry && hasYear && hasValue) return "long";

  if (yearLikeCols >= Math.max(3, Math.floor((colCount-1)/3))) return "wide-year-in-columns";
  if (yearLikeRows >= Math.max(3, Math.floor((matrix.length-headerIdx-1)/5))) return "wide-year-in-rows";

  // 不確定就回 null
  return null;
}

/* ===== 判斷是否像年份（1950~2100 的4位數或字串含4位數年份） ===== */
function isYearLike(x) {
  const s = String(x||"").trim();
  const m = s.match(/(19|20)\d{2}/);
  if (!m) return false;
  const y = parseInt(m[0],10);
  return y>=1950 && y<=2100;
}

/* ===== 套用：分頁 + 表頭列 + 朝向 → 正規化長表 → 畫面 ===== */
function applySheetTransform(sheetName, headerRowIndex, orientation) {
  showVisualizationArea();
  renderDatasetTitle(`${currentDatasetFile.name.replace(/\.xlsx?$/i,"")}（${sheetName}）`);
  renderSheetOrientationControls(currentWorkbook, sheetName, headerRowIndex, orientation);

  const sheet = currentWorkbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // 擷取從 headerRowIndex 開始的「資料矩陣」
  const header = (matrix[headerRowIndex] || []).map(v => v==null ? "" : String(v).trim());
  const body   = matrix.slice(headerRowIndex+1);

  let longRows;

  if (orientation === "long") {
    // 直接用 header 當欄名
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, range: headerRowIndex });
    longRows = normalizeLongTable(rows);
  } else if (orientation === "wide-year-in-columns") {
    // 國家在列 / 年份在欄：第一欄是國家，第二欄起是年份
    longRows = meltWideYearInColumns(header, body);
  } else if (orientation === "wide-year-in-rows") {
    // 年在列 / 國家在欄：第一列是國家，第一欄是年份
    longRows = meltWideYearInRows(header, body);
  } else {
    showFormatError("朝向設定不正確。");
    return;
  }

  // 清理：去除註解空列、排除台灣、數值轉數字
  longRows = cleanAndFilterRows(longRows);

  // 更新全域狀態並渲染
  normalizedRows = longRows;
  renderFiltersFromNormalized(normalizedRows);
  renderAllFromFilters();
}

/* ===== 長表：欄位別名標準化到 {country,year,value} ===== */
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

  const cKey = pick(COLUMN_ALIASES.country) || cols[0];
  const yKey = pick(COLUMN_ALIASES.year);
  const vKey = pick(COLUMN_ALIASES.value) || cols.find(k=>k!==cKey && k!==yKey) || cols[1];

  normKeys = { country:"country", year:"year", value:"value" };

  return rows.map(r => ({
    country: r[cKey],
    year:    yKey ? r[yKey] : null,
    value:   r[vKey]
  }));
}

/* ===== 交叉表：年在欄（第一欄=國家；第二欄起=年份）→ melt ===== */
function meltWideYearInColumns(header, body) {
  const countryColName = header[0] || "Country";
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
  normKeys = { country:"country", year:"year", value:"value" };
  return out;
}

/* ===== 交叉表：年在列（第一列=國家；第一欄=年份）→ melt ===== */
function meltWideYearInRows(header, body) {
  // header 是第一列，第一格通常是空/標題，其餘是國家
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
  normKeys = { country:"country", year:"year", value:"value" };
  return out;
}

/* ===== 工具：取單元格字串、安全修整 ===== */
function safeCell(x){ return x==null ? "" : String(x).trim(); }
function extractYear(x){ const m = String(x||"").match(/(19|20)\d{2}/); return m ? m[0] : null; }

/* ===== 清理：去註解/空白、排除台灣、value 轉數字 ===== */
function cleanAndFilterRows(rows) {
  const cleaned = rows
    .filter(r => r && r.country && r.value!==null && r.value!=="" && !/^source:|note:/i.test(String(r.country)))
    .map(r => ({ country:r.country, year:r.year, value: toNumberOrNull(r.value) }))
    .filter(r => r.value !== null);
  return cleaned.filter(r => !EXCLUDE_CODES.includes(String(r.country)));
}
function toNumberOrNull(v) {
  const s = String(v).replace(/[, ]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/* ===== 在篩選區插入：工作表 / 表頭列 / 朝向 控制項 ===== */
function renderSheetOrientationControls(workbook, selectedSheet, headerRowIndex, orientation) {
  // 先清掉舊控件（保留 insight）
  ["sheetSelectorGroup","headerRowGroup","orientationGroup","formatError"].forEach(id=>{
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
  for (let i=1;i<=50;i++) hdrSel.push(`<option value="${i}" ${headerRowIndex===i-1?"selected":""}>第 ${i} 列</option>`);
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
  document.getElementById("sheetSelector").addEventListener("change", () => {
    const sheetName = document.getElementById("sheetSelector").value;
    const hdrIdx    = parseInt(document.getElementById("headerRowSelect").value,10) - 1;
    let oriVal      = document.getElementById("orientationSelect").value;
    if (oriVal==="auto") {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:null });
      oriVal = detectOrientationByHeader(matrix, hdrIdx) || "wide-year-in-columns";
    }
    applySheetTransform(sheetName, hdrIdx, oriVal);
  });
  document.getElementById("headerRowSelect").addEventListener("change", () => {
    const sheetName = document.getElementById("sheetSelector").value;
    const hdrIdx    = parseInt(document.getElementById("headerRowSelect").value,10) - 1;
    let oriVal      = document.getElementById("orientationSelect").value;
    if (oriVal==="auto") {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:null });
      oriVal = detectOrientationByHeader(matrix, hdrIdx) || "wide-year-in-columns";
    }
    applySheetTransform(sheetName, hdrIdx, oriVal);
  });
  document.getElementById("orientationSelect").addEventListener("change", () => {
    const sheetName = document.getElementById("sheetSelector").value;
    const hdrIdx    = parseInt(document.getElementById("headerRowSelect").value,10) - 1;
    let oriVal      = document.getElementById("orientationSelect").value;
    if (oriVal==="auto") {
      const sheet = workbook.Sheets[sheetName];
      const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:null });
      oriVal = detectOrientationByHeader(matrix, hdrIdx) || "wide-year-in-columns";
    }
    applySheetTransform(sheetName, hdrIdx, oriVal);
  });
}

/* ===== 錯誤訊息 ===== */
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

/* ===== 畫面切換/標題 ===== */
function showVisualizationArea() {
  if (welcomeScreenEl) welcomeScreenEl.hidden = true;
  if (visualizationAreaEl) visualizationAreaEl.hidden = false;
}
function renderDatasetTitle(name) {
  currentDatasetTitleEl.textContent = name;
}

/* ===== 篩選器（根據標準化後的長表）===== */
function renderFiltersFromNormalized(rows) {
  // 清除舊的（保留三個手動控件與 insight）
  Array.from(dataFiltersEl.querySelectorAll(".filter-group"))
    .filter(el => !["sheetSelectorGroup","headerRowGroup","orientationGroup"].includes(el.id))
    .forEach(el => el.remove());

  // 國家
  const countries = Array.from(new Set(rows.map(r=>r.country).filter(Boolean))).sort();
  const countryGroup = document.createElement("div");
  countryGroup.className = "filter-group";
  countryGroup.innerHTML = `
    <label for="filterCountry">國家 / 地區</label>
    <select id="filterCountry">
      <option value="__all">全部</option>
      ${countries.map(c=>`<option value="${c}">${c}</option>`).join("")}
    </select>
  `;
  dataFiltersEl.appendChild(countryGroup);

  // 年份（若有）
  const years = Array.from(new Set(rows.map(r=>r.year).filter(Boolean))).sort();
  if (years.length) {
    const yearGroup = document.createElement("div");
    yearGroup.className = "filter-group";
    yearGroup.innerHTML = `
      <label for="filterYear">年份</label>
      <select id="filterYear">
        <option value="__all">全部</option>
        ${years.map(y=>`<option value="${y}">${y}</option>`).join("")}
      </select>
    `;
    dataFiltersEl.appendChild(yearGroup);
    yearGroup.querySelector("select").addEventListener("change", renderAllFromFilters);
  }

  countryGroup.querySelector("select").addEventListener("change", renderAllFromFilters);
}

/* ===== 篩選後 → 畫圖 / 表格 / 統計 ===== */
function renderAllFromFilters() {
  if (!normalizedRows.length) return;
  const cSel = document.getElementById("filterCountry");
  const ySel = document.getElementById("filterYear");
  const selCountry = cSel ? cSel.value : "__all";
  const selYear    = ySel ? ySel.value : "__all";

  const rows = normalizedRows.filter(r => {
    if (selCountry !== "__all" && r.country !== selCountry) return false;
    if (selYear !== "__all" && String(r.year) !== String(selYear)) return false;
    return true;
  });

  renderChart(rows);
  renderTable(rows);
  renderStats(rows);
}

/* ===== 畫圖（自動判斷 + bar-horizontal）===== */
function renderChart(rows) {
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (currentChart) currentChart.destroy();

  let type = chartTypeSelect ? chartTypeSelect.value : "auto";
  if (type==="auto") {
    const uniqYears = new Set(rows.map(r=>r.year).filter(Boolean));
    type = uniqYears.size > 3 ? "line" : "bar";
  }
  const isHorizontal = type === "bar-horizontal";

  const uniqCountries = Array.from(new Set(rows.map(r=>r.country).filter(Boolean)));
  const uniqYears = Array.from(new Set(rows.map(r=>r.year).filter(Boolean))).sort();

  let labels = [], data = [];

  if (uniqCountries.length === 1 && uniqYears.length) {
    // 單一國家 → 用年份做 X
    labels = uniqYears;
    data = labels.map(y => {
      const f = rows.find(r => String(r.year)===String(y));
      return f ? f.value : null;
    });
  } else {
    // 多國家 → 用國家做 X，取最新年（若有年）
    labels = uniqCountries;
    data = labels.map(c => {
      const cs = rows.filter(r => r.country===c);
      if (uniqYears.length) {
        const last = cs.sort((a,b)=>Number(a.year)-Number(b.year)).at(-1);
        return last ? last.value : null;
      }
      return cs[0] ? cs[0].value : null;
    });
  }

  currentChart = new Chart(ctx, {
    type: isHorizontal ? "bar" : type,
    data: { labels, datasets:[{ label: "Value", data, borderWidth:2, fill:false }] },
    options:{
      responsive:true, maintainAspectRatio:false,
      indexAxis: isHorizontal? "y":"x",
      scales: { y: { beginAtZero:true } }
    }
  });
}

/* ===== 表格 & 統計 ===== */
function renderTable(rows) {
  if (!dataTableEl) return;
  if (!rows.length) { dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>"; return; }
  const cols = ["country","year","value"];
  const thead = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${r[c]??""}</td>`).join("")}</tr>`).join("")}</tbody>`;
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}
function renderStats(rows) {
  if (!statisticsPanelEl) return;
  if (!rows.length) { statisticsPanelEl.innerHTML = ""; return; }
  const nums = rows.map(r=>r.value).filter(n=>typeof n==="number" && !isNaN(n));
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

/* ===== 全域事件 & 下載 & 更新時間 ===== */
function bindGlobalEvents(){
  if (chartTypeSelect) chartTypeSelect.addEventListener("change", renderAllFromFilters);
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
