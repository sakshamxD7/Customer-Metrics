/**
 * Customer Metrics Dashboard - Frontend Controller
 * Midnight Editorial Edition - Vanilla JS
 */

// Global state variables
let activePage = '';
let salesData = null;

// Overview page state
let overviewData = null;
let activeTemporalMetric = 'revenue'; // 'revenue', 'orders', 'customers'

// RFM page state
let rfmSummaryData = null;
let rfmScatterData = null;
let activeMonetaryScale = 'log'; // 'log', 'linear'

// Churn page state
let churnMetricsRF = null;
let churnMetricsXGB = null;
let churnImportancesRF = null;
let churnImportancesXGB = null;
let churnRegistryRaw = null;
let activeMLModel = 'rf'; // 'rf', 'xgb'
let registrySortColumn = 'prob'; // default sort by churn probability
let registrySortAsc = false; // default descending

// Color scheme mapping for RFM and risk profiles
const midnightColors = {
    'Champions': '#FF6B50',
    'Loyal Customers': '#FF9480',
    'Potential Loyalists': '#FFE2DD',
    'At Risk': '#888888',
    'Need Attention': '#555555',
    'Hibernating / Lost': '#2C2C2C',
    
    // Risk badges
    'High': '#FF6B50',
    'Medium': '#e6b432',
    'Low': '#50c878',
    
    // Channels
    'GT': '#FF6B50',
    'MT': '#aaaaaa',
    'RTM': '#444444'
};

// ----------------------------------------------------
// Core Initialization & Router
// ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    const marker = document.getElementById('page-marker');
    if (!marker) return;
    
    activePage = marker.getAttribute('data-page');
    
    if (activePage === 'overview') {
        initOverviewPage();
    } else if (activePage === 'rfm') {
        initRFMPage();
    } else if (activePage === 'churn') {
        initChurnPage();
    }
});

// Helper: Format currency
function formatCurrency(val) {
    if (val >= 1000000) {
        return '£' + (val / 1000000).toFixed(2) + 'M';
    } else if (val >= 1000) {
        return '£' + (val / 1000).toFixed(1) + 'K';
    }
    return '£' + val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ----------------------------------------------------
// OVERVIEW PAGE CONTROLLER
// ----------------------------------------------------
function initOverviewPage() {
    // 1. Fetch filter options
    fetch('/api/filter-options')
        .then(res => res.json())
        .then(options => {
            populateFilterSelect('select-categories', 'All Categories', options.categories);
            populateFilterSelect('select-brands', 'All Brands', options.brands);
            populateFilterSelect('select-channels', 'All Channels', options.channels);
            
            // Setup Slider Listener
            const slider = document.getElementById('slider-min-amount');
            const sliderLabel = document.getElementById('label-min-amount');
            slider.addEventListener('input', (e) => {
                sliderLabel.textContent = '£' + parseInt(e.target.value).toLocaleString();
                debouncedOverviewFetch();
            });
            
            // Execute initial data fetch
            fetchAndRenderOverview();
        })
        .catch(err => {
            console.error('Error loading filter parameters:', err);
        });
}

function populateFilterSelect(selectId, defaultText, items) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = `<option value="ALL">${defaultText}</option>`;
    
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
    });
    
    select.addEventListener('change', () => {
        fetchAndRenderOverview();
    });
}

// Debounce helper for slider movements
let debounceTimeout = null;
function debouncedOverviewFetch() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        fetchAndRenderOverview();
    }, 250);
}

function getSelectedFilters() {
    const minAmount = parseFloat(document.getElementById('slider-min-amount').value);
    
    const getSelectValue = (id) => {
        const select = document.getElementById(id);
        return select ? select.value : 'ALL';
    };
    
    return {
        min_amount: minAmount,
        categories: getSelectValue('select-categories') === 'ALL' ? 'ALL' : [getSelectValue('select-categories')],
        brands: getSelectValue('select-brands') === 'ALL' ? 'ALL' : [getSelectValue('select-brands')],
        channels: getSelectValue('select-channels') === 'ALL' ? 'ALL' : [getSelectValue('select-channels')]
    };
}

