(function() {
    let speciesData = [];
    let filteredData = [];
    let elements = {};

    const ONLINE_URL = 'https://raw.githubusercontent.com/Esmond14913/LifeAfter-System/main/data/Species_Master.csv';

    window.initializeSpecies = async function() {
        elements = {
            tableBody: document.getElementById('species-table-body'),
            mainFilter: document.getElementById('species-main-filter'),
            subFilter: document.getElementById('species-sub-filter'),
            levelFilter: document.getElementById('species-level-filter'),
            search: document.getElementById('species-search'),
            statusMsg: document.getElementById('species-sync-status'),
            adminToggle: document.getElementById('species-admin-toggle'),
            adminPanel: document.getElementById('species-admin-panel')
        };
        
        setupEventListeners();
        await syncData(); // Only fetch from GitHub
        updateSubFilter();
        renderTable();

        // Online mode: Hide admin lock if not needed, or just show tools
        if (elements.adminToggle) elements.adminToggle.style.display = 'none';
        if (elements.adminPanel) {
            elements.adminPanel.style.display = 'flex'; // Always show tools like Export
            // Clean up admin panel to only show useful online tools
            elements.adminPanel.innerHTML = `
                <span style="font-weight:bold; color:var(--accent-orange); margin-right: 10px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-database"></i> 線上資料庫
                </span>
                <button onclick="window.exportSpeciesCSV()" class="admin-btn secondary"><i class="fas fa-file-export"></i> 匯出 CSV</button>
            `;
        }
    };

    function setupEventListeners() {
        if (!elements.mainFilter) return;
        elements.mainFilter.onchange = () => { updateSubFilter(); applyFilters(); };
        elements.subFilter.onchange = applyFilters;
        elements.levelFilter.oninput = applyFilters;
        elements.search.oninput = applyFilters;
    }

    async function syncData() {
        elements.statusMsg.innerHTML = '<i class="fas fa-sync fa-spin"></i> 正在從 GitHub 同步...';
        try {
            const response = await fetch(ONLINE_URL, { cache: 'no-cache' });
            if (response.ok) {
                let text = await response.text();
                if (text.startsWith('\ufeff')) text = text.slice(1);
                speciesData = parseCSV(text);
                elements.statusMsg.innerHTML = '<i class="fas fa-globe" style="color:#4cd137"></i> 線上資料庫已同步';
                applyFilters();
            } else {
                throw new Error("Fetch failed");
            }
        } catch (e) {
            elements.statusMsg.innerHTML = '<i class="fas fa-times-circle"></i> 無法連接線上資料庫';
        }
    }

    function parseCSV(text) {
        if (!text || text.trim() === "") return [];
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 1) return [];
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        return lines.slice(1).map((line, idx) => {
            const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
            const obj = { id: idx };
            headers.forEach((h, i) => {
                let val = values[i] ? values[i].trim() : '';
                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/""/g, '"');
                obj[h] = val;
            });
            return obj;
        });
    }

    function updateSubFilter() {
        const SUB_SPECIES_MAP = {
            '動物': ['咕咕鵝', '長鼻豬', '短毛兔', '短角牛', '絨絨羊', '矮腳雞', '嘎嘎鴨'],
            '食材': ['白蘿蔔', '西瓜&84西瓜', '南瓜', '柿子', '桃樹&黃桃', '草莓', '番茄', '鳳梨'],
            '花': ['風信子', '牽牛花', '碧綠常勝松', '薔薇', '繡球花']
        };
        const main = elements.mainFilter.value;
        const subs = main ? SUB_SPECIES_MAP[main] : [];
        elements.subFilter.innerHTML = '<option value="">全部次物種</option>' + subs.map(s => `<option value="${s}">${s}</option>`).join('');
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
                <td></td>
            `;
            elements.tableBody.appendChild(tr);
        });
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
})();
