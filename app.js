// app.js

// ===== 0. GitHub 設定 =====
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO = "globalhousingdata";
const GITHUB_REF = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR = "OECD DATA";

// 要排除的國家
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];

// 常見欄位別名表（可以之後自己加）
const COLUMN_ALIASES = {
  country: [
    "location", "loc", "country", "country_name", "countryname",
    "cou", "geo", "ref_area", "area", "economy", "countrycode", "country_code"
  ],
  year: [
    "time", "year", "time_period", "timeperiod", "reference period",
    "ref_period", "period", "date"
  ],
  value: [
    "value", "obs_value", "obs_value (national currency)", "val",
    "indicator value", "data", "amount", "measure", "obs"
  ]
};

// ===== 1. 主題定義（MVP） =====
const TOPICS = [
  {
    id: "afford",
    name: "住宅負擔",
    match: ["HM", "HC"],
    insight: "這一組指標主要用來看「住得起」的問題，建議先看最新年份的各國比較，再往回看時間變化。"
  },
  {
    id: "market",
    name: "住宅市場",
    match: ["HM"],
    insight: "住宅市場指標可以用來觀察價格與租金的變化，搭配年份切換可以看到市場的波動。"
  },
  {
    id: "condition",
    name: "住宅條件",
    match: ["HC"],
    insight: "住宅條件指標多半和擁擠度、設備有關，適合做各國水準的橫向比較。"
  },
  {
    id: "policy",
    name: "住宅政策",
    match: ["PH"],
    insight: "住宅政策類的指標較偏向政府補助與支出，可能不是每個國家都有資料。"
  }
];

let currentTopicId = "afford";
let currentChart = null;
let currentRawRows = [];
let currentDatasetFile = null;
let allFiles = [];

// DOM
const datasetListEl = document.getElementById("datasetList");
const topicListEl = document.getElementById("topicList");
const welcomeScreenEl = document.getElementById("welcomeScreen");
const visualizationAreaEl = document.getElementById("visualizationArea");
const currentDatasetTitleEl = document.getElementById("currentDatasetTitle");
const dataFiltersEl = document.getElementById("dataFilters");
const dataTableEl = document.getElementById("dataTable");
const statisticsPanelEl = document.getElementById("statisticsPanel");
const chartTypeSelect = document.getElementById("chartType");
const downloadBtn = document.getElementById("downloadBtn");
const lastUpdateEl = document.getElementById("lastUpdate");
const insightBoxEl = document.getElementById("insightBox");
const sidebarToggleBtn = document.getElementById("sidebarToggle");
const sidebarEl = document.querySelector(".sidebar");

// ===== init =====
document.addEventListener("DOMContentLoaded", () => {
  renderTopicButtons();
  loadGitHubDatasets();
  setLastUpdateToday();
  bindGlobalEvents();
});

/* ============================
   2. 主題按鈕
   ============================ */
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

/* ============================
   3. 讀 GitHub 檔案
   ============================ */
