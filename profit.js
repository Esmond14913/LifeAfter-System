(function() {
    let craftingDB = {};
    let marketPrices = {};
    let dirHandle = null;
    let selectedTarget = null;
    let itemSupplyModes = {}; // Stores: 'market', 'cost', 'self'
    let currentTaxRate = 0.1; // Default 10%
    let elements = {};
    let currentWorkbook = null;

    const MASTER_FILE_XLSX = 'Market_Master.xlsx';

    window.initializeProfit = async function() {
        elements = {
            itemList: document.getElementById('profit-item-list'),
            costTree: document.getElementById('profit-cost-tree'),
            search: document.getElementById('profit-search'),
            expectedPrice: document.getElementById('profit-expected-price'),
            totalCost: document.getElementById('total-crafting-cost'),
            netProfit: document.getElementById('expected-net-profit'),
            roi: document.getElementById('profit-roi'),
            targetName: document.getElementById('selected-target-name'),
            advice: document.getElementById('profit-advice'),
            taxOptions: document.querySelectorAll('.tax-opt'),
            previewTree: document.getElementById('crafting-preview-tree'),
            formName: document.getElementById('craft-item-name'),
            formCategory: document.getElementById('craft-item-category')
        };

        setupEventListeners();
        await loadDataFromExcel();
    };

    function setupEventListeners() {
        if (!elements.search) return;
        elements.search.oninput = renderItemList;
        elements.expectedPrice.oninput = updateDashboard;
        elements.taxOptions.forEach(opt => {
            opt.onclick = () => {
                elements.taxOptions.forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                currentTaxRate = parseFloat(opt.dataset.tax);
                updateDashboard();
            };
        });
        elements.formName.oninput = renderPreviewTree;
        const closeBtn = document.getElementById('craft-modal-close-btn');
        if (closeBtn) closeBtn.onclick = () => document.getElementById('crafting-modal-overlay').style.display = 'none';
        if (cancelBtn = document.getElementById('craft-modal-cancel')) cancelBtn.onclick = () => document.getElementById('crafting-modal-overlay').style.display = 'none';
        if (saveBtn = document.getElementById('craft-modal-save')) saveBtn.onclick = handleFormSubmit;
    }

    async function loadDataFromExcel() {
        try {
            // Use Global dirHandle if available, otherwise fallback to private
            dirHandle = window.dirHandle || (await openMarketDB().then(db => {
                const tx = db.transaction('handles', 'readonly');
                const req = tx.objectStore('handles').get('dir_handle');
                return new Promise(resolve => req.onsuccess = () => resolve(req.result));
            }));

            if (dirHandle) {
                if (!(await window.verifyPermission(dirHandle))) return;
                const fileHandle = await dirHandle.getFileHandle(MASTER_FILE_XLSX);
                const file = await fileHandle.getFile();
                const buffer = await file.arrayBuffer();
                currentWorkbook = XLSX.read(buffer, { type: 'array' });
                const marketSheet = currentWorkbook.Sheets["MarketData"] || currentWorkbook.Sheets[currentWorkbook.SheetNames[0]];
                const marketRows = XLSX.utils.sheet_to_json(marketSheet);
                marketPrices = {};
                marketRows.forEach(row => { marketPrices[row['品項']] = parseFloat(row['現在市價']) || 0; });
                const recipeSheet = currentWorkbook.Sheets["CraftingRecipes"];
                if (recipeSheet) {
                    const recipeRows = XLSX.utils.sheet_to_json(recipeSheet);
                    craftingDB = {};
                    recipeRows.forEach(row => {
                        const materials = [];
                        for (let i = 1; i <= 6; i++) { if (row[`材料${i}`]) materials.push({ item: row[`材料${i}`], qty: parseFloat(row[`數量${i}`]) || 0 }); }
                        craftingDB[row['成品名稱']] = { category: row['母類別'], materials: materials };
                    });
                }
            }
        } catch (e) { console.warn('Profit: Load failed', e); }
        renderItemList();
    }

    function openMarketDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open('LifeAfter_Market_FS', 1);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function getPrice(itemName) { return marketPrices[itemName] || 0; }

    function renderItemList() {
        const query = elements.search.value.toLowerCase();
        elements.itemList.innerHTML = '';
        Object.keys(craftingDB).filter(name => name.toLowerCase().includes(query)).forEach(name => {
            const div = document.createElement('div');
            div.className = `list-item ${selectedTarget === name ? 'active' : ''}`;
            div.innerHTML = `<span>${name}</span><i class="fas fa-chevron-right"></i>`;
            div.onclick = () => {
                selectedTarget = name;
                renderItemList();
                renderCostTree();
                updateDashboard();
            };
            elements.itemList.appendChild(div);
        });
    }

    function getSupplyMode(itemName) {
        if (itemSupplyModes[itemName]) return itemSupplyModes[itemName];
        return craftingDB[itemName] ? 'cost' : 'market';
    }

    window.setSupplyMode = function(itemName, mode) {
        itemSupplyModes[itemName] = mode;
        renderCostTree();
        renderPreviewTree();
        updateDashboard();
    };

    function renderCostTree() {
        if (!selectedTarget) return;
        elements.costTree.innerHTML = '';
        elements.targetName.textContent = selectedTarget;
        try {
            const rootNode = buildNodeUI(selectedTarget, 1, new Set(), 0);
            elements.costTree.appendChild(rootNode);
        } catch (e) { 
            console.error(e);
            elements.costTree.innerHTML = `<div style="padding:20px; color:#e74c3c;"><i class="fas fa-exclamation-triangle"></i> 偵測到循環引用或運算過深，已停止。</div>`; 
        }
    }

    function buildNodeUI(itemName, qty, visited, depth) {
        if (depth > 10) throw new Error("Too deep");
        if (visited.has(itemName)) throw new Error("Circular dependency: " + itemName);
        
        const newVisited = new Set(visited);
        newVisited.add(itemName);

        const container = document.createElement('div');
        container.className = 'tree-node-wrapper';

        const recipe = craftingDB[itemName];
        const marketPrice = getPrice(itemName);
        const mode = getSupplyMode(itemName);
        
        const content = document.createElement('div');
        content.className = 'node-content';
        const hasRecipe = !!recipe;
        
        let displayPrice = marketPrice * qty;
        if (mode === 'self') displayPrice = 0;
        else if (mode === 'cost' && hasRecipe) displayPrice = calculateTotalCost(itemName, qty, new Set(), 0);

        content.innerHTML = `
            <div class="node-main">
                <i class="fas ${hasRecipe ? 'fa-layer-group' : 'fa-cube'}" style="color:${hasRecipe ? '#f39c12' : '#3498db'}"></i>
                <div>
                    <div style="font-weight:bold; font-size:0.9rem;">${itemName} x ${qty}</div>
                    <div style="font-size:0.75rem; color:#888;">單價: ${marketPrice.toLocaleString()}</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <div class="supply-selector">
                    <button class="supply-btn market ${mode === 'market' ? 'active' : ''}" onclick="window.setSupplyMode('${itemName}', 'market')">市</button>
                    ${hasRecipe ? `<button class="supply-btn cost ${mode === 'cost' ? 'active' : ''}" onclick="window.setSupplyMode('${itemName}', 'cost')">本</button>` : ''}
                    <button class="supply-btn self ${mode === 'self' ? 'active' : ''}" onclick="window.setSupplyMode('${itemName}', 'self')">自</button>
                </div>
                <div style="font-family:monospace; min-width:60px; text-align:right; font-weight:bold; color:${mode === 'self' ? '#27ae60' : (mode === 'cost' ? '#f39c12' : '#fff')}">
                    ${Math.round(displayPrice).toLocaleString()}
                </div>
            </div>
        `;
        container.appendChild(content);

        if (hasRecipe && mode === 'cost') {
            const subContainer = document.createElement('div');
            subContainer.className = 'tree-node';
            recipe.materials.forEach(mat => {
                subContainer.appendChild(buildNodeUI(mat.item, mat.qty * qty, newVisited, depth + 1));
            });
            container.appendChild(subContainer);
        }
        return container;
    }

    function calculateTotalCost(itemName, qty, visited, depth = 0) {
        if (depth > 10 || visited.has(itemName)) return getPrice(itemName) * qty;
        
        const mode = getSupplyMode(itemName);
        if (mode === 'self') return 0;
        if (mode === 'market') return getPrice(itemName) * qty;
        
        const recipe = craftingDB[itemName];
        if (!recipe) return getPrice(itemName) * qty;
        
        const newVisited = new Set(visited);
        newVisited.add(itemName);

        let subCost = 0;
        recipe.materials.forEach(mat => {
            subCost += calculateTotalCost(mat.item, mat.qty * qty, newVisited, depth + 1);
        });
        return subCost;
    }

    function updateDashboard() {
        if (!selectedTarget) return;
        const totalCost = calculateTotalCost(selectedTarget, 1, new Set(), 0);
        const sellPrice = parseFloat(elements.expectedPrice.value) || 0;
        const netProfit = (sellPrice * (1 - currentTaxRate)) - totalCost;
        const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
        elements.totalCost.textContent = Math.round(totalCost).toLocaleString();
        elements.netProfit.textContent = Math.round(netProfit).toLocaleString();
        elements.roi.textContent = roi.toFixed(1) + '%';
        elements.netProfit.style.color = netProfit > 0 ? '#2ecc71' : '#e74c3c';
    }

    window.showCraftingModal = function() {
        const overlay = document.getElementById('crafting-modal-overlay');
        document.getElementById('material-rows-container').innerHTML = '';
        window.addMaterialRow();
        overlay.style.display = 'flex';
        renderPreviewTree();
    };

    window.addMaterialRow = function(item = '', qty = '') {
        const container = document.getElementById('material-rows-container');
        const div = document.createElement('div');
        div.style.cssText = 'display:grid; grid-template-columns: 1fr 80px 40px; gap:10px; margin-bottom:10px;';
        div.innerHTML = `
            <input type="text" class="mat-name" placeholder="材料名稱" value="${item}" style="padding:10px; background:#000; border:1px solid #333; color:white; border-radius:8px;">
            <input type="number" class="mat-qty" placeholder="數量" value="${qty}" style="padding:10px; background:#000; border:1px solid #333; color:white; border-radius:8px;">
            <button type="button" onclick="this.parentElement.remove(); window.renderPreviewTree();" style="background:#444; border:none; color:#ff7675; border-radius:8px; cursor:pointer;"><i class="fas fa-trash"></i></button>
        `;
        container.appendChild(div);
        div.querySelector('.mat-name').oninput = renderPreviewTree;
        div.querySelector('.mat-qty').oninput = renderPreviewTree;
        renderPreviewTree();
    };

    window.renderPreviewTree = function() {
        const tempName = elements.formName.value || '未命名成品';
        const rows = document.querySelectorAll('#material-rows-container > div');
        const tempMaterials = [];
        rows.forEach(row => {
            const name = row.querySelector('.mat-name').value.trim();
            const qty = parseFloat(row.querySelector('.mat-qty').value) || 0;
            if (name) tempMaterials.push({ item: name, qty: qty });
        });
        const originalRecipe = craftingDB[tempName];
        craftingDB[tempName] = { materials: tempMaterials };
        elements.previewTree.innerHTML = '';
        try {
            const root = buildNodeUI(tempName, 1, new Set(), 0);
            elements.previewTree.appendChild(root);
        } catch (e) { elements.previewTree.innerHTML = '<div style="color:#e74c3c">預覽失敗或偵測到循環引用。</div>'; }
        if (originalRecipe) craftingDB[tempName] = originalRecipe;
        else delete craftingDB[tempName];
    };

    async function handleFormSubmit() {
        const targetName = elements.formName.value.trim();
        if (!targetName) return alert("請輸入成品名稱");
        const category = elements.formCategory.value;
        const rows = document.querySelectorAll('#material-rows-container > div');
        const materials = [];
        rows.forEach(row => {
            const name = row.querySelector('.mat-name').value.trim();
            const qty = parseFloat(row.querySelector('.mat-qty').value) || 0;
            if (name) materials.push({ item: name, qty: qty });
        });
        craftingDB[targetName] = { category: category, materials: materials };
        await saveRecipesToExcel();
        document.getElementById('crafting-modal-overlay').style.display = 'none';
        renderItemList();
    }

    async function saveRecipesToExcel() {
        if (!dirHandle) return;
        try {
            const rows = Object.keys(craftingDB).map(name => {
                const data = craftingDB[name];
                const obj = { '成品名稱': name, '母類別': data.category };
                data.materials.forEach((m, i) => { if (i < 6) { obj[`材料${i+1}`] = m.item; obj[`數量${i+1}`] = m.qty; } });
                return obj;
            });
            const recipeSheet = XLSX.utils.json_to_sheet(rows);
            const workbook = XLSX.utils.book_new();
            const marketSheet = currentWorkbook ? (currentWorkbook.Sheets["MarketData"] || currentWorkbook.Sheets[currentWorkbook.SheetNames[0]]) : XLSX.utils.json_to_sheet([]);
            XLSX.utils.book_append_sheet(workbook, marketSheet, "MarketData");
            XLSX.utils.book_append_sheet(workbook, recipeSheet, "CraftingRecipes");
            const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
            
            const masterHandle = await dirHandle.getFileHandle(MASTER_FILE_XLSX, { create: true });
            const writable = await masterHandle.createWritable();
            await writable.write(buffer);
            await writable.close();
            
            currentWorkbook = workbook;
            alert("食譜儲存成功！");
        } catch (e) { alert("儲存失敗"); }
    }
})();
