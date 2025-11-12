// app.js

// =========================
// GitHub 設定（已幫你填好）
// =========================
//
// 這裡我用的是你給的這個 commit：
// 54eb88edd1cab3fcb88c82e0288e93ba87694270
// 這樣就算 main 之後有更新，這版也能讀到那一版的資料。
// 如果你要讀最新 main，把 GITHUB_REF 改成 "main" 就好。
const GITHUB_OWNER = "PN0929";
const GITHUB_REPO = "globalhousingdata";
const GITHUB_REF = "54eb88edd1cab3fcb88c82e0288e93ba87694270"; // or "main"
const GITHUB_DIR = "OECD DATA"; // 資料夾名稱

// =========================
// DOM 抓取
// =========================
const datasetListEl = document.getElementById("datasetList");
const welcomeScreenEl = document.getElementById("welcomeScreen");
const visualizationAreaEl = document.getElementById("visualizationArea");
const currentDatasetTitleEl = document.getElementById("currentDatasetTitle");
const dataFiltersEl = document.getElementById("dataFilters");
const dataTableEl = document.getElementById("dataTable");
const statisticsPanelEl = document.getElementById("statisticsPanel");
const chartTypeSelect = document.getElementById("chartType");
const downloadBtn = document.getElementById("downloadBtn");
const lastUpdateEl = document.getElementById("lastUpdate");
const sidebarToggleBtn = document.getElementById("sidebarToggle");
const sidebarEl = document.querySelector(".sidebar");

let currentChart = null;
let currentRawRows = [];
let currentDatasetFile = null;

// =========================
// 初始化
// =========================
document.addEventListener("DOMContentLoaded", () => {
  loadGitHubDatasets();
  setLastUpdateToday();
  bindGlobalEvents();
});

// =========================
// 取得 GitHub 資料夾內的檔案
// GET https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={ref}
// =========================
async function loadGitHubDatasets() {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${encodeURIComponent(
    GITHUB_DIR
  )}?ref=${GITHUB_REF}`;

  datasetListEl.innerHTML = `<div class="loading">載入數據集中…</div>`;

  try {
    const res = await fetch(apiUrl);
    if (!res.ok) {
      throw new Error("無法取得 GitHub 資料夾內容");
    }
    const files = await res.json();

    const xlsxFiles = files.filter(
      (f) =>
        f.type === "file" &&
        (f.name.toLowerCase().endsWith(".xlsx") ||
          f.name.toLowerCase().endsWith(".xls"))
    );

    if (!xlsxFiles.length) {
      datasetListEl.innerHTML = `<p>這個資料夾裡沒有 Excel 檔 (.xlsx / .xls)</p>`;
      return;
    }

    renderDatasetList(xlsxFiles);
  } catch (err) {
    console.error(err);
    datasetListEl.innerHTML = `<p style="color:#ef4444">載入失敗：${err.message}</p>`;
  }
}

// =========================
// 畫左側清單
// =========================
function renderDatasetList(files) {
  datasetListEl.innerHTML = "";

  files.forEach((file) => {
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
}

// =========================
// 下載單一 xlsx 並解析
// raw 位置：
// https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
// =========================
async function loadDatasetFileFromGitHub(file) {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_REF}/${file.path}`;

  try {
    const res = await fetch(rawUrl);
    if (!res.ok) {
      throw new Error("無法下載檔案：" + file.name);
    }
    const arrayBuffer = await res.arrayBuffer();

    // XLSX 已在 HTML 中載入
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    currentRawRows = rows;

    showVisualizationArea();
    renderDatasetTitle(file.name);
    renderFiltersFromData(rows);
    renderAllFromFilters();
  } catch (err) {
    console.error(err);
    alert("讀取檔案失敗：" + err.message);
  }
}

// =========================
// 切畫面
// =========================
function showVisualizationArea() {
  if (welcomeScreenEl) welcomeScreenEl.hidden = true;
  if (visualizationAreaEl) visualizationAreaEl.hidden = false;
}