async function loadGitHubDatasets() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(
    GITHUB_DIR
  )}?ref=${GITHUB_REF}`;
  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("無法取得 GitHub 資料夾內容");
    const files = await res.json();
    allFiles = files.filter(
      f =>
        f.type === "file" &&
        (f.name.toLowerCase().endsWith(".xlsx") ||
          f.name.toLowerCase().endsWith(".xls"))
    );
    filterAndRenderDatasets();
  } catch (err) {
    console.error(err);
    datasetListEl.innerHTML = `<p style="color:#ef4444">載入失敗：${err.message}</p>`;
  }
}

/* ============================
   4. 依主題顯示資料集
   ============================ */
function filterAndRenderDatasets() {
  const topic = TOPICS.find(t => t.id === currentTopicId);
  datasetListEl.innerHTML = "";

  if (!allFiles.length) {
    datasetListEl.innerHTML = `<p>沒有可用的檔案</p>`;
    return;
  }

  const matchedFiles = allFiles.filter(file => {
    if (!topic) return true;
    const upper = file.name.toUpperCase();
    return topic.match.some(code => upper.includes(code));
  });

  if (!matchedFiles.length) {
    datasetListEl.innerHTML = `<p>這個主題暫時沒有對應的指標</p>`;
    return;
  }

  matchedFiles.forEach(file => {
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

/* ============================
   5. 顯示主題說明
   ============================ */
function renderInsightForTopic() {
  const topic = TOPICS.find(t => t.id === currentTopicId);
  if (!insightBoxEl) return;
  insightBoxEl.innerHTML = `
    <h4>如何看這個主題？</h4>
    <p>${topic ? topic.insight : "從左側選擇一個資料集，系統會幫你畫出常見的圖表。"}</p>
  `;
}

/* ============================
   6. 下載並解析 XLSX
   ============================ */
async function loadDatasetFileFromGitHub(file) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;
  try {
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error("無法下載檔案：" + file.name);
    const arrayBuffer = await res.arrayBuffer();

    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // 先排除台灣
    const cleaned = rows.filter(row => {
      const vals = Object.values(row).map(v => (v != null ? String(v) : ""));
      return !vals.some(v => EXCLUDE_CODES.includes(v));
    });

    currentRawRows = cleaned;

    showVisualizationArea();
    renderDatasetTitle(file.name);

    // 嘗試標準化
    const normalized = normalizeRows(cleaned);

    if (!normalized) {
      // 找不到對應欄位
      renderFormatError();
      return;
    }

    // 有找到欄位才畫篩選
    renderFiltersFromNormalized(normalized);
    renderAllFromFilters();
  } catch (err) {
    console.error(err);
    alert("讀取檔案失敗：" + err.message);
  }
}

/* ============================
   7. 將 rows 標準化
   找出 countryKey/yearKey/valueKey
   ============================ */
function normalizeRows(rows) {
  if (!rows || !rows.length) return null;

  const sample = rows[0];
  const colNames = Object.keys(sample);

  const countryKey = guessKey(colNames, COLUMN_ALIASES.country);
  const yearKey = guessKey(colNames, COLUMN_ALIASES.year);
  const valueKey = guessKey(colNames, COLUMN_ALIASES.value);

  if (!countryKey || !valueKey) {
    console.warn("無法辨識欄位", colNames);
    return null;
  }

  return {
    rows,
    countryKey,
    yearKey, // 年份有可能沒有，但我們還是保留
    valueKey
  };
}

/* ============================
   8. 猜欄位的小工具
   names: 原本的欄位名字陣列
   candidates: 我們預設的可能名稱
   ============================ */
function guessKey(names, candidates) {
  // 原樣比
  for (const n of names) {
    if (candidates.includes(n)) return n;
  }
  // 全轉小寫再比
  const lowerMap = {};
  names.forEach(n => (lowerMap[n.toLowerCase()] = n));
  for (const cand of candidates) {
    const low = cand.toLowerCase();
    if (lowerMap[low]) return lowerMap[low];
  }
  // 找不到就 null
  return null;
}

/* ============================
   9. 顯示格式錯誤訊息
   ============================ */
function renderFormatError() {
  // 保留 insight，下面加一段錯誤
  const err = document.createElement("p");
  err.style.color = "#ef4444";
  err.style.marginTop = "0.5rem";
  err.textContent = "這個資料檔的欄位名稱跟系統預設的不一樣，目前無法自動辨識「國家 / 年份 / 數值」。請先在 app.js 的 COLUMN_ALIASES 裡加上這張表的欄位名稱。";
  dataFiltersEl.appendChild(err);

  // 清空圖表、表格
  if (currentChart) currentChart.destroy();
  dataTableEl.innerHTML = "";
  statisticsPanelEl.innerHTML = "";
}

/* ============================
   10. 用標準化結果來畫篩選器
   ============================ */
function renderFiltersFromNormalized(normalized) {
  const { rows, countryKey, yearKey } = normalized;

  // 先把舊的篩選器移掉（insight 保留）
  const oldFilters = dataFiltersEl.querySelectorAll(".filter-group, .format-error");
  oldFilters.forEach(el => el.remove());

  dataFiltersEl.dataset.countryKey = countryKey;
  dataFiltersEl.dataset.yearKey = yearKey || "";
  dataFiltersEl.dataset.valueKey = normalized.valueKey;

  // 國家下拉
  const countries = Array.from(
    new Set(rows.map(r => r[countryKey]).filter(Boolean))
  );

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

  // 年份下拉（如果有年份欄位）
  if (yearKey) {
    const years = Array.from(
      new Set(rows.map(r => r[yearKey]).filter(Boolean))
    ).sort();

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

/* ============================
   11. 篩選後 → 畫圖表統計
   ============================ */
function renderAllFromFilters() {
  if (!currentRawRows.length) return;

  const cKey = dataFiltersEl.dataset.countryKey;
  const yKey = dataFiltersEl.dataset.yearKey;
  const vKey = dataFiltersEl.dataset.valueKey;

  if (!cKey || !vKey) {
    renderFormatError();
    return;
  }

  const countrySel = document.getElementById("filterCountry");
  const yearSel = document.getElementById("filterYear");

  const selectedCountry = countrySel ? countrySel.value : "__all";
  const selectedYear = yearSel ? yearSel.value : "__all";

  let filtered = currentRawRows.filter(row => {
    let ok = true;
    if (selectedCountry !== "__all" && row[cKey] !== selectedCountry) ok = false;
    if (yKey && selectedYear !== "__all" && String(row[yKey]) !== String(selectedYear)) ok = false;
    return ok;
  });

  renderChartFromData(filtered, { countryKey: cKey, yearKey: yKey, valueKey: vKey });
  renderTable(filtered);
  renderStats(filtered, vKey);
}

/* ============================
   12. 畫圖（有自動圖表）
   ============================ */
function renderChartFromData(rows, keys) {
  const { countryKey, yearKey, valueKey } = keys;
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (currentChart) currentChart.destroy();

  let selectedChartType = chartTypeSelect ? chartTypeSelect.value : "auto";

  // 自動判斷
  if (selectedChartType === "auto") {
    const uniqYears = yearKey
      ? new Set(rows.map(r => r[yearKey]).filter(Boolean))
      : new Set();
    if (uniqYears.size > 3) selectedChartType = "line";
    else selectedChartType = "bar";
  }

  const isHorizontal = selectedChartType === "bar-horizontal";

  const uniqueCountries = Array.from(
    new Set(rows.map(r => r[countryKey]).filter(Boolean))
  );
  const uniqueYears = yearKey
    ? Array.from(new Set(rows.map(r => r[yearKey]).filter(Boolean))).sort()
    : [];

  let labels = [];
  let data = [];

  if (yearKey && uniqueCountries.length === 1) {
    // 單一國家，多年份
    labels = uniqueYears;
    data = labels.map(y => {
      const found = rows.find(r => String(r[yearKey]) === String(y));
      return found ? Number(found[valueKey]) : null;
    });
  } else {
    // 多國家，取各國最新的一筆
    labels = uniqueCountries;
    data = labels.map(c => {
      const cr = rows.filter(r => r[countryKey] === c);
      if (yearKey) {
        const sorted = cr.sort((a, b) => Number(a[yearKey]) - Number(b[yearKey]));
        const last = sorted[sorted.length - 1];
        return last ? Number(last[valueKey]) : null;
      } else {
        // 沒有年份，就取第一筆
        const first = cr[0];
        return first ? Number(first[valueKey]) : null;
      }
    });
  }

  currentChart = new Chart(ctx, {
    type: isHorizontal ? "bar" : selectedChartType,
    data: {
      labels,
      datasets: [
        {
          label: "Value",
          data,
          borderWidth: 2,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isHorizontal ? "y" : "x",
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

/* ============================
   13. 表格
   ============================ */
function renderTable(rows) {
  if (!dataTableEl) return;
  if (!rows || !rows.length) {
    dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>";
    return;
  }
  const cols = Object.keys(rows[0]);
  let thead = "<thead><tr>";
  cols.forEach(c => (thead += `<th>${c}</th>`));
  thead += "</tr></thead>";

  let tbody = "<tbody>";
  rows.forEach(row => {
    tbody += "<tr>";
    cols.forEach(c => {
      tbody += `<td>${row[c] != null ? row[c] : ""}</td>`;
    });
    tbody += "</tr>";
  });
  tbody += "</tbody>";

  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}

/* ============================
   14. 統計
   ============================ */
function renderStats(rows, valueKey) {
  if (!statisticsPanelEl) return;
  if (!rows || !rows.length) {
    statisticsPanelEl.innerHTML = "";
    return;
  }
  const nums = rows.map(r => Number(r[valueKey])).filter(n => !isNaN(n));
  const count = nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);

  statisticsPanelEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-label">資料筆數</div>
      <div class="stat-value">${count}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">最大值</div>
      <div class="stat-value">${isFinite(max) ? max.toFixed(2) : "-"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">最小值</div>
      <div class="stat-value">${isFinite(min) ? min.toFixed(2) : "-"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">平均值</div>
      <div class="stat-value">${isFinite(avg) ? avg.toFixed(2) : "-"}</div>
    </div>
  `;
}

/* ============================
   15. 全域事件
   ============================ */
function bindGlobalEvents() {
  if (chartTypeSelect) {
    chartTypeSelect.addEventListener("change", renderAllFromFilters);
  }
  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadChartImage);
  }
  if (sidebarToggleBtn && sidebarEl) {
    sidebarToggleBtn.addEventListener("click", () => {
      sidebarEl.classList.toggle("active");
    });
  }
}

/* ============================
   16. 下載圖片
   ============================ */
function downloadChartImage() {
  if (!currentChart) return;
  const link = document.createElement("a");
  link.href = currentChart.toBase64Image();
  link.download = (currentDatasetFile
    ? currentDatasetFile.name.replace(/\.xlsx?$/i, "")
    : "chart") + ".png";
  link.click();
}

/* ============================
   17. 更新日期
   ============================ */
function setLastUpdateToday() {
  if (!lastUpdateEl) return;
  const now = new Date();
  const iso = now.toISOString();
  lastUpdateEl.textContent = iso.slice(0, 10);
  lastUpdateEl.setAttribute("datetime", iso);
}
