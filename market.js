(function() {
    let marketData = [];
    let filteredData = [];
    let currentEditingItem = null;
    let elements = {};
    let currentWorkbook = null;

    const MASTER_FILE_XLSX = 'Market_Master.xlsx';
    
    const formatDate = (date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    };

    window.initializeMarket = async function() {
        elements = {
            search: document.getElementById('market-search'),
            categoryFilter: document.getElementById('market-category-filter'),
            subCategoryFilter: document.getElementById('market-sub-category-filter'),
            tableBody: document.getElementById('market-body'),
            connectBtn: document.getElementById('market-connect-folder'),
            syncBtn: document.getElementById('market-sync-data'),
            statusMsg: document.getElementById('market-status-msg'),
            overlay: document.getElementById('market-modal-overlay'),
            mainCatInput: document.getElementById('market-main-cat'),
            subCatInput: document.getElementById('market-sub-cat'),
            levelInput: document.getElementById('market-level'),
            itemNameInput: document.getElementById('market-item-name'),
            minPriceInput: document.getElementById('market-min-price'),
            nowPriceInput: document.getElementById('market-now-price'),
            confirmBtn: document.getElementById('market-edit-confirm'),
            cancelBtn: document.getElementById('market-edit-cancel')
        };
        
        setupEventListeners();
        
        if (window.dirHandle) {
            updateStatusMsg(`<i class="fas fa-folder-open"></i> 已記住資料夾：${window.dirHandle.name}`, '#2ecc71');
            await syncData();
        } else {
            updateStatusMsg('<i class="fas fa-exclamation-circle"></i> 尚未連接資料夾', '#e74c3c');
        }
        
        renderTable();
    };

    function updateStatusMsg(msg, color = '') {
        if (elements.statusMsg) {
            elements.statusMsg.innerHTML = msg;
            if (color) elements.statusMsg.style.color = color;
        }
    }

    function setupEventListeners() {
        if (!elements.search) return;
        elements.search.oninput = applyFilters;
        elements.categoryFilter.onchange = applyFilters;
        elements.subCategoryFilter.onchange = applyFilters;
        
        elements.connectBtn.onclick = async () => {
            try {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                window.dirHandle = handle;
                await window.saveHandleToDB(handle);
                updateStatusMsg(`<i class="fas fa-check-circle"></i> 已連結：${handle.name}`, '#2ecc71');
                await syncData();
            } catch (e) { }
        };

        elements.syncBtn.onclick = syncData;
        if (elements.cancelBtn) elements.cancelBtn.onclick = () => elements.overlay.style.display = 'none';
        if (elements.confirmBtn) elements.confirmBtn.onclick = handleSave;
    }

    async function syncData() {
        if (!window.dirHandle) return;
        updateStatusMsg('<i class="fas fa-sync fa-spin"></i> 正在掃描最近 7 天的檔案...', '#f1c40f');
        
        try {
            if (!(await window.verifyPermission(window.dirHandle))) {
                updateStatusMsg('<i class="fas fa-lock"></i> 權限不足，請點擊連接授權', '#e74c3c');
                return;
            }

            let latestFileHandle = null;
            let fileName = '';

            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                const checkName = `Market_Master_${formatDate(date)}.xlsx`;
                try {
                    latestFileHandle = await window.dirHandle.getFileHandle(checkName);
                    fileName = checkName;
                    if (latestFileHandle) break;
                } catch (e) { }
            }

            if (!latestFileHandle) {
                try {
                    latestFileHandle = await window.dirHandle.getFileHandle(MASTER_FILE_XLSX);
                    fileName = MASTER_FILE_XLSX;
                } catch (e) { }
            }

            if (!latestFileHandle) {
                updateStatusMsg('<i class="fas fa-search"></i> 找不到最近檔案，請手動選擇', '#e67e22');
                try {
                    const [filePicker] = await window.showOpenFilePicker({
                        types: [{ description: 'Excel Files', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }]
                    });
                    latestFileHandle = filePicker;
                    fileName = latestFileHandle.name;
                } catch (e) { return; }
            }

            const file = await latestFileHandle.getFile();
            const buffer = await file.arrayBuffer();
            currentWorkbook = XLSX.read(buffer, { type: 'array' });
            const sheet = currentWorkbook.Sheets["MarketData"] || currentWorkbook.Sheets[currentWorkbook.SheetNames[0]];
            marketData = XLSX.utils.sheet_to_json(sheet);

            marketData = marketData.map(row => ({
                '母類別': row['母類別'] || '',
                '子類別': row['子類別'] || '',
                '等級': row['等級'] !== undefined ? row['等級'] : row['地圖等級'],
                '品項': row['品項'] || '',
                '系統低價': parseFloat(row['系統低價']) || 0,
                '現在市價': parseFloat(row['現在市價']) || 0,
                '更新時間': row['更新時間'] || new Date().toLocaleString()
            }));

            updateStatusMsg(`<i class="fas fa-check-circle"></i> 已讀取：${fileName}`, '#2ecc71');
            updateFilterOptions();
            applyFilters();
        } catch (e) {
            updateStatusMsg('<i class="fas fa-times-circle"></i> 讀取失敗', '#e74c3c');
        }
    }

    async function handleSave() {
        if (!currentEditingItem) return;
        const now = new Date().toLocaleString('zh-TW', { hour12: false });
        Object.assign(currentEditingItem, {
            母類別: elements.mainCatInput.value,
            子類別: elements.subCatInput.value,
            等級: elements.levelInput.value,
            品項: elements.itemNameInput.value,
            系統低價: parseFloat(elements.minPriceInput.value) || 0,
            現在市價: parseFloat(elements.nowPriceInput.value) || 0,
            更新時間: now
        });
        elements.overlay.style.display = 'none';
        applyFilters();
        await saveToFolder();
    }

    async function saveToFolder() {
        if (!window.dirHandle) return;
        try {
            const marketSheet = XLSX.utils.json_to_sheet(marketData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, marketSheet, "MarketData");
            if (currentWorkbook) {
                currentWorkbook.SheetNames.forEach(name => {
                    if (name !== "MarketData" && name !== workbook.SheetNames[0]) {
                        XLSX.utils.book_append_sheet(workbook, currentWorkbook.Sheets[name], name);
                    }
                });
            }
            const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            const masterHandle = await window.dirHandle.getFileHandle(MASTER_FILE_XLSX, { create: true });
            const writable = await masterHandle.close || (await masterHandle.createWritable());
            await writable.write(buffer);
            await writable.close();

            const backupName = `Market_Master_${formatDate(new Date())}.xlsx`;
            const backupHandle = await window.dirHandle.getFileHandle(backupName, { create: true });
            const backupWritable = await backupHandle.createWritable();
            await backupWritable.write(buffer);
            await backupWritable.close();
            updateStatusMsg(`<i class="fas fa-check-circle"></i> 已存檔並備份：${backupName}`, '#2ecc71');
        } catch (e) { }
    }

    function updateFilterOptions() {
        const mainCats = [...new Set(marketData.map(item => item['母類別']))].filter(Boolean).sort();
        const subCats = [...new Set(marketData.map(item => item['子類別']))].filter(Boolean).sort();
        
        // Update Search Filters
        elements.categoryFilter.innerHTML = '<option value="">全部母類別</option>' + 
            mainCats.map(c => `<option value="${c}">${c}</option>`).join('');
        elements.subCategoryFilter.innerHTML = '<option value="">全部子類別</option>' + 
            subCats.map(c => `<option value="${c}">${c}</option>`).join('');

        // Update Modal Selects
        elements.mainCatInput.innerHTML = mainCats.map(c => `<option value="${c}">${c}</option>`).join('');
        updateModalSubOptions();
    }

    function updateModalSubOptions() {
        const selectedMain = elements.mainCatInput.value;
        const subCats = [...new Set(marketData
            .filter(item => item['母類別'] === selectedMain)
            .map(item => item['子類別'])
        )].filter(Boolean).sort();
        
        elements.subCatInput.innerHTML = subCats.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    // Add listener for modal main cat change
    if (elements.mainCatInput) {
        elements.mainCatInput.onchange = updateModalSubOptions;
    }

    function applyFilters() {
        const query = (elements.search.value || '').toLowerCase();
        const mainCat = elements.categoryFilter.value;
        const subCat = elements.subCategoryFilter.value;
        
        filteredData = marketData.filter(item => {
            const nameMatch = (item['品項'] || '').toLowerCase().includes(query);
            const mainMatch = mainCat === '' || item['母類別'] === mainCat;
            const subMatch = subCat === '' || item['子類別'] === subCat;
            return nameMatch && mainMatch && subMatch;
        });

        // 多層級排序: 地圖等級(0-14) > 母類別(權重) > 子類別
        const categoryWeight = {
            '基礎資源': 1,
            '專屬資源': 2,
            '一般半成品': 3,
            '專屬半成品': 4,
            '特殊材料': 5
        };

        filteredData.sort((a, b) => {
            // 1. 地圖等級 (處理空白與數值)
            const getLevelVal = (val) => {
                if (val === '' || val === undefined || val === null) return 999;
                return parseInt(val);
            };

            const levelA = getLevelVal(a['等級']);
            const levelB = getLevelVal(b['等級']);
            
            if (levelA !== levelB) return levelA - levelB;

            // 2. 母類別 (按權重)
            const weightA = categoryWeight[a['母類別']] || 99;
            const weightB = categoryWeight[b['母類別']] || 99;
            
            if (weightA !== weightB) return weightA - weightB;
            
            if (a['母類別'] !== b['母類別']) {
                return a['母類別'].localeCompare(b['母類別'], 'zh-TW');
            }

            // 3. 子類別
            return (a['子類別'] || '').localeCompare(b['子類別'] || '', 'zh-TW');
        });

        renderTable();
    }

    function renderTable() {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';
        filteredData.forEach(item => {
            const min = parseFloat(item['系統低價']) || 0;
            const current = parseFloat(item['現在市價']) || 0;
            const max = Math.round(min * 3);
            
            let statusLabel = '低價';
            let statusClass = 'status-low';
            
            if (max > min) {
                const ratio = (current - min) / (max - min);
                if (ratio > 0.66) {
                    statusLabel = '高價';
                    statusClass = 'status-high';
                } else if (ratio > 0.33) {
                    statusLabel = '中價';
                    statusClass = 'status-mid';
                }
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item['母類別']}</td>
                <td>${item['子類別']}</td>
                <td>${item['等級'] || '-'}</td>
                <td style="font-weight:600; color:var(--accent-orange);">${item['品項']}</td>
                <td class="price-tag">${min}</td>
                <td class="price-tag">${max}</td>
                <td class="price-tag price-normal">${current}</td>
                <td><div class="status-badge ${statusClass}">${statusLabel}</div></td>
                <td class="update-time">${item['更新時間']}</td>
                <td><button class="admin-mini-btn" onclick="window.editMarketItem('${item['品項']}')"><i class="fas fa-edit"></i> 修改</button></td>
            `;
            elements.tableBody.appendChild(tr);
        });
    }

    window.editMarketItem = function(itemName) {
        currentEditingItem = marketData.find(i => i['品項'] === itemName);
        if (currentEditingItem) {
            elements.mainCatInput.value = currentEditingItem['母類別'];
            updateModalSubOptions(); // Populate the sub-category list based on the main category
            elements.subCatInput.value = currentEditingItem['子類別'];
            elements.levelInput.value = currentEditingItem['等級'] || '';
            elements.itemNameInput.value = currentEditingItem['品項'];
            elements.minPriceInput.value = currentEditingItem['系統低價'];
            elements.nowPriceInput.value = currentEditingItem['現在市價'];
            elements.overlay.style.display = 'flex';
        }
    };
})();