function fetchAndRenderOverview() {
    const payload = getSelectedFilters();
    
    // Set loading indicators
    document.getElementById('temporal-chart-viewport').innerHTML = '<div class="chart-loading">Compiling transactional timeline...</div>';
    document.getElementById('top-products-list').innerHTML = '<div class="loading-text" style="padding:20px;">Computing top products...</div>';
    document.getElementById('recent-orders-tbody').innerHTML = '<tr><td colspan="5" class="loading-td">Compiling transaction records...</td></tr>';
    document.getElementById('channel-donut-viewport').innerHTML = '<div class="chart-loading">Assembling channel splits...</div>';
    
    fetch('/api/overview-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        overviewData = data;
        
        // 1. Update KPI Values
        const kpis = data.kpis;
        document.getElementById('kpi-customer-count').textContent = kpis.customer_count.toLocaleString();
        document.getElementById('kpi-net-revenue').textContent = formatCurrency(kpis.net_revenue);
        document.getElementById('kpi-avg-order-value').textContent = '£' + kpis.avg_order_value.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.getElementById('kpi-order-count').textContent = kpis.order_count.toLocaleString();
        
        // 2. Render Temporal Chart
        renderOverviewChart();
        
        // 3. Render Top-Selling Products list
        renderTopProductsList(data.top_products);
        
        // 4. Render Recent Invoices table
        renderRecentOrdersTable(data.recent_orders);
        
        // 5. Render Donut Chart
        renderChannelDonutChart(data.channel_shares, kpis.order_count);
    })
    .catch(err => {
        console.error('Error fetching overview insights:', err);
    });
}

function setTemporalMetric(metric) {
    activeTemporalMetric = metric;
    
    // Toggle active selector buttons
    document.querySelectorAll('.metric-selector button').forEach(btn => {
        if (btn.id.startsWith('btn-metric-')) {
            btn.classList.remove('active');
        }
    });
    
    if (metric === 'revenue') {
        document.getElementById('btn-metric-revenue').classList.add('active');
    } else if (metric === 'orders') {
        document.getElementById('btn-metric-orders').classList.add('active');
    } else if (metric === 'customers') {
        document.getElementById('btn-metric-customers').classList.add('active');
    }
    
    renderOverviewChart();
}

function renderOverviewChart() {
    const viewport = document.getElementById('temporal-chart-viewport');
    if (!viewport) return;
    
    if (!overviewData || !overviewData.temporal || overviewData.temporal.dates.length === 0) {
        viewport.innerHTML = '<div class="chart-loading">No transactions match the selected filters.</div>';
        return;
    }
    
    const temp = overviewData.temporal;
    let yData = [];
    let yLabel = '';
    
    if (activeTemporalMetric === 'revenue') {
        yData = temp.revenue;
        yLabel = 'Net Revenue (£)';
    } else if (activeTemporalMetric === 'orders') {
        yData = temp.orders;
        yLabel = 'Invoices Count';
    } else if (activeTemporalMetric === 'customers') {
        yData = temp.customers;
        yLabel = 'Unique Customers';
    }
    
    const trace = {
        x: temp.dates,
        y: yData,
        type: 'scatter',
        mode: 'lines+markers',
        name: yLabel,
        line: { color: '#FF6B50', width: 3 },
        marker: { size: 6, color: '#FF6B50', line: { color: '#050505', width: 1 } },
        fill: 'tozeroy',
        fillcolor: 'rgba(255, 107, 80, 0.05)',
        hoverinfo: 'x+y'
    };
    
    const layout = {
        paper_bgcolor: '#111111',
        plot_bgcolor: '#111111',
        font: { family: 'Inter, sans-serif', color: '#ffffff', size: 10 },
        margin: { l: 45, r: 20, t: 20, b: 30 },
        xaxis: {
            gridcolor: '#1c1c1c',
            showgrid: true,
            zeroline: false,
            linecolor: '#222222',
            tickformat: '%b %d'
        },
        yaxis: {
            gridcolor: '#1c1c1c',
            showgrid: true,
            zeroline: false,
            linecolor: '#222222'
        },
        hoverlabel: {
            bgcolor: '#111111',
            bordercolor: '#FF6B50',
            font: { color: '#ffffff', family: 'Inter, sans-serif' }
        }
    };
    
    Plotly.newPlot('temporal-chart-viewport', [trace], layout, { responsive: true, displayModeBar: false });
}

