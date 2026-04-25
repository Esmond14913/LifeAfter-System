(function() {
    let speciesData = [];
    let filteredData = [];
    let isAdmin = false;
    let dirHandle = null;
    let currentEditingBreed = null;
    let elements = {};

    const DATA_FOLDER = 'data';
    const BACKUP_FOLDER = 'backups';
    const MASTER_FILE = 'Species_Master.csv';
    const ADMIN_PASSWORD = '1491';
    const ONLINE_URL = 'https://raw.githubusercontent.com/Esmond14913/LifeAfter-System/main/data/Species_Master.csv';

    const SUB_SPECIES_MAP = {
        '動物': ['咕咕鵝', '長鼻豬', '短毛兔', '短角牛', '絨絨羊', '矮腳雞', '嘎嘎鴨'],
        '食材': ['白蘿蔔', '西瓜&84西瓜', '南瓜', '柿子', '桃樹&黃桃', '草莓', '番茄', '鳳梨'],
        '花': ['風信子', '牽牛花', '碧綠常勝松', '薔薇', '繡球花']
    };

    window.initializeSpecies = async function() {
        elements = {
            tableBody: document.getElementById('species-table-body'),
            mainFilter: document.getElementById('species-main-filter'),
            subFilter: document.getElementById('species-sub-filter'),
            levelFilter: document.getElementById('species-level-filter'),
            search: document.getElementById('species-search'),
            adminToggle: document.getElementById('species-admin-toggle'),
            adminPanel: document.getElementById('species-admin-panel'),
            modal: document.getElementById('species-modal-overlay'),
            form: document.getElementById('species-form'),
            statusMsg: document.getElementById('species-sync-status'),
            modalMain: document.getElementById('modal-species-main'),
            modalSub: document.getElementById('modal-species-sub'),
            modalBreed: document.getElementById('modal-species-breed'),
            modalNote: document.getElementById('modal-species-note'),
            locationContainer: document.getElementById('modal-location-container')
        };
        setupEventListeners();
        await loadFolderHandle();
        await syncData(); // Always try to sync (online first)
        updateSubFilter();
        renderTable();
    };

    function setupEventListeners() {
        if (!elements.mainFilter) return;
        elements.mainFilter.onchange = () => { updateSubFilter(); applyFilters(); };
        elements.subFilter.onchange = applyFilters;
        elements.levelFilter.oninput = applyFilters;
        elements.search.oninput = applyFilters;
        elements.adminToggle.onclick = () => {
            if (!isAdmin) {
                const pass = prompt("請輸入管理員密碼：");
                if (pass === ADMIN_PASSWORD) {
                    isAdmin = true;
                    elements.adminToggle.classList.add('unlocked');
                    elements.adminToggle.innerHTML = '<i class="fas fa-unlock"></i>';
                    elements.adminPanel.style.display = 'flex';
                    renderTable();
                } else if (pass !== null) alert("密碼錯誤！");
            } else {
                isAdmin = false;
                elements.adminToggle.classList.remove('unlocked');
                elements.adminToggle.innerHTML = '<i class="fas fa-lock"></i>';
                elements.adminPanel.style.display = 'none';
                renderTable();
            }
        };
        elements.modalMain.onchange = () => updateModalSub();
        elements.form.onsubmit = handleFormSubmit;
    }

    async function loadFolderHandle() {
        try {
            const db = await new Promise((resolve, reject) => {
                const req = indexedDB.open('LifeAfter_Market_FS', 1);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            const tx = db.transaction('handles', 'readonly');
            const req = tx.objectStore('handles').get('dir_handle');
            dirHandle = await new Promise(resolve => req.onsuccess = () => resolve(req.result));
        } catch (e) { }
    }

    async function getDataFolder() {
        if (!dirHandle) return null;
        try {
            return await dirHandle.getDirectoryHandle(DATA_FOLDER, { create: true });
        } catch(e) { return null; }
    }

    async function getBackupFolder() {
        const dataFolder = await getDataFolder();
        if (!dataFolder) return null;
        try {
            return await dataFolder.getDirectoryHandle(BACKUP_FOLDER, { create: true });
        } catch(e) { return null; }
    }

    async function syncData() {
        elements.statusMsg.innerHTML = '<i class="fas fa-sync fa-spin"></i> 正在從 GitHub 同步...';
        
        // 1. Try Online First
        try {
            const response = await fetch(ONLINE_URL, { cache: 'no-cache' });
            if (response.ok) {
                let text = await response.text();
                if (text.startsWith('\ufeff')) text = text.slice(1);
                speciesData = parseCSV(text);
                elements.statusMsg.innerHTML = '<i class="fas fa-globe" style="color:#4cd137"></i> 線上資料庫已同步';
                applyFilters();
                return;
            }
        } catch (e) {
            console.warn('GitHub sync failed, falling back to local.');
        }

        // 2. Fallback to Local Folder
        if (!dirHandle) {
            elements.statusMsg.innerHTML = '<i class="fas fa-wifi-slash"></i> 離線中且未連結本地目錄';
            return;
        }

        try {
            const dataFolder = await getDataFolder();
            if (!dataFolder) throw new Error("No data folder");
            const fileHandle = await dataFolder.getFileHandle(MASTER_FILE, { create: true });
            const file = await fileHandle.getFile();
            let text = await file.text();
            if (text.startsWith('\ufeff')) text = text.slice(1);
            speciesData = parseCSV(text);
            elements.statusMsg.innerHTML = '<i class="fas fa-hdd" style="color:#f39c12"></i> 已載入本地資料 (離線模式)';
            applyFilters();
        } catch (e) { 
            console.error(e);
            elements.statusMsg.innerHTML = '<i class="fas fa-times-circle"></i> 資料載入失敗'; 
        }
    }

    function parseCSV(text) {
        if (!text || text.trim() === "") return [];
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 1) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        if (headers.length < 2) return [];
        return lines.slice(1).map((line, idx) => {
            const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
            const obj = { id: Date.now() + Math.random() + idx };
            headers.forEach((h, i) => {
                let val = values[i] ? values[i].trim() : '';
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
                obj[h] = val;
            });
            return obj;
        });
    }

    function updateSubFilter() {
        const main = elements.mainFilter.value;
        const subs = main ? SUB_SPECIES_MAP[main] : [];
        elements.subFilter.innerHTML = '<option value="">全部次物種</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    function updateModalSub() {
        const main = elements.modalMain.value;
        const subs = SUB_SPECIES_MAP[main] || [];
        elements.modalSub.innerHTML = subs.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    function applyFilters() {
        const main = elements.mainFilter.value;
        const sub = elements.subFilter.value;
        const lv = elements.levelFilter.value;
        const q = elements.search.value.toLowerCase();
        filteredData = speciesData.filter(item => {
            const mMatch = !main || item['主物種'] === main;
            const sMatch = !sub || item['次物種'] === sub;
            const lMatch = !lv || item['地圖等級'] == lv;
            const qMatch = !q || (item['品種'] || '').toLowerCase().includes(q) || (item['地圖名稱'] || '').toLowerCase().includes(q);
            return mMatch && sMatch && lMatch && qMatch;
        });
        renderTable();
    }

    function renderTable() {
        if (!elements.tableBody) return;
        elements.tableBody.innerHTML = '';
        filteredData.forEach(item => {
            const tr = document.createElement('tr');
            const mainClass = item['主物種'] === '動物' ? 'tag-animal' : (item['主物種'] === '食材' ? 'tag-food' : 'tag-flower');
            tr.innerHTML = `
                <td><span class="tag ${mainClass}">${item['主物種']}</span></td>
                <td>${item['次物種']}</td>
                <td style="font-weight:bold; color:var(--accent-orange);">${item['品種']}</td>
                <td>LV.${item['地圖等級']}</td>
                <td>${item['地圖名稱']}</td>
                <td style="font-size:0.8rem; color:#aaa;">${item['備註'] || '-'}</td>
                ${isAdmin ? `<td><button onclick="window.editSpeciesEntry('${item['品種']}')" class="admin-mini-btn"><i class="fas fa-edit"></i> 修改</button></td>` : '<td></td>'}
            `;
            elements.tableBody.appendChild(tr);
        });
    }

    window.addSpeciesLocationRow = function(lv = '', map = '') {
        const div = document.createElement('div');
        div.style.cssText = 'display:grid; grid-template-columns: 80px 1fr 40px; gap:10px; margin-bottom:10px;';
        div.innerHTML = `
            <input type="number" class="loc-level" placeholder="等級" value="${lv}" required style="padding:8px; background:#000; border:1px solid #444; border-radius:6px; color:white;">
            <input type="text" class="loc-map" placeholder="地圖名稱" value="${map}" required style="padding:8px; background:#000; border:1px solid #444; border-radius:6px; color:white;">
            <button type="button" onclick="this.parentElement.remove()" style="background:#444; border:none; color:#ff7675; border-radius:6px; cursor:pointer;"><i class="fas fa-trash"></i></button>
        `;
        elements.locationContainer.appendChild(div);
    };

    window.addSpeciesEntry = function() {
        currentEditingBreed = null;
        elements.form.reset();
        elements.locationContainer.innerHTML = '';
        window.addSpeciesLocationRow();
        document.getElementById('species-modal-title').textContent = '新增物種紀錄';
        updateModalSub();
        elements.modal.style.display = 'flex';
    };

    window.editSpeciesEntry = function(breed) {
        const items = speciesData.filter(i => i['品種'] === breed);
        if (items.length === 0) return;
        currentEditingBreed = breed;
        elements.locationContainer.innerHTML = '';
        const first = items[0];
        elements.modalMain.value = first['主物種'];
        updateModalSub();
        elements.modalSub.value = first['次物種'];
        elements.modalBreed.value = first['品種'];
        elements.modalNote.value = first['備註'];
        items.forEach(item => window.addSpeciesLocationRow(item['地圖等級'], item['地圖名稱']));
        document.getElementById('species-modal-title').textContent = '修改物種紀錄';
        elements.modal.style.display = 'flex';
    };

    async function handleFormSubmit(e) {
        e.preventDefault();
        const main = elements.modalMain.value;
        const sub = elements.modalSub.value;
        const breed = elements.modalBreed.value.trim();
        const note = elements.modalNote.value.trim();
        const locRows = elements.locationContainer.querySelectorAll('div');
        const newEntries = [];
        locRows.forEach(row => {
            newEntries.push({
                id: Date.now() + Math.random(),
                '主物種': main, '次物種': sub, '品種': breed,
                '地圖等級': row.querySelector('.loc-level').value,
                '地圖名稱': row.querySelector('.loc-map').value.trim(),
                '備註': note
            });
        });
        if (currentEditingBreed) speciesData = speciesData.filter(i => i['品種'] !== currentEditingBreed);
        speciesData.push(...newEntries);
        await saveToCSV();
        elements.modal.style.display = 'none';
        applyFilters();
    }

    async function saveToCSV() {
        if (!dirHandle) return;
        const headers = ['主物種', '次物種', '品種', '地圖等級', '地圖名稱', '備註'];
        const csvContent = headers.join(',') + '\n' + 
            speciesData.map(item => headers.map(h => `"${(item[h] || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
        
        try {
            const encoder = new TextEncoder();
            const contentArray = encoder.encode(csvContent);
            const bomArray = new Uint8Array([0xEF, 0xBB, 0xBF]);
            const finalArray = new Uint8Array(bomArray.length + contentArray.length);
            finalArray.set(bomArray);
            finalArray.set(contentArray, bomArray.length);

            // Save to data/ folder
            const dataFolder = await getDataFolder();
            if (!dataFolder) throw new Error("No data folder");
            const masterHandle = await dataFolder.getFileHandle(MASTER_FILE, { create: true });
            const writable = await masterHandle.createWritable();
            await writable.write(finalArray);
            await writable.close();

            // Save to data/backups/ folder
            const backupFolder = await getBackupFolder();
            if (backupFolder) {
                const dateStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
                const backupHandle = await backupFolder.getFileHandle(`Species_Backup_${dateStr}.csv`, { create: true });
                const backupWritable = await backupHandle.createWritable();
                await backupWritable.write(finalArray);
                await backupWritable.close();
            }
            
            elements.statusMsg.innerHTML = '<i class="fas fa-save"></i> 存檔與備份成功 (data/)';
        } catch (e) { 
            console.error(e);
            alert("存檔失敗：請確保已授權本地資料夾存取權限。"); 
        }
    }

    window.exportSpeciesCSV = function() {
        const headers = ['主物種', '次物種', '品種', '地圖等級', '地圖名稱', '備註'];
        const csv = headers.join(',') + '\n' + speciesData.map(item => headers.map(h => `"${(item[h] || '').replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Species_Master.csv`;
        link.click();
    };

    window.importSpeciesCSV = function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv';
        input.onchange = e => {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = async event => {
                let text = event.target.result;
                if (text.startsWith('\ufeff')) text = text.slice(1);
                const newData = parseCSV(text);
                if (newData.length > 0) {
                    speciesData = newData;
                    await saveToCSV();
                    applyFilters();
                    alert("CSV 匯入成功！");
                } else {
                    alert("匯入失敗：CSV 格式不正確或檔案為空。");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };
})();
