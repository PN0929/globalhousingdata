// app.js

// ===== 0. GitHub 設定（用你給的那個 commit） =====
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO = "globalhousingdata";
const GITHUB_REF = "54eb88edd1cab3fcb88c82e0288e93ba87694270";
const GITHUB_DIR = "OECD DATA";

// 要排除的國家（口徑可能不一樣）
const EXCLUDE_CODES = ["TWN", "Taiwan", "TAIWAN"];

// ===== 1. 主題定義（MVP 用寫死的） =====
const TOPICS = [
  {
    id: "afford",
    name: "住宅負擔",
    // OECD 資料你原本分 HC/HM/PH，我在這裡先用檔名裡面的代碼去猜
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

let currentChart = null;
let currentRawRows = [];
let currentDatasetFile = null;
let allFiles = [];

// ===== DOMContentLoaded =====
document.addEventListener("DOMContentLoaded", () => {
  renderTopicButtons();
  loadGitHubDatasets();
  setLastUpdateToday();
  bindGlobalEvents();
});

// ===== 2. 畫主題按鈕 =====
function renderTopicButtons() {
  topicListEl.innerHTML = "";
  TOPICS.forEach((topic, index) => {
    const btn = document.createElement("button");
    btn.className = "filter-btn" + (index === 0 ? " active" : "");
    btn.textContent = topic.name;
    btn.dataset.topicId = topic.id;
    btn.addEventListener("click", () => {
      // 切 active
      topicListEl
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      currentTopicId = topic.id;
      // 用現在的 files 再畫一次 dataset
      filterAndRenderDatasets();
      // 更新 insight
      renderInsightForTopic();
      // 回到歡迎 or 保留內容都可以，這裡我們不清空右側，除非你要
    });
    topicListEl.appendChild(btn);
  });
}

// ===== 3. 讀 GitHub 資料夾 =====
async function loadGitHubDatasets() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(
    GITHUB_DIR
  )}?ref=${GITHUB_REF}`;
  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;
  try {
    const res = await fetch(apiUrl);
    if (!res.ok) throw new Error("無法取得 GitHub 資料夾內容");
    const files = await res.json();
    // 留起來給主題篩
    allFiles = files.filter(
      (f) =>
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

// ===== 4. 依照目前主題把 dataset 列出來 =====
function filterAndRenderDatasets() {
  const topic = TOPICS.find((t) => t.id === currentTopicId);
  datasetListEl.innerHTML = "";

  if (!allFiles.length) {
    datasetListEl.innerHTML = `<p>沒有可用的檔案</p>`;
    return;
  }

  // 用檔名裡的 HC / HM / PH 去猜它屬於哪一類
  const matchedFiles = allFiles.filter((file) => {
    if (!topic) return true;
    const upperName = file.name.toUpperCase();
    return topic.match.some((code) => upperName.includes(code));
  });

  if (!matchedFiles.length) {
    datasetListEl.innerHTML = `<p>這個主題暫時沒有對應的指標</p>`;
    return;
  }

  matchedFiles.forEach((file) => {
    const item = document.createElement("div");
    item.className = "dataset-item";
    item.dataset.filepath = file.path;
    item.innerHTML = `
      <div class="dataset-code">${file.name.replace(/\.xlsx?$/i, "")}</div>
      <div class="dataset-name">${file.path}</div>
    `;
    item.addEventListener("click", () => {
      datasetListEl
        .querySelectorAll(".dataset-item")
        .forEach((el) => el.classList.remove("active"));
      item.classList.add("active");

      currentDatasetFile = file;
      loadDatasetFileFromGitHub(file);
    });
    datasetListEl.appendChild(item);
  });

  // 顯示該主題的說明
  renderInsightForTopic();
}

// ===== 5. 貼主題的 insight =====
function renderInsightForTopic() {
  const topic = TOPICS.find((t) => t.id === currentTopicId);
  if (!insightBoxEl) return;
  insightBoxEl.innerHTML = `
    <h4>如何看這個主題？</h4>
    <p>${topic ? topic.insight : "從左側選擇一個資料集，系統會幫你畫出常見的圖表。先看最新年份的橫向比較會最直覺。"}</p>
  `;
}

// ===== 6. 下載 xlsx 並解析 =====
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

    // 排除台灣
    const cleaned = rows.filter((row) => {
      const values = Object.values(row).map((v) => (v != null ? String(v) : ""));
      return !values.some((v) => EXCLUDE_CODES.includes(v));
    });

    currentRawRows = cleaned;

    showVisualizationArea();
    renderDatasetTitle(file.name);
    renderFiltersFromData(cleaned);
    renderAllFromFilters();
  } catch (err) {
    console.error(err);
    alert("讀取檔案失敗：" + err.message);
  }
}

// ===== 7. 顯示可視化區 =====
function showVisualizationArea() {
  if (welcomeScreenEl) welcomeScreenEl.hidden = true;
  if (visualizationAreaEl) visualizationAreaEl.hidden = false;
}

// ===== 8. 指標標題 =====
function renderDatasetTitle(name) {
  currentDatasetTitleEl.textContent = name.replace(/\.xlsx?$/i, "");
}

// ===== 9. 依照資料猜欄位 + 產下拉 =====
function renderFiltersFromData(rows) {
  dataFiltersEl.dataset.countryKey = "";
  dataFiltersEl.dataset.yearKey = "";
  dataFiltersEl.dataset.valueKey = "";

  // insight 已經在上面了，這裡只塞篩選器
  const oldFilters = dataFiltersEl.querySelectorAll(".filter-group");
  oldFilters.forEach((el) => el.remove());

  if (!rows || !rows.length) return;

  const colNames = Object.keys(rows[0]);

  const countryKey =
    colNames.find((c) =>
      ["location", "LOCATION", "country", "Country", "COUNTRY"].includes(c)
    ) || colNames[0];
  const yearKey =
    colNames.find((c) =>
      ["time", "TIME", "year", "Year", "TIME_PERIOD"].includes(c)
    ) || colNames[1];
  const valueKey =
    colNames.find((c) =>
      ["value", "Value", "VALUE", "OBS_VALUE", "obs_value"].includes(c)
    ) || colNames[2];

  dataFiltersEl.dataset.countryKey = countryKey;
  dataFiltersEl.dataset.yearKey = yearKey;
  dataFiltersEl.dataset.valueKey = valueKey;

  const countries = Array.from(
    new Set(rows.map((r) => r[countryKey]).filter(Boolean))
  );
  const years = Array.from(
    new Set(rows.map((r) => r[yearKey]).filter(Boolean))
  ).sort();

  const countryGroup = document.createElement("div");
  countryGroup.className = "filter-group";
  countryGroup.innerHTML = `
    <label for="filterCountry">國家 / 地區</label>
    <select id="filterCountry">
      <option value="__all">全部</option>
      ${countries.map((c) => `<option value="${c}">${c}</option>`).join("")}
    </select>
  `;

  const yearGroup = document.createElement("div");
  yearGroup.className = "filter-group";
  yearGroup.innerHTML = `
    <label for="filterYear">年份</label>
    <select id="filterYear">
      <option value="__all">全部</option>
      ${years.map((y) => `<option value="${y}">${y}</option>`).join("")}
    </select>
  `;

  dataFiltersEl.appendChild(countryGroup);
  dataFiltersEl.appendChild(yearGroup);

  countryGroup
    .querySelector("select")
    .addEventListener("change", renderAllFromFilters);
  yearGroup
    .querySelector("select")
    .addEventListener("change", renderAllFromFilters);
}

// ===== 10. 篩選後 → 畫圖、表格、統計 =====
function renderAllFromFilters() {
  if (!currentRawRows.length) return;

  const cKey = dataFiltersEl.dataset.countryKey;
  const yKey = dataFiltersEl.dataset.yearKey;
  const vKey = dataFiltersEl.dataset.valueKey;

  const countrySel = document.getElementById("filterCountry");
  const yearSel = document.getElementById("filterYear");

  const selectedCountry = countrySel ? countrySel.value : "__all";
  const selectedYear = yearSel ? yearSel.value : "__all";

  let filtered = currentRawRows.filter((row) => {
    let ok = true;
    if (selectedCountry !== "__all" && row[cKey] !== selectedCountry) ok = false;
    if (selectedYear !== "__all" && String(row[yKey]) !== String(selectedYear))
      ok = false;
    return ok;
  });

  renderChartFromData(filtered, { countryKey: cKey, yearKey: yKey, valueKey: vKey });
  renderTable(filtered);
  renderStats(filtered, vKey);
}

// ===== 11. 畫圖（含自動判斷類型） =====
function renderChartFromData(rows, keys) {
  const { countryKey, yearKey, valueKey } = keys;
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (currentChart) currentChart.destroy();

  // 使用者選的
  let selectedChartType = chartTypeSelect ? chartTypeSelect.value : "auto";

  // 自動判斷：如果有很多年份 → line，否則 bar
  if (selectedChartType === "auto") {
    const uniqYears = new Set(rows.map((r) => r[yearKey]));
    if (uniqYears.size > 3) {
      selectedChartType = "line";
    } else {
      selectedChartType = "bar";
    }
  }

  const isHorizontal = selectedChartType === "bar-horizontal";

  const uniqueCountries = Array.from(
    new Set(rows.map((r) => r[countryKey]).filter(Boolean))
  );
  const uniqueYears = Array.from(
    new Set(rows.map((r) => r[yearKey]).filter(Boolean))
  ).sort();

  let labels = [];
  let data = [];

  if (uniqueCountries.length === 1) {
    // 單一國家 → 用年份
    labels = uniqueYears;
    data = labels.map((y) => {
      const found = rows.find((r) => String(r[yearKey]) === String(y));
      return found ? Number(found[valueKey]) : null;
    });
  } else {
    // 多國家 → 用國家，取最新一筆
    labels = uniqueCountries;
    data = labels.map((c) => {
      const countryRows = rows.filter((r) => r[countryKey] === c);
      const sorted = countryRows.sort(
        (a, b) => Number(a[yearKey]) - Number(b[yearKey])
      );
      const last = sorted[sorted.length - 1];
      return last ? Number(last[valueKey]) : null;
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

// ===== 12. 表格 =====
function renderTable(rows) {
  if (!dataTableEl) return;
  if (!rows || !rows.length) {
    dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>";
    return;
  }
  const cols = Object.keys(rows[0]);
  let thead = "<thead><tr>";
  cols.forEach((c) => (thead += `<th>${c}</th>`));
  thead += "</tr></thead>";
  let tbody = "<tbody>";
  rows.forEach((row) => {
    tbody += "<tr>";
    cols.forEach((c) => {
      tbody += `<td>${row[c] != null ? row[c] : ""}</td>`;
    });
    tbody += "</tr>";
  });
  tbody += "</tbody>";
  dataTableEl.innerHTML = `<table>${thead}${tbody}</table>`;
}

// ===== 13. 統計 =====
function renderStats(rows, valueKey) {
  if (!statisticsPanelEl) return;
  if (!rows || !rows.length) {
    statisticsPanelEl.innerHTML = "";
    return;
  }
  const nums = rows
    .map((r) => Number(r[valueKey]))
    .filter((n) => !isNaN(n));
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

// ===== 14. 全域事件 =====
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

// ===== 15. 下載圖表 =====
function downloadChartImage() {
  if (!currentChart) return;
  const link = document.createElement("a");
  link.href = currentChart.toBase64Image();
  link.download = (currentDatasetFile
    ? currentDatasetFile.name.replace(/\.xlsx?$/i, "")
    : "chart") + ".png";
  link.click();
}

// ===== 16. 更新時間 =====
function setLastUpdateToday() {
  if (!lastUpdateEl) return;
  const now = new Date();
  const iso = now.toISOString();
  lastUpdateEl.textContent = iso.slice(0, 10);
  lastUpdateEl.setAttribute("datetime", iso);
}