function renderTopProductsList(products) {
    const list = document.getElementById('top-products-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (products.length === 0) {
        list.innerHTML = '<div class="loading-text" style="padding:20px;">No product records found.</div>';
        return;
    }
    
    products.forEach(prod => {
        const item = document.createElement('div');
        item.className = 'top-product-item';
        
        item.innerHTML = `
            <div class="top-product-details">
                <span class="top-product-name" title="${prod.product}">${prod.product}</span>
                <span class="top-product-brand">${prod.brand}</span>
            </div>
            <span class="top-product-revenue">${formatCurrency(prod.revenue)}</span>
        `;
        list.appendChild(item);
    });
}

function renderRecentOrdersTable(orders) {
    const tbody = document.getElementById('recent-orders-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#666;padding:30px;">No recent transactions match filters.</td></tr>';
        return;
    }
    
    orders.forEach(ord => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td title="${ord.product}"><b>${ord.product}</b></td>
            <td>${ord.brand}</td>
            <td class="num-align">${ord.quantity.toLocaleString()}</td>
            <td class="num-align">${formatCurrency(ord.revenue)}</td>
            <td><span class="badge" style="background-color:rgba(255,107,80,0.05); color:#FF6B50; border:1px solid rgba(255,107,80,0.2); font-size:0.65rem;">${ord.channel}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderChannelDonutChart(shares, totalInvoices) {
    const viewport = document.getElementById('channel-donut-viewport');
    if (!viewport) return;
    
    if (!shares || shares.labels.length === 0) {
        viewport.innerHTML = '<div class="chart-loading">No channel details.</div>';
        return;
    }
    
    // Assign custom color palette from Midnight editorial specs
    const colors = shares.labels.map(lbl => midnightColors[lbl] || '#444');
    
    const trace = {
        labels: shares.labels,
        values: shares.values,
        type: 'pie',
        hole: 0.6,
        marker: { colors: colors },
        hoverinfo: 'label+value+percent',
        textinfo: 'percent',
        textfont: { family: 'Inter, sans-serif', color: '#ffffff', size: 10 }
    };
    
    const layout = {
        paper_bgcolor: '#111111',
        plot_bgcolor: '#111111',
        font: { family: 'Inter, sans-serif', color: '#ffffff', size: 10 },
        margin: { l: 20, r: 20, t: 15, b: 15 },
        showlegend: true,
        legend: {
            orientation: 'h',
            y: -0.15,
            x: 0.15,
            font: { color: '#ffffff', size: 10 }
        },
        annotations: [{
            font: { size: 13, color: '#ffffff', family: 'Inter, sans-serif' },
            showarrow: false,
            text: `<b>Total</b><br>${totalInvoices.toLocaleString()}`,
            x: 0.5,
            y: 0.5
        }]
    };
    
    Plotly.newPlot('channel-donut-viewport', [trace], layout, { responsive: true, displayModeBar: false });
}

// ----------------------------------------------------
// RFM PAGE CONTROLLER
// ----------------------------------------------------
function initRFMPage() {
    fetch('/api/rfm-data')
        .then(res => res.json())
        .then(data => {
            rfmSummaryData = data.summary;
            rfmScatterData = data.scatter_points;
            
            // 1. Build summary table
            renderRFMSummaryTable();
            
            // 2. Render 3D space graph
            renderRFM3DChart();
        })
        .catch(err => {
            console.error('Error loading RFM analysis data:', err);
        });
}

function renderRFMSummaryTable() {
    const tbody = document.getElementById('rfm-summary-tbody');
    if (!tbody || !rfmSummaryData) return;
    
    tbody.innerHTML = '';
    
    rfmSummaryData.forEach(row => {
        const tr = document.createElement('tr');
        
        // Color dot indicator for segment color alignment
        const color = midnightColors[row.segment] || '#fff';
        
        tr.innerHTML = `
            <td>
                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${color}; margin-right:8px;"></span>
                <b>${row.segment}</b>
            </td>
            <td class="num-align">${row.count.toLocaleString()}</td>
            <td class="num-align">${row.percentage}</td>
            <td>${row.avg_recency}</td>
            <td>${row.avg_frequency}</td>
            <td>${row.avg_monetary}</td>
        `;
        tbody.appendChild(tr);
    });
}

function setMonetaryScale(scale) {
    activeMonetaryScale = scale;
    
    document.querySelectorAll('.metric-selector button').forEach(btn => {
        if (btn.id.startsWith('btn-scale-')) {
            btn.classList.remove('active');
        }
    });
    
    if (scale === 'log') {
        document.getElementById('btn-scale-log').classList.add('active');
    } else {
        document.getElementById('btn-scale-linear').classList.add('active');
    }
    
    renderRFM3DChart();
}

function renderRFM3DChart() {
    const viewport = document.getElementById('rfm-3d-chart-viewport');
    if (!viewport || !rfmScatterData) return;
    
    const sc = rfmScatterData;
    
    // Group points by segment so Plotly draws distinct legend groups with correct colors
    const uniqueSegments = [...new Set(sc.segments)];
    
    const traces = uniqueSegments.map(segName => {
        const indices = sc.segments.map((s, i) => s === segName ? i : -1).filter(idx => idx !== -1);
        
        const xCoords = indices.map(idx => sc.recency[idx]);
        const yCoords = indices.map(idx => sc.frequency[idx]);
        
        // Decide Monetary coordinates (linear vs log)
        const zCoords = indices.map(idx => {
            return activeMonetaryScale === 'log' ? sc.monetary_log[idx] : sc.monetary[idx];
        });
        
        const customerNames = indices.map(idx => sc.customers[idx]);
        const monetaryRaw = indices.map(idx => sc.monetary[idx]);
        
        const hoverTexts = indices.map(idx => {
            return `<b>${sc.customers[idx]}</b><br>` +
                   `Segment: ${segName}<br>` +
                   `Recency: ${sc.recency[idx]} days<br>` +
                   `Frequency: ${sc.frequency[idx]} orders<br>` +
                   `Monetary: £${sc.monetary[idx].toLocaleString('en-GB', { minimumFractionDigits: 2 })}`;
        });
        
        return {
            x: xCoords,
            y: yCoords,
            z: zCoords,
            mode: 'markers',
            name: segName,
            text: hoverTexts,
            hoverinfo: 'text',
            marker: {
                size: 4.5,
                opacity: 0.85,
                color: midnightColors[segName] || '#FFFFFF',
                line: { color: '#050505', width: 0.5 }
            },
            type: 'scatter3d'
        };
    });
    
    const zTitle = activeMonetaryScale === 'log' ? 'Monetary (Log10 £)' : 'Monetary (£)';
    
    const layout = {
        paper_bgcolor: '#050505',
        plot_bgcolor: '#050505',
        font: { family: 'Inter, sans-serif', color: '#ffffff', size: 9 },
        scene: {
            xaxis: {
                title: 'Recency (Days Inactive)',
                backgroundcolor: '#111111',
                gridcolor: '#1c1c1c',
                showbackground: true,
                zerolinecolor: '#222222',
                titlefont: { color: '#666666' },
                tickfont: { color: '#888888' }
            },
            yaxis: {
                title: 'Frequency (Orders Count)',
                backgroundcolor: '#111111',
                gridcolor: '#1c1c1c',
                showbackground: true,
                zerolinecolor: '#222222',
                titlefont: { color: '#666666' },
                tickfont: { color: '#888888' }
            },
            zaxis: {
                title: zTitle,
                backgroundcolor: '#111111',
                gridcolor: '#1c1c1c',
                showbackground: true,
                zerolinecolor: '#222222',
                titlefont: { color: '#666666' },
                tickfont: { color: '#888888' }
            }
        },
        margin: { l: 0, r: 0, t: 0, b: 0 },
        legend: {
            title: { text: 'RFM SEGMENTS', font: { color: '#666666', size: 10 } },
            bgcolor: 'rgba(17,17,17,0.85)',
            bordercolor: '#222222',
            borderwidth: 1,
            font: { color: '#ffffff' },
            yanchor: 'top',
            y: 0.95,
            xanchor: 'left',
            x: 0.02
        }
    };
    
    Plotly.newPlot('rfm-3d-chart-viewport', traces, layout, { responsive: true, displayModeBar: false });
}


// ----------------------------------------------------
// PREDICTIVE CHURN PAGE CONTROLLER
// ----------------------------------------------------
function initChurnPage() {
    fetch('/api/churn-data')
        .then(res => res.json())
        .then(data => {
            churnMetricsRF = data.rf_metrics;
            churnMetricsXGB = data.xgb_metrics;
            churnImportancesRF = data.rf_importances;
            churnImportancesXGB = data.xgb_importances;
            churnRegistryRaw = data.registry;
            
            // 1. Populate testing accuracy metrics table
            populateMLMetricsTable();
            
            // 2. Render Importance Chart
            renderFeatureImportanceChart();
            
            // 3. Render Risk Registry
            renderRiskRegistry();
        })
        .catch(err => {
            console.error('Error loading churn ML forecasting pipelines:', err);
        });
}

function populateMLMetricsTable() {
    const metrics = ['accuracy', 'precision', 'recall', 'f1_score', 'roc_auc'];
    metrics.forEach(m => {
        const rfVal = churnMetricsRF[m];
        const xgbVal = churnMetricsXGB[m];
        
        document.getElementById(`metric-rf-${m}`).textContent = (rfVal * 100).toFixed(2) + '%';
        document.getElementById(`metric-xgb-${m}`).textContent = (xgbVal * 100).toFixed(2) + '%';
    });
}

function setMLModel(model) {
    activeMLModel = model;
    
    // Update Feature Importance title
    const header = document.getElementById('importance-chart-header');
    if (header) {
        header.textContent = (model === 'rf' ? 'Random Forest' : 'XGBoost') + ' Feature Importances';
    }
    
    // Redraw importance and update registry probabilities
    renderFeatureImportanceChart();
    renderRiskRegistry();
}

function renderFeatureImportanceChart() {
    const viewport = document.getElementById('churn-importance-viewport');
    if (!viewport) return;
    
    const importances = activeMLModel === 'rf' ? churnImportancesRF : churnImportancesXGB;
    if (!importances) return;
    
    // Take top 10 features, reverse for horizontal bar chart ordering
    const topImp = importances.slice(0, 8).reverse();
    
    const xData = topImp.map(item => item.coefficient);
    const yData = topImp.map(item => item.feature);
    
    const trace = {
        x: xData,
        y: yData,
        type: 'bar',
        orientation: 'h',
        marker: { color: '#FF6B50' },
        hoverinfo: 'x+y'
    };
    
    const layout = {
        paper_bgcolor: '#111111',
        plot_bgcolor: '#111111',
        font: { family: 'Inter, sans-serif', color: '#ffffff', size: 9 },
        margin: { l: 120, r: 20, t: 10, b: 35 },
        xaxis: {
            gridcolor: '#1c1c1c',
            showgrid: true,
            zeroline: false,
            linecolor: '#222222',
            title: 'Importance Score'
        },
        yaxis: {
            gridcolor: 'rgba(0,0,0,0)',
            showgrid: false,
            linecolor: '#222222'
        },
        hoverlabel: {
            bgcolor: '#111111',
            bordercolor: '#FF6B50',
            font: { color: '#ffffff' }
        }
    };
    
    Plotly.newPlot('churn-importance-viewport', [trace], layout, { responsive: true, displayModeBar: false });
}

function applyRegistryFilters() {
    renderRiskRegistry();
}

function sortRegistry(column) {
    if (registrySortColumn === column) {
        registrySortAsc = !registrySortAsc;
    } else {
        registrySortColumn = column;
        registrySortAsc = column === 'customer_name'; // default ascending for name, descending for numbers
    }
    
    // Update UI headers indicators
    const columnsList = ['customer_name', 'recency', 'frequency', 'monetary', 'prob'];
    columnsList.forEach(col => {
        const icon = document.getElementById(`sort-icon-${col}`);
        if (!icon) return;
        if (col === registrySortColumn) {
            icon.textContent = registrySortAsc ? '▲' : '▼';
            icon.style.color = '#FF6B50';
        } else {
            icon.textContent = '↕';
            icon.style.color = '#666666';
        }
    });
    
    renderRiskRegistry();
}

function getRegistryRiskLevel(prob) {
    if (prob >= 0.70) return 'High';
    if (prob >= 0.30) return 'Medium';
    return 'Low';
}

function renderRiskRegistry() {
    const tbody = document.getElementById('registry-tbody');
    if (!tbody || !churnRegistryRaw) return;
    
    const searchVal = document.getElementById('registry-search').value.toLowerCase();
    
    const getCheckedFilterValues = (id) => {
        const checkboxes = document.querySelectorAll(`#${id} input:checked`);
        return Array.from(checkboxes).map(cb => cb.value);
    };
    
    // Read checked risk level states
    const activeRiskLevels = [];
    if (document.getElementById('chk-risk-high').checked) activeRiskLevels.push('High');
    if (document.getElementById('chk-risk-medium').checked) activeRiskLevels.push('Medium');
    if (document.getElementById('chk-risk-low').checked) activeRiskLevels.push('Low');
    
    // Read checked actual status states
    const activeStatuses = [];
    if (document.getElementById('chk-status-churned').checked) activeStatuses.push('Churned');
    if (document.getElementById('chk-status-active').checked) activeStatuses.push('Active');
    
    // 1. Filter raw registry data
    let filtered = churnRegistryRaw.filter(row => {
        const nameMatch = row.customer_name.toLowerCase().includes(searchVal);
        
        const prob = activeMLModel === 'rf' ? row.prob_rf : row.prob_xgb;
        const risk = getRegistryRiskLevel(prob);
        const riskMatch = activeRiskLevels.includes(risk);
        
        const statusMatch = activeStatuses.includes(row.actual_status);
        
        return nameMatch && riskMatch && statusMatch;
    });
    
    // 2. Sort filtered registry data
    filtered.sort((a, b) => {
        let valA, valB;
        
        if (registrySortColumn === 'prob') {
            valA = activeMLModel === 'rf' ? a.prob_rf : a.prob_xgb;
            valB = activeMLModel === 'rf' ? b.prob_rf : b.prob_xgb;
        } else {
            valA = a[registrySortColumn];
            valB = b[registrySortColumn];
        }
        
        if (typeof valA === 'string') {
            return registrySortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        } else {
            return registrySortAsc ? valA - valB : valB - valA;
        }
    });
    
    // 3. Render rows
    tbody.innerHTML = '';
    
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666;padding:30px;">No customers match the current search filters.</td></tr>';
        return;
    }
    
    filtered.forEach(row => {
        const tr = document.createElement('tr');
        const prob = activeMLModel === 'rf' ? row.prob_rf : row.prob_xgb;
        const risk = getRegistryRiskLevel(prob);
        
        const badgeClass = `badge badge-${risk.toLowerCase()}`;
        const statusClass = row.actual_status === 'Churned' ? 'status-churned' : 'status-active';
        
        tr.innerHTML = `
            <td><b>${row.customer_name}</b></td>
            <td class="num-align">${row.recency} d</td>
            <td class="num-align">${row.frequency}</td>
            <td class="num-align">${formatCurrency(row.monetary)}</td>
            <td>
                <div class="prob-cell">
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${prob * 100}%;"></div>
                    </div>
                    <span class="progress-text">${(prob * 100).toFixed(1)}%</span>
                </div>
            </td>
            <td><span class="${badgeClass}">${risk}</span></td>
            <td><span class="${statusClass}">${row.actual_status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}
