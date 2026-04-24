(function() {
    let marketData = [];
    let filteredData = [];
    let isAdmin = false;
    let currentEditingItem = null;

    let elements = {};

    const initialMarketItems = [
        {母類別: '基礎資源', 子類別: '木', 等級: 0, 品項: '小枝芽', 系統低價: 16, 現在市價: 16, 更新時間: '2026-04-23 16:00:00'},
        {母類別: '基礎資源', 子類別: '木', 等級: 0, 品項: '樹油', 系統低價: 18, 現在市價: 18, 更新時間: '2026-04-23 16:00:00'},
        {母類別: '基礎資源', 子類別: '木', 等級: 1, 品項: '小樹枝', 系統低價: 21, 現在市價: 21, 更新時間: '2026-04-23 16:00:00'},
        {母類別: '基礎資源', 子類別: '木', 等級: 1, 品項: '硬木藤蔓', 系統低價: 14, 現在市價: 14, 更新時間: '2026-04-23 16:00:00'},
        {母類別: '基礎資源', 子類別: '木', 等級: 2, 品項: '樹脂', 系統低價: 11, 現在市價: 11, 更新時間: '2026-04-23 16:00:00'},
        {母類別: '基礎資源', 子類別: '木', 等級: 2, 品項: '木心', 系統低價: 16, 現在市價: 16, 更新時間: '2026-04-23 16:00:00'}
    ];

    window.initializeMarket = function() {
        elements = {
            search: document.getElementById('market-search'),
            categoryFilter: document.getElementById('market-category-filter'),
            subCategoryFilter: document.getElementById('market-sub-category-filter'),
            tableBody: document.getElementById('market-body'),
            adminLoginBtn: document.getElementById('market-admin-login'),
            adminTools: document.getElementById('market-admin-tools'),
            addBtn: document.getElementById('add-market-item-btn'),
            exportBtn: document.getElementById('market-export-csv'),
            importBtn: document.getElementById('market-import-csv-btn'),
            clearBtn: document.getElementById('market-clear-db'),
            csvInput: document.getElementById('market-csv-file-input'),
            overlay: document.getElementById('market-modal-overlay'),
            modalTitle: document.getElementById('market-modal-title'),
            mainCatInput: document.getElementById('market-main-cat'),
            subCatInput: document.getElementById('market-sub-cat'),
            levelInput: document.getElementById('market-level'),
            itemNameInput: document.getElementById('market-item-name'),
            minPriceInput: document.getElementById('market-min-price'),
            nowPriceInput: document.getElementById('market-now-price'),
            cancelBtn: document.getElementById('market-edit-cancel'),
            confirmBtn: document.getElementById('market-edit-confirm')
        };
        
        init();
    };

    async function init() {
        if (marketData.length === 0) {
            await loadData();
        }
        setupEventListeners();
        updateFilterOptions();
        applyFilters();
    }

    async function loadData() {
        const localData = localStorage.getItem('lifeafter_market_db_v4'); 
        if (localData) {
            marketData = JSON.parse(localData);
        } else {
            marketData = JSON.parse(JSON.stringify(initialMarketItems));
            saveToLocal();
        }
    }

    function saveToLocal() {
        localStorage.setItem('lifeafter_market_db_v4', JSON.stringify(marketData));
    }

    function updateFilterOptions() {
        const mainCats = [...new Set(marketData.map(item => item['母類別']))].filter(Boolean).sort();
        const subCats = [...new Set(marketData.map(item => item['子類別']))].filter(Boolean).sort();

        const curMain = elements.categoryFilter.value;
        const curSub = elements.subCategoryFilter.value;

        elements.categoryFilter.innerHTML = '<option value="">全部母類別</option>' + 
            mainCats.map(c => `<option value="${c}" ${c === curMain ? 'selected' : ''}>${c}</option>`).join('');
        
        elements.subCategoryFilter.innerHTML = '<option value="">全部子類別</option>' + 
            subCats.map(c => `<option value="${c}" ${c === curSub ? 'selected' : ''}>${c}</option>`).join('');
    }

    function setupEventListeners() {
        if (!elements.search) return;
        
        // Use onclick/oninput to prevent listener stacking
        elements.search.oninput = applyFilters;
        elements.categoryFilter.onchange = applyFilters;
        elements.subCategoryFilter.onchange = applyFilters;
        
        elements.adminLoginBtn.onclick = () => {
            if (isAdmin) {
                isAdmin = false;
                elements.adminLoginBtn.innerHTML = '<i class="fas fa-user-shield"></i> 管理員登入';
                elements.adminTools.style.display = 'none';
                applyFilters();
            } else {
                const pass = prompt('請輸入管理員密碼：');
                if (pass === '1491') {
                    isAdmin = true;
                    elements.adminLoginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 登出管理員';
                    elements.adminTools.style.display = 'flex';
                    applyFilters();
                } else if (pass !== null) {
                    alert('密碼錯誤！');
                }
            }
        };

        elements.addBtn.onclick = () => {
            currentEditingItem = null;
            elements.modalTitle.textContent = '新增交易品項';
            elements.mainCatInput.value = '基礎資源';
            elements.subCatInput.value = '';
            elements.levelInput.value = '';
            elements.itemNameInput.value = '';
            elements.minPriceInput.value = '';
            elements.nowPriceInput.value = '';
            elements.overlay.style.display = 'flex';
        };

        elements.exportBtn.onclick = () => {
            const headers = ['母類別', '子類別', '地圖等級', '品項', '系統低價', '現在市價', '更新時間'];
            const csvRows = [headers.join(',')];
            marketData.forEach(item => {
                csvRows.push([
                    item['母類別'], item['子類別'], item['等級'] !== undefined ? item['等級'] : '', item['品項'], 
                    item['系統低價'], item['現在市價'], item['更新時間']
                ].map(v => `"${v}"`).join(','));
            });
            const blob = new Blob(["\ufeff" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `交易市場備份_${new Date().toLocaleDateString()}.csv`;
            link.click();
        });

        elements.importBtn.addEventListener('click', () => elements.csvInput.click());
        elements.csvInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                const text = event.target.result;
                const lines = text.trim().split(/\r?\n/);
                const delimiter = lines[0].includes(';') ? ';' : ',';
                const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim().replace(/"/g, ''));
                
                const nowTimestamp = new Date().toLocaleString('zh-TW', { hour12: false });
                const imported = lines.slice(1).filter(l => l.trim() !== '').map(line => {
                    const values = parseCSVLine(line, delimiter);
                    const obj = {};
                    headers.forEach((h, i) => {
                        let val = (values[i] !== undefined) ? values[i].trim().replace(/"/g, '') : '';
                        if (h === '母類別') obj['母類別'] = val;
                        else if (h === '子類別') obj['子類別'] = val;
                        else if (h === '地圖等級' || h === '等級') obj['等級'] = val === '' ? undefined : parseInt(val);
                        else if (h === '品項') obj['品項'] = val;
                        else if (h === '系統低價') obj['系統低價'] = parseFloat(val) || 0;
                        else if (h === '現在市價') obj['現在市價'] = parseFloat(val) || 0;
                        else if (h === '更新時間') obj['更新時間'] = val || nowTimestamp;
                    });
                    if (!obj['更新時間']) obj['更新時間'] = nowTimestamp;
                    return obj;
                });

                if (confirm(`成功解析 ${imported.length} 筆資料，是否要覆蓋現有資料？`)) {
                    marketData = imported;
                    saveToLocal();
                    updateFilterOptions();
                    applyFilters();
                }
            };
            reader.readAsText(file);
        });

        elements.clearBtn.addEventListener('click', () => {
            if (confirm('確定要清空所有資料嗎？')) {
                marketData = [];
                saveToLocal();
                updateFilterOptions();
                applyFilters();
            }
        });

        elements.cancelBtn.addEventListener('click', () => elements.overlay.style.display = 'none');
        elements.confirmBtn.onclick = handleSave;
    }

    function parseCSVLine(text, delimiter) {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') { inQuote = !inQuote; }
            else if (char === delimiter && !inQuote) { result.push(cur); cur = ''; }
            else { cur += char; }
        }
        result.push(cur);
        return result;
    }

    function applyFilters() {
        const query = (elements.search.value || '').toLowerCase();
        const mainCat = elements.categoryFilter.value;
        const subCat = elements.subCategoryFilter.value;

        const mainCatOrder = { '基礎資源': 1, '專屬資源': 2, '一般半成品': 3, '專屬半成品': 4, '特殊材料': 5 };
        const subCatOrder = { '木': 1, '石': 2, '麻': 3, '怪物': 4, '傢俱': 5, '槍械': 6, '護甲': 7 };

        filteredData = marketData.filter(item => {
            const nameMatch = (item['品項'] || '').toLowerCase().includes(query);
            const mainMatch = mainCat === '' || item['母類別'] === mainCat;
            const subMatch = subCat === '' || item['子類別'] === subCat;
            return nameMatch && mainMatch && subMatch;
        });

        filteredData.sort((a, b) => {
            const wA1 = mainCatOrder[a['母類別']] || 99;
            const wB1 = mainCatOrder[b['母類別']] || 99;
            if (wA1 !== wB1) return wA1 - wB1;
            const wA2 = subCatOrder[a['子類別']] || 99;
            const wB2 = subCatOrder[b['子類別']] || 99;
            if (wA2 !== wB2) return wA2 - wB2;
            const lvA = a['等級'] === undefined ? 999 : a['等級'];
            const lvB = b['等級'] === undefined ? 999 : b['等級'];
            return lvA - lvB;
        });

        renderTable();
    }

    function renderTable() {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';
        const adminHeaders = document.querySelectorAll('.admin-only');
        adminHeaders.forEach(th => th.style.display = isAdmin ? 'table-cell' : 'none');

        filteredData.forEach(item => {
            const min = parseFloat(item['系統低價']) || 0;
            const max = min * 3;
            const current = parseFloat(item['現在市價']) || 0;
            const percent = max === min ? 0 : ((current - min) / (max - min)) * 100;
            
            let statusClass = 'status-fair';
            let statusText = '中位';
            if (percent < 30) { statusClass = 'status-cheap'; statusText = '超值'; }
            else if (percent > 70) { statusClass = 'status-expensive'; statusText = '昂貴'; }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="ingredient-tag" style="background:#444;">${item['母類別'] || '-'}</span></td>
                <td><span class="ingredient-tag" style="background:#2c3e50;">${item['子類別'] || '-'}</span></td>
                <td><span class="ingredient-tag" style="background:#8e44ad;">${item['等級'] !== undefined ? 'LV.'+item['等級'] : '-'}</span></td>
                <td style="font-weight:600; color:var(--accent-orange);">${item['品項'] || '-'}</td>
                <td class="price-tag">${min}</td>
                <td class="price-tag">${max}</td>
                <td class="price-tag price-normal">${current}</td>
                <td>
                    <div class="status-badge ${statusClass}">${statusText}</div>
                    <div class="range-bar-container">
                        <div class="range-bar-fill" style="width: ${Math.min(100, Math.max(0, percent))}%; background: ${percent > 70 ? '#e74c3c' : (percent < 30 ? '#2ecc71' : '#f39c12')};"></div>
                    </div>
                </td>
                <td class="update-time">${item['更新時間'] || '尚未記錄'}</td>
                ${isAdmin ? `
                <td class="admin-only">
                    <div style="display:flex; gap:5px;">
                        <button class="admin-mini-btn" onclick="window.editMarketItem('${item['品項']}')"><i class="fas fa-edit"></i></button>
                        <button class="admin-mini-btn delete" style="background:#e74c3c;" onclick="window.deleteMarketItem('${item['品項']}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
                ` : ''}
            `;
            elements.tableBody.appendChild(row);
        });
    }

    window.editMarketItem = function(itemName) {
        currentEditingItem = marketData.find(i => i['品項'] === itemName);
        if (currentEditingItem) {
            elements.modalTitle.textContent = '修改品項資料';
            elements.mainCatInput.value = currentEditingItem['母類別'] || '';
            elements.subCatInput.value = currentEditingItem['子類別'] || '';
            elements.levelInput.value = currentEditingItem['等級'] !== undefined ? currentEditingItem['等級'] : '';
            elements.itemNameInput.value = currentEditingItem['品項'] || '';
            elements.minPriceInput.value = currentEditingItem['系統低價'] || 0;
            elements.nowPriceInput.value = currentEditingItem['現在市價'] || 0;
            elements.overlay.style.display = 'flex';
        }
    };

    window.deleteMarketItem = function(itemName) {
        if (confirm(`確定要刪除「${itemName}」嗎？`)) {
            marketData = marketData.filter(i => i['品項'] !== itemName);
            saveToLocal();
            updateFilterOptions();
            applyFilters();
        }
    };

    function handleSave() {
        const name = elements.itemNameInput.value.trim();
        if (!name) { alert('品項名稱不可為空！'); return; }

        const lvVal = elements.levelInput.value.trim();
        const level = lvVal === '' ? undefined : parseInt(lvVal);
        const min = parseFloat(elements.minPriceInput.value) || 0;
        const now = parseFloat(elements.nowPriceInput.value) || 0;
        const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });

        if (currentEditingItem) {
            Object.assign(currentEditingItem, { 母類別: elements.mainCatInput.value, 子類別: elements.subCatInput.value.trim(), 等級: level, 品項: name, 系統低價: min, 現在市價: now, 更新時間: timestamp });
        } else {
            marketData.unshift({ 母類別: elements.mainCatInput.value, 子類別: elements.subCatInput.value.trim(), 等級: level, 品項: name, 系統低價: min, 現在市價: now, 更新時間: timestamp });
        }
        saveToLocal();
        updateFilterOptions();
        elements.overlay.style.display = 'none';
        applyFilters();
    }
})();