// =========================
// 顯示目前的檔名
// =========================
function renderDatasetTitle(name) {
  currentDatasetTitleEl.textContent = name.replace(/\.xlsx?$/i, "");
}

// =========================
// 從 xlsx 的欄位自動產生篩選器
// 嘗試抓出「國家、年份、數值」三種欄位
// =========================
function renderFiltersFromData(rows) {
  dataFiltersEl.innerHTML = "";
  if (!rows || !rows.length) return;

  const colNames = Object.keys(rows[0]);

  // 猜欄位
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

  // 先收起來之後用
  dataFiltersEl.dataset.countryKey = countryKey;
  dataFiltersEl.dataset.yearKey = yearKey;
  dataFiltersEl.dataset.valueKey = valueKey;

  // 產 unique
  const countries = Array.from(
    new Set(rows.map((r) => r[countryKey]).filter(Boolean))
  );
  const years = Array.from(
    new Set(rows.map((r) => r[yearKey]).filter(Boolean))
  ).sort();

  // 國家選單
  const countryGroup = document.createElement("div");
  countryGroup.className = "filter-group";
  countryGroup.innerHTML = `
    <label for="filterCountry">國家 / 地區</label>
    <select id="filterCountry">
      <option value="__all">全部</option>
      ${countries.map((c) => `<option value="${c}">${c}</option>`).join("")}
    </select>
  `;
  // 年份選單
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

// =========================
// 篩完之後：畫圖 + 表格 + 統計
// =========================
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
    if (
      selectedYear !== "__all" &&
      String(row[yKey]) !== String(selectedYear)
    )
      ok = false;
    return ok;
  });

  renderChartFromData(filtered, { countryKey: cKey, yearKey: yKey, valueKey: vKey });
  renderTable(filtered);
  renderStats(filtered, vKey);
}

// =========================
// 畫 Chart.js
// =========================
function renderChartFromData(rows, keys) {
  const { countryKey, yearKey, valueKey } = keys;
  const canvas = document.getElementById("mainChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (currentChart) currentChart.destroy();

  const selectedChartType = chartTypeSelect ? chartTypeSelect.value : "line";
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
    // 單一國家 → X 軸用年份
    labels = uniqueYears;
    data = labels.map((y) => {
      const found = rows.find((r) => String(r[yearKey]) === String(y));
      return found ? Number(found[valueKey]) : null;
    });
  } else {
    // 多國家 → X 軸用國家，取該國最新年份那筆
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
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: isHorizontal ? "y" : "x",
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

// =========================
// 表格
// =========================
function renderTable(rows) {
  if (!dataTableEl) return;
  if (!rows || !rows.length) {
    dataTableEl.innerHTML = "<p>沒有符合篩選條件的資料。</p>";
    return;
  }

  const cols = Object.keys(rows[0]);
  let thead = "<thead><tr>";
  cols.forEach((c) => {
    thead += `<th>${c}</th>`;
  });
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

  dataTableEl.innerHTML = `
    <table>
      ${thead}
      ${tbody}
    </table>
  `;
}

// =========================
// 統計卡片
// =========================
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

// =========================
// 全域事件
// =========================
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

// =========================
// 下載圖表
// =========================
function downloadChartImage() {
  if (!currentChart) return;
  const link = document.createElement("a");
  link.href = currentChart.toBase64Image();
  link.download = (currentDatasetFile
    ? currentDatasetFile.name.replace(/\.xlsx?$/i, "")
    : "chart") + ".png";
  link.click();
}

// =========================
// Footer 更新日期
// =========================
function setLastUpdateToday() {
  if (!lastUpdateEl) return;
  const now = new Date();
  const iso = now.toISOString();
  lastUpdateEl.textContent = iso.slice(0, 10);
  lastUpdateEl.setAttribute("datetime", iso);
}
