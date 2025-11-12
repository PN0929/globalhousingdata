// Global state
let currentChart = null;
let currentData = null;
let allDatasets = [];

// Dataset definitions with Chinese names
const datasetInfo = {
    'HC1-1': { name: '家庭住房相關支出', category: 'HC' },
    'HC1-2': { name: '收入占住房成本比', category: 'HC' },
    'HC1-3': { name: '家庭保暖能力', category: 'HC' },
    'HC1-4': { name: '住房主觀評價', category: 'HC' },
    'HC2-1': { name: '居住空間', category: 'HC' },
    'HC2-2': { name: '無沖水馬桶家庭', category: 'HC' },
    'HC2-3': { name: '嚴重住房剝奪', category: 'HC' },
    'HC3-1': { name: '無家可歸人口', category: 'HC' },
    'HC3-3': { name: '驅逐數據', category: 'HC' },
    'HC4-1': { name: '殘疾人士住房狀況', category: 'HC' },
    'HM1-1': { name: '住房存量與建設', category: 'HM' },
    'HM1-2': { name: '住房價格', category: 'HM' },
    'HM1-3': { name: '住房產權', category: 'HM' },
    'HM1-4': { name: '年齡組生活安排', category: 'HM' },
    'HM1-5': { name: '按住宅類型劃分的住房存量', category: 'HM' },
    'PH2-1': { name: '支持購房者的公共支出', category: 'PH' },
    'PH3-1': { name: '住房補貼公共支出', category: 'PH' },
    'PH3-2': { name: '住房補貼主要特徵', category: 'PH' },
    'PH3-3': { name: '住房補貼接受者與支付率', category: 'PH' },
    'PH4-1': { name: '社會租賃住房公共支出', category: 'PH' },
    'PH4-2': { name: '社會租賃住房存量', category: 'PH' },
    'PH4-3': { name: '社會租賃住房特徵', category: 'PH' },
    'PH5-1': { name: '負擔得起住房發展融資措施', category: 'PH' },
    'PH6-1': { name: '租賃監管', category: 'PH' },
    'PH7-1': { name: '改善與重建融資措施', category: 'PH' }
};

// Color palettes for charts
const colorPalettes = {
    default: [
        '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981',
        '#06b6d4', '#6366f1', '#f43f5e', '#84cc16', '#14b8a6',
        '#f97316', '#a855f7', '#0ea5e9', '#22c55e', '#eab308'
    ]
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    setupEventListeners();
    await loadDatasetList();
    document.getElementById('lastUpdate').textContent = new Date().toLocaleDateString('zh-TW');
}

function setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            filterDatasets(e.target.dataset.filter);
        });
    });

    // Chart type selector
    document.getElementById('chartType').addEventListener('change', (e) => {
        if (currentData) {
            updateChart(currentData, e.target.value);
        }
    });

    // Download button
    document.getElementById('downloadBtn').addEventListener('click', downloadChart);
}

async function loadDatasetList() {
    const datasetListEl = document.getElementById('datasetList');
    datasetListEl.innerHTML = '';

    // Create dataset items
    for (const [code, info] of Object.entries(datasetInfo)) {
        const item = document.createElement('div');
        item.className = 'dataset-item';
        item.dataset.code = code;
        item.dataset.category = info.category;
        item.innerHTML = `
            <div class="dataset-code">${code}</div>
            <div class="dataset-name">${info.name}</div>
        `;
        item.addEventListener('click', () => loadDataset(code, info.name));
        datasetListEl.appendChild(item);
        allDatasets.push(item);
    }
}

function filterDatasets(category) {
    allDatasets.forEach(item => {
        if (category === 'all' || item.dataset.category === category) {
            item.classList.remove('hidden');
        } else {
            item.classList.add('hidden');
        }
    });
}

