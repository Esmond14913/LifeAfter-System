(function() {
    let marketData = [];
    let filteredData = [];
    let dirHandle = null;
    let currentEditingItem = null;
    let elements = {};

    const DB_NAME = 'LifeAfter_Market_FS';
    const STORE_NAME = 'handles';

    // IndexedDB Helpers
    const openDB = () => new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore(STORE_NAME);
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
            // Modal elements
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
        
        // Try to restore folder connection
        try {
            const savedHandle = await getHandle();
            if (savedHandle) {
                dirHandle = savedHandle;
                elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 已記憶資料夾：<strong>${dirHandle.name}</strong> (點擊同步讀取資料)`;
                elements.syncBtn.style.display = 'block';
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
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                await saveHandle(handle);
                dirHandle = handle;
                elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 已連接：<strong>${dirHandle.name}</strong>`;
                elements.syncBtn.style.display = 'block';
                syncData();
            } catch (e) { console.warn('Picker cancelled or failed', e); }
        };

        elements.syncBtn.onclick = syncData;
        
        elements.cancelBtn.onclick = () => elements.overlay.style.display = 'none';
        elements.confirmBtn.onclick = handleSave;
    }

    async function syncData() {
        if (!dirHandle) return;
        
        elements.statusMsg.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在掃描資料夾...';
        
        try {
            if (!(await verifyPermission(dirHandle))) {
                elements.statusMsg.innerHTML = '<i class="fas fa-exclamation-triangle" style="color:#e74c3c"></i> 權限不足，請重新點擊連接';
                return;
            }

            let masterFile = null;
            let masterDateStr = '';
            
            let normalFile = null;
            let normalTime = 0;

            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.csv')) {
                    // Pattern: Market_Master_YYYYMMDD.csv
                    if (entry.name.startsWith('Market_Master_')) {
                        const datePart = entry.name.replace('Market_Master_', '').replace('.csv', '');
                        if (datePart > masterDateStr) {
                            masterDateStr = datePart;
                            masterFile = await entry.getFile();
                        }
                    } else {
                        const file = await entry.getFile();
                        if (file.lastModified > normalTime) {
                            normalTime = file.lastModified;
                            normalFile = file;
                        }
                    }
                }
            }

            const targetFile = masterFile || normalFile;

            if (!targetFile) {
                elements.statusMsg.innerHTML = '<i class="fas fa-info-circle"></i> 找不到任何 CSV 檔案。';
                return;
            }

            elements.statusMsg.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 正在解析：${targetFile.name}`;
            
            const text = await targetFile.text();
            parseCSV(text);
            
            elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 同步成功！來源：<strong>${targetFile.name}</strong>`;
            
            updateFilterOptions();
            applyFilters();
        } catch (e) {
            console.error('Sync failed', e);
            elements.statusMsg.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c"></i> 同步失敗，請確認資料夾內容。';
        }
    }

    function parseCSV(text) {
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 1) return;

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = parseCSVLine(lines[0], delimiter).map(h => h.trim().replace(/"/g, ''));
        const nowTimestamp = new Date().toLocaleString('zh-TW', { hour12: false });

        marketData = lines.slice(1).filter(l => l.trim() !== '').map(line => {
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

    async function handleSave() {
        if (!currentEditingItem) return;
        
        const name = elements.itemNameInput.value.trim();
        if (!name) { alert('品項名稱不可為空！'); return; }

        const lvVal = elements.levelInput.value.trim();
        const level = lvVal === '' ? undefined : parseInt(lvVal);
        const min = parseFloat(elements.minPriceInput.value) || 0;
        const now = parseFloat(elements.nowPriceInput.value) || 0;
        const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });

        Object.assign(currentEditingItem, { 
            母類別: elements.mainCatInput.value, 
            子類別: elements.subCatInput.value.trim(), 
            等級: level, 
            品項: name, 
            系統低價: min, 
            現在市價: now, 
            更新時間: timestamp 
        });

        elements.overlay.style.display = 'none';
        applyFilters();
        
        // Auto-Backup to Folder
        await saveToFolder();
    }

    async function saveToFolder() {
        if (!dirHandle) return;
        
        elements.statusMsg.innerHTML = '<i class="fas fa-save fa-spin"></i> 正在生成備份檔案...';
        
        try {
            const now = new Date();
            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const fileName = `Market_Master_${dateStr}.csv`;
            
            const headers = ['母類別', '子類別', '地圖等級', '品項', '系統低價', '現在市價', '更新時間'];
            const csvRows = [headers.join(',')];
            
            marketData.forEach(item => {
                csvRows.push([
                    item['母類別'], item['子類別'], item['等級'] !== undefined ? item['等級'] : '', item['品項'], 
                    item['系統低價'], item['現在市價'], item['更新時間']
                ].map(v => `"${v}"`).join(','));
            });
            
            const content = "\ufeff" + csvRows.join('\n');
            const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            
            elements.statusMsg.innerHTML = `<i class="fas fa-check-circle" style="color:#2ecc71"></i> 備份成功：<strong>${fileName}</strong>`;
        } catch (e) {
            console.error('Backup failed', e);
            elements.statusMsg.innerHTML = '<i class="fas fa-times-circle" style="color:#e74c3c"></i> 備份失敗，請檢查資料夾權限。';
        }
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

        const editColHeader = document.querySelector('.edit-col');
        if (editColHeader) editColHeader.style.display = dirHandle ? 'table-cell' : 'none';

        if (marketData.length === 0) {
            elements.tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding: 50px; color: #555;">尚未同步數據，請點擊「同步數據」或連接資料夾。</td></tr>';
            return;
        }

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
                ${dirHandle ? `
                <td class="edit-col">
                    <button class="admin-mini-btn" onclick="window.editMarketItem('${item['品項']}')"><i class="fas fa-edit"></i> 修改</button>
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
