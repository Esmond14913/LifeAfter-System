(function() {
    let marketData = [];
    let filteredData = [];
    let isAdmin = false;

    const elements = {
        search: document.getElementById('market-search'),
        categoryFilter: document.getElementById('market-category-filter'),
        tableBody: document.getElementById('market-body'),
        adminLoginBtn: document.getElementById('market-admin-login'),
        
        // Modals
        overlay: document.getElementById('market-modal-overlay'),
        itemNameDisplay: document.getElementById('edit-item-name'),
        newPriceInput: document.getElementById('new-market-price'),
        cancelBtn: document.getElementById('market-edit-cancel'),
        confirmBtn: document.getElementById('market-edit-confirm')
    };

    let currentEditingItem = null;

    window.initializeMarket = function() {
        // Re-grab elements because template injection replaces them
        elements.search = document.getElementById('market-search');
        elements.categoryFilter = document.getElementById('market-category-filter');
        elements.tableBody = document.getElementById('market-body');
        elements.adminLoginBtn = document.getElementById('market-admin-login');
        elements.overlay = document.getElementById('market-modal-overlay');
        elements.itemNameDisplay = document.getElementById('edit-item-name');
        elements.newPriceInput = document.getElementById('new-market-price');
        elements.cancelBtn = document.getElementById('market-edit-cancel');
        elements.confirmBtn = document.getElementById('market-edit-confirm');

        init();
    };

    async function init() {
        await loadData();
        setupEventListeners();
        applyFilters();
    }

    async function loadData() {
        const localData = localStorage.getItem('lifeafter_market_db');
        if (localData) {
            marketData = JSON.parse(localData);
            return;
        }

        try {
            const response = await fetch('../data/market.csv');
            if (!response.ok) throw new Error('Fetch failed');
            const text = await response.text();
            parseCSV(text);
        } catch (error) {
            console.error('Market CSV load failed:', error);
            // Minimal fallback if CSV missing
            marketData = [{品項: '小枝芽', 類別: '材料', 系統低價: 16, 現在市價: 16, 更新時間: '2026-04-23 15:20:00'}];
        }
    }

    function parseCSV(text) {
        const lines = text.trim().split('\n');
        const headers = lines[0].split(',');
        marketData = lines.slice(1).map(line => {
            const values = line.split(',');
            const obj = {};
            headers.forEach((header, index) => {
                obj[header.trim()] = values[index] ? values[index].trim() : '';
            });
            // Ensure numbers are numbers
            obj['系統低價'] = parseFloat(obj['系統低價']) || 0;
            obj['現在市價'] = parseFloat(obj['現在市價']) || 0;
            return obj;
        });
        saveToLocal();
    }

    function saveToLocal() {
        localStorage.setItem('lifeafter_market_db', JSON.stringify(marketData));
    }

    function setupEventListeners() {
        elements.search.addEventListener('input', applyFilters);
        elements.categoryFilter.addEventListener('change', applyFilters);
        
        elements.adminLoginBtn.addEventListener('click', () => {
            if (isAdmin) {
                isAdmin = false;
                elements.adminLoginBtn.innerHTML = '<i class="fas fa-user-shield"></i> 管理員登入';
                applyFilters();
            } else {
                const pass = prompt('請輸入管理員密碼：');
                if (pass === '1491') {
                    isAdmin = true;
                    elements.adminLoginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 登出管理員';
                    applyFilters();
                } else {
                    alert('密碼錯誤！');
                }
            }
        });

        elements.cancelBtn.addEventListener('click', () => elements.overlay.style.display = 'none');
        elements.confirmBtn.addEventListener('click', updatePrice);
        elements.newPriceInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') updatePrice(); });
    }

    function applyFilters() {
        const query = elements.search.value.toLowerCase();
        const category = elements.categoryFilter.value;

        filteredData = marketData.filter(item => {
            const nameMatch = item['品項'].toLowerCase().includes(query);
            const categoryMatch = category === '' || item['類別'] === category;
            return nameMatch && categoryMatch;
        });

        renderTable();
    }

    function renderTable() {
        elements.tableBody.innerHTML = '';
        
        // Update header visibility
        const adminHeaders = document.querySelectorAll('.admin-only');
        adminHeaders.forEach(th => th.style.display = isAdmin ? 'table-cell' : 'none');

        filteredData.forEach(item => {
            const min = item['系統低價'];
            const max = min * 3;
            const current = item['現在市價'];
            const percent = ((current - min) / (max - min)) * 100;
            
            let statusClass = 'status-fair';
            let statusText = '中位';
            if (percent < 30) { statusClass = 'status-cheap'; statusText = '超值'; }
            else if (percent > 70) { statusClass = 'status-expensive'; statusText = '昂貴'; }

            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="font-weight:600;">${item['品項']}</td>
                <td><span class="ingredient-tag">${item['類別']}</span></td>
                <td class="price-tag">${min}G</td>
                <td class="price-tag">${max}G</td>
                <td class="price-tag price-normal">${current}G</td>
                <td>
                    <div class="status-badge ${statusClass}">${statusText}</div>
                    <div class="range-bar-container">
                        <div class="range-bar-fill" style="width: ${Math.min(100, Math.max(0, percent))}%; background: ${percent > 70 ? '#e74c3c' : (percent < 30 ? '#2ecc71' : '#f39c12')};"></div>
                    </div>
                </td>
                <td class="update-time">${item['更新時間'] || '尚未記錄'}</td>
                ${isAdmin ? `
                <td class="admin-only">
                    <button class="admin-only-btn" onclick="window.editMarketPrice('${item['品項']}')">更新</button>
                </td>
                ` : ''}
            `;
            elements.tableBody.appendChild(row);
        });
    }

    window.editMarketPrice = function(itemName) {
        currentEditingItem = marketData.find(i => i['品項'] === itemName);
        if (currentEditingItem) {
            elements.itemNameDisplay.textContent = itemName;
            elements.newPriceInput.value = currentEditingItem['現在市價'];
            elements.overlay.style.display = 'flex';
            elements.newPriceInput.focus();
            elements.newPriceInput.select();
        }
    };

    function updatePrice() {
        const newPrice = parseFloat(elements.newPriceInput.value);
        if (isNaN(newPrice)) return;

        currentEditingItem['現在市價'] = newPrice;
        currentEditingItem['更新時間'] = new Date().toLocaleString('zh-TW', { hour12: false });
        
        saveToLocal();
        elements.overlay.style.display = 'none';
        applyFilters();
    }

})();