async function loadDataset(code, name) {
    try {
        // Update UI
        document.querySelectorAll('.dataset-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-code="${code}"]`).classList.add('active');

        // Show loading
        showLoading();

        // Find the full filename
        const filename = findDatasetFilename(code);
        const response = await fetch(`OECD DATA/${filename}`);
        const arrayBuffer = await response.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });

        // Parse the first sheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        // Process and display data
        processAndDisplayData(data, code, name);

    } catch (error) {
        console.error('Error loading dataset:', error);
        alert('載入數據集時發生錯誤: ' + error.message);
    }
}

function findDatasetFilename(code) {
    // Map code to full filename
    const filenameMap = {
        'HC1-1': 'HC1-1-Housing-related-expenditure-of-households.xlsx',
        'HC1-2': 'HC1-2-Housing-costs-over-income.xlsx',
        'HC1-3': 'HC1-3-Ability-of-households-keep-dwelling-warm.xlsx',
        'HC1-4': 'HC1-4-Subjective-Measures-on-Housing.xlsx',
        'HC2-1': 'HC2-1-Living-space.xlsx',
        'HC2-2': 'HC2-2-Households-without-flushing-toilet.xlsx',
        'HC2-3': 'HC2-3-Severe-housing-deprivation.xlsx',
        'HC3-1': 'HC3-1-Population-experiencing-homelessness.xlsx',
        'HC3-3': 'HC3-3-Evictions.xlsx',
        'HC4-1': 'HC4-1-Housing-outcomes-people-with-disabilities.xlsx',
        'HM1-1': 'HM1-1-Housing-stock-and-construction.xlsx',
        'HM1-2': 'HM1-2-Housing-prices.xlsx',
        'HM1-3': 'HM1-3-Housing-tenures.xlsx',
        'HM1-4': 'HM1-4-Living-arrangements-age-groups.xlsx',
        'HM1-5': 'HM1-5-Housing-stock-by-dwelling-type.xlsx',
        'PH2-1': 'PH2-1-Public-spending-support-to-homebuyers.xlsx',
        'PH3-1': 'PH3-1-Public-spending-on-housing-allowances.xlsx',
        'PH3-2': 'PH3-2-Key-characteristics-of-housing-allowances.xlsx',
        'PH3-3': 'PH3-3-Recipients-payment-rates-housing-allowances.xlsx',
        'PH4-1': 'PH4-1-Public-spending-social-rental-housing.xlsx',
        'PH4-2': 'PH4-2-Social-rental-housing-stock.xlsx',
        'PH4-3': 'PH4-3-Characteristics-of-social-rental-housing.xlsx',
        'PH5-1': 'PH5-1-Measures-financing-affordable-housing-development.xlsx',
        'PH6-1': 'PH6-1-Rental-regulation.xlsx',
        'PH7-1': 'PH7-1-Measures-financing-improvements-regeneration.xlsx'
    };
    return filenameMap[code];
}

function processAndDisplayData(rawData, code, name) {
    // Hide welcome screen, show visualization area
    document.getElementById('welcomeScreen').style.display = 'none';
    document.getElementById('visualizationArea').style.display = 'block';
    document.getElementById('currentDatasetTitle').textContent = `${code}: ${name}`;

    // Filter out empty rows
    const data = rawData.filter(row => row.some(cell => cell !== ''));

    if (data.length < 2) {
        alert('數據格式不正確或為空');
        return;
    }

    // Store current data
    currentData = {
        raw: data,
        code: code,
        name: name
    };

    // Extract headers and data
    const headers = data[0];
    const dataRows = data.slice(1);

    // Create filters based on data structure
    createDataFilters(headers, dataRows);

    // Create initial chart
    createChart(headers, dataRows);

    // Display data table
    displayDataTable(headers, dataRows);

    // Display statistics
    displayStatistics(headers, dataRows);
}

