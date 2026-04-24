(function() {
    let marketData = [];
    let filteredData = [];
    let dirHandle = null;
    let currentEditingItem = null;
    let elements = {};
    let currentWorkbook = null;

    const DB_NAME = 'LifeAfter_Market_FS';
    const STORE_NAME = 'handles';
    const MASTER_FILE_XLSX = 'Market_Master.xlsx';
    const MASTER_FILE_CSV = 'Market_Master.csv';

    // IndexedDB Helpers
    const openDB = () => new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    const saveHandle = async (handle) => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, 'dir_handle');
        return new Promise((resolve) => tx.oncomplete = resolve);
    };

    const getHandle = async () => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('dir_handle');
        return new Promise((resolve) => req.onsuccess = () => resolve(req.result));
    };

    async function verifyPermission(handle) {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        if ((await handle.requestPermission(opts)) === 'granted') return true;
        return false;
    }

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
        
        setupEventListeners();
        
        try {
            const savedHandle = await getHandle();
            if (savedHandle) {
                dirHandle = savedHandle;
                elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 已記憶資料夾：<strong>${dirHandle.name}</strong>`;
                elements.syncBtn.style.display = 'block';
                await syncData();
            }
        } catch (e) { console.warn('Restore handle failed', e); }
        
        renderTable();
    };

    function setupEventListeners() {
        if (!elements.search) return;
        
        elements.search.oninput = applyFilters;
        elements.categoryFilter.onchange = applyFilters;
        elements.subCategoryFilter.onchange = applyFilters;
        
        elements.connectBtn.onclick = async () => {
            try {
                dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await saveHandle(dirHandle);
                elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 已連接：<strong>${dirHandle.name}</strong>`;
                elements.syncBtn.style.display = 'block';
                await syncData();
            } catch (e) { console.warn('Picker cancelled', e); }
        };

        elements.syncBtn.onclick = syncData;
        elements.cancelBtn.onclick = () => elements.overlay.style.display = 'none';
        elements.confirmBtn.onclick = handleSave;
    }

    async function syncData() {
        if (!dirHandle) return;
        elements.statusMsg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 同步中...';
        
        try {
            if (!(await verifyPermission(dirHandle))) {
                elements.statusMsg.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#e74c3c"></i> 權限不足，請重新點擊連接授權';
                return;
            }

            let foundFile = null;
            try {
                const fileHandle = await dirHandle.getFileHandle(MASTER_FILE_XLSX);
                foundFile = await fileHandle.getFile();
            } catch (e) {
                try {
                    const csvHandle = await dirHandle.getFileHandle(MASTER_FILE_CSV);
                    foundFile = await csvHandle.getFile();
                } catch (e2) { }
            }

            if (!foundFile) {
                elements.statusMsg.innerHTML = '<i class="fas fa-info-circle"></i> 找不到資料檔 (xlsx/csv)。';
                return;
            }

            if (foundFile.name.endsWith('.xlsx')) {
                const buffer = await foundFile.arrayBuffer();
                currentWorkbook = XLSX.read(buffer, { type: 'array' });
                const sheet = currentWorkbook.Sheets["MarketData"] || currentWorkbook.Sheets[currentWorkbook.SheetNames[0]];
                marketData = XLSX.utils.sheet_to_json(sheet);
            } else {
                const text = await foundFile.text();
                marketData = parseCSV(text);
                await saveToFolder(true); 
            }

            marketData = marketData.map(row => ({
                '母類別': row['母類別'] || '',
                '子類別': row['子類別'] || '',
                '等級': row['等級'] !== undefined ? row['等級'] : (row['地圖等級'] !== undefined ? row['地圖等級'] : undefined),
                '品項': row['品項'] || '',
                '系統低價': parseFloat(row['系統低價']) || 0,
                '現在市價': parseFloat(row['現在市價']) || 0,
                '更新時間': row['更新時間'] || new Date().toLocaleString()
            }));

            elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 資料已同步 (${foundFile.name})`;
            updateFilterOptions();
            applyFilters();
        } catch (e) {
            console.error('Sync failed', e);
            elements.statusMsg.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c"></i> 同步失敗！';
        }
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 1) return [];
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        return lines.slice(1).map(line => {
            const values = line.split(delimiter);
            const obj = {};
            headers.forEach((h, i) => {
                obj[h] = values[i] !== undefined ? values[i].trim().replace(/"/g, '') : '';
            });
            return obj;
        });
    }

    async function handleSave() {
        if (!currentEditingItem) return;
        const now = new Date().toLocaleString('zh-TW', { hour12: false });

        Object.assign(currentEditingItem, {
            母類別: elements.mainCatInput.value,
            子類別: elements.subCatInput.value.trim(),
            等級: elements.levelInput.value === '' ? undefined : parseInt(elements.levelInput.value),
            品項: elements.itemNameInput.value.trim(),
            系統低價: parseFloat(elements.minPriceInput.value) || 0,
            現在市價: parseFloat(elements.nowPriceInput.value) || 0,
            更新時間: now
        });

        elements.overlay.style.display = 'none';
        applyFilters();
        await saveToFolder();
    }

    async function saveToFolder(quiet = false) {
        if (!dirHandle) return;
        if (!quiet) elements.statusMsg.innerHTML = '<i class="fas fa-save fa-spin"></i> 正在更新 Excel 檔案...';

        try {
            const marketSheet = XLSX.utils.json_to_sheet(marketData);
            const workbook = XLSX.utils.book_new();
            
            // Add MarketData Sheet
            XLSX.utils.book_append_sheet(workbook, marketSheet, "MarketData");
            
            // PRESERVE other sheets (like CraftingRecipes) if we have them in memory
            if (currentWorkbook) {
                currentWorkbook.SheetNames.forEach(name => {
                    if (name !== "MarketData" && name !== workbook.SheetNames[0]) {
                        XLSX.utils.book_append_sheet(workbook, currentWorkbook.Sheets[name], name);
                    }
                });
            }

            const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

            // 1. Save Master XLSX
            const masterHandle = await dirHandle.getFileHandle(MASTER_FILE_XLSX, { create: true });
            const writable = await masterHandle.createWritable();
            await writable.write(buffer);
            await writable.close();

            // 2. Save Daily Backup
            const now = new Date();
            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const backupName = `Market_Master_${dateStr}.xlsx`;
            const backupHandle = await dirHandle.getFileHandle(backupName, { create: true });
            const backupWritable = await backupHandle.createWritable();
            await backupWritable.write(buffer);
            await backupWritable.close();

            // Update memory reference
            currentWorkbook = workbook;

            if (!quiet) elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 存檔與備份成功！`;
        } catch (e) {
            console.error('Save failed', e);
            if (!quiet) elements.statusMsg.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c"></i> 存檔失敗，請檢查資料夾權限。';
        }
    }

    function updateFilterOptions() {
        const mainCats = [...new Set(marketData.map(item => item['母類別']))].filter(Boolean).sort();
        const subCats = [...new Set(marketData.map(item => item['子類別']))].filter(Boolean).sort();
        elements.categoryFilter.innerHTML = '<option value="">全部母類別</option>' + 
            mainCats.map(c => `<option value="${c}">${c}</option>`).join('');
        elements.subCategoryFilter.innerHTML = '<option value="">全部子類別</option>' + 
            subCats.map(c => `<option value="${c}">${c}</option>`).join('');
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
        renderTable();
    }

    function renderTable() {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';

        if (marketData.length === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 50px; color: #555;">尚未同步數據，請連接資料夾。</td></tr>';
            return;
        }

        filteredData.forEach(item => {
            const min = parseFloat(item['系統低價']) || 0;
            const current = parseFloat(item['現在市價']) || 0;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item['母類別']}</td>
                <td>${item['子類別']}</td>
                <td>${item['等級'] !== undefined ? 'LV.'+item['等級'] : '-'}</td>
                <td style="font-weight:600; color:var(--accent-orange);">${item['品項']}</td>
                <td class="price-tag">${min}</td>
                <td class="price-tag">${Math.round(min*3)}</td>
                <td class="price-tag price-normal">${current}</td>
                <td><div class="status-badge status-fair">${current > min ? '中位' : '超值'}</div></td>
                <td class="update-time">${item['更新時間']}</td>
                <td>
                    <button class="admin-mini-btn" onclick="window.editMarketItem('${item['品項']}')"><i class="fas fa-edit"></i> 修改</button>
                </td>
            `;
            elements.tableBody.appendChild(tr);
        });
    }

    window.editMarketItem = function(itemName) {
        currentEditingItem = marketData.find(i => i['品項'] === itemName);
        if (currentEditingItem) {
            elements.mainCatInput.value = currentEditingItem['母類別'] || '基礎資源';
            elements.subCatInput.value = currentEditingItem['子類別'] || '';
            elements.levelInput.value = currentEditingItem['等級'] !== undefined ? currentEditingItem['等級'] : '';
            elements.itemNameInput.value = currentEditingItem['品項'] || '';
            elements.minPriceInput.value = currentEditingItem['系統低價'] || 0;
            elements.nowPriceInput.value = currentEditingItem['現在市價'] || 0;
            elements.overlay.style.display = 'flex';
        }
    };
})();