function createDataFilters(headers, dataRows) {
    const filtersEl = document.getElementById('dataFilters');
    filtersEl.innerHTML = '<h3>🔍 數據篩選</h3>';

    // Try to identify country and year columns
    const countryColIndex = headers.findIndex(h =>
        h && (h.toLowerCase().includes('country') || h.includes('國家') || h.toLowerCase().includes('cou'))
    );

    const yearColIndex = headers.findIndex(h =>
        h && (h.toLowerCase().includes('year') || h.includes('年') || h.toLowerCase().includes('time'))
    );

    if (countryColIndex !== -1) {
        const countries = [...new Set(dataRows.map(row => row[countryColIndex]).filter(c => c))];
        createFilterDropdown('country', '選擇國家', countries, filtersEl);
    }

    if (yearColIndex !== -1) {
        const years = [...new Set(dataRows.map(row => row[yearColIndex]).filter(y => y))].sort();
        createFilterDropdown('year', '選擇年份', years, filtersEl);
    }
}
function createFilterDropdown(id, label, options, container) {
    const filterGroup = document.createElement('div');
    filterGroup.className = 'filter-group';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    labelEl.htmlFor = `filter-${id}`;

    const select = document.createElement('select');
    select.id = `filter-${id}`;

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = '全部';
    select.appendChild(allOption);

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        select.appendChild(option);
    });

    select.addEventListener('change', () => applyFilters());

    filterGroup.appendChild(labelEl);
    filterGroup.appendChild(select);
    container.appendChild(filterGroup);
}

function applyFilters() {
    if (!currentData) return;

    const headers = currentData.raw[0];
    let dataRows = currentData.raw.slice(1);

    // Apply country filter
    const countryFilter = document.getElementById('filter-country');
    if (countryFilter && countryFilter.value !== 'all') {
        const countryColIndex = headers.findIndex(h =>
            h && (h.toLowerCase().includes('country') || h.includes('國家') || h.toLowerCase().includes('cou'))
        );
        if (countryColIndex !== -1) {
            dataRows = dataRows.filter(row => row[countryColIndex] === countryFilter.value);
        }
    }

    // Apply year filter
    const yearFilter = document.getElementById('filter-year');
    if (yearFilter && yearFilter.value !== 'all') {
        const yearColIndex = headers.findIndex(h =>
            h && (h.toLowerCase().includes('year') || h.includes('年') || h.toLowerCase().includes('time'))
        );
        if (yearColIndex !== -1) {
            dataRows = dataRows.filter(row => row[yearColIndex] == yearFilter.value);
        }
    }

    // Update chart and table
    createChart(headers, dataRows);
    displayDataTable(headers, dataRows);
    displayStatistics(headers, dataRows);
}

function createChart(headers, dataRows, chartType = null) {
    const type = chartType || document.getElementById('chartType').value;

    // Find numeric columns
    const numericColumns = [];
    headers.forEach((header, index) => {
        if (index > 0) { // Skip first column (usually labels)
            const hasNumericData = dataRows.some(row => {
                const value = row[index];
                return !isNaN(parseFloat(value)) && isFinite(value);
            });
            if (hasNumericData) {
                numericColumns.push(index);
            }
        }
    });

    if (numericColumns.length === 0) {
        document.getElementById('mainChart').parentElement.innerHTML =
            '<p style="text-align: center; padding: 2rem; color: #64748b;">此數據集沒有可視化的數值數據</p>';
        return;
    }

    // Prepare chart data
    const labels = dataRows.map(row => row[0]).filter(label => label);
    const datasets = numericColumns.slice(0, 10).map((colIndex, i) => {
        return {
            label: headers[colIndex] || `數據 ${i + 1}`,
            data: dataRows.map(row => {
                const value = parseFloat(row[colIndex]);
                return isNaN(value) ? null : value;
            }),
            backgroundColor: colorPalettes.default[i % colorPalettes.default.length] + '80',
            borderColor: colorPalettes.default[i % colorPalettes.default.length],
            borderWidth: 2,
            tension: 0.4,
            fill: type === 'line' ? false : true
        };
    });

    updateChart({ labels, datasets }, type);
}

function updateChart(chartData, type) {
    const ctx = document.getElementById('mainChart');

    if (currentChart) {
        currentChart.destroy();
    }

    const config = {
        type: type === 'horizontalBar' ? 'bar' : type,
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: type === 'horizontalBar' ? 'y' : 'x',
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 },
                        padding: 15,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0) {
                    const element = activeElements[0];
                    const datasetIndex = element.datasetIndex;
                    const index = element.index;
                    const value = chartData.datasets[datasetIndex].data[index];
                    const label = chartData.labels[index];
                    const datasetLabel = chartData.datasets[datasetIndex].label;

                    alert(`${label}\n${datasetLabel}: ${value}`);
                }
            }
        }
    };

    if (type === 'pie') {
        config.options.plugins.legend.position = 'right';
        // For pie charts, use only first dataset
        config.data = {
            labels: chartData.labels,
            datasets: [{
                data: chartData.datasets[0].data,
                backgroundColor: colorPalettes.default,
                borderColor: '#ffffff',
                borderWidth: 2
            }]
        };
    }

    currentChart = new Chart(ctx, config);
}

function displayDataTable(headers, dataRows) {
    const tableEl = document.getElementById('dataTable');

    let html = '<table><thead><tr>';
    headers.forEach(header => {
        html += `<th>${header || '未命名'}</th>`;
    });
    html += '</tr></thead><tbody>';

    dataRows.slice(0, 100).forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td>${cell !== undefined && cell !== null ? cell : ''}</td>`;
        });
        html += '</tr>';
    });

    html += '</tbody></table>';

    if (dataRows.length > 100) {
        html += `<p style="text-align: center; padding: 1rem; color: #64748b;">顯示前100行數據，共${dataRows.length}行</p>`;
    }

    tableEl.innerHTML = html;
}

function displayStatistics(headers, dataRows) {
    const statsEl = document.getElementById('statisticsPanel');
    statsEl.innerHTML = '';

    // Calculate basic statistics
    const stats = [
        { label: '數據行數', value: dataRows.length },
        { label: '數據欄位', value: headers.length },
        { label: '國家數量', value: countUniqueCountries(headers, dataRows) },
        { label: '年份範圍', value: getYearRange(headers, dataRows) }
    ];

    stats.forEach(stat => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.innerHTML = `
            <div class="stat-label">${stat.label}</div>
            <div class="stat-value">${stat.value}</div>
        `;
        statsEl.appendChild(card);
    });
}

function countUniqueCountries(headers, dataRows) {
    const countryColIndex = headers.findIndex(h =>
        h && (h.toLowerCase().includes('country') || h.includes('國家') || h.toLowerCase().includes('cou'))
    );

    if (countryColIndex === -1) return 'N/A';

    const countries = new Set(dataRows.map(row => row[countryColIndex]).filter(c => c));
    return countries.size;
}

function getYearRange(headers, dataRows) {
    const yearColIndex = headers.findIndex(h =>
        h && (h.toLowerCase().includes('year') || h.includes('年') || h.toLowerCase().includes('time'))
    );

    if (yearColIndex === -1) return 'N/A';

    const years = dataRows.map(row => parseInt(row[yearColIndex])).filter(y => !isNaN(y));
    if (years.length === 0) return 'N/A';

    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    return `${minYear} - ${maxYear}`;
}

function downloadChart() {
    if (!currentChart) {
        alert('請先選擇一個數據集');
        return;
    }

    const link = document.createElement('a');
    link.download = `chart-${currentData.code}-${Date.now()}.png`;
    link.href = currentChart.toBase64Image();
    link.click();
}

function showLoading() {
    document.getElementById('welcomeScreen').style.display = 'none';
    const visArea = document.getElementById('visualizationArea');
    visArea.style.display = 'block';
    visArea.innerHTML = '<div class="loading">載入數據中...</div>';
}
