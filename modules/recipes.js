(function() {
    let recipesData = [];
    let filteredData = [];
    let displayedCount = 20;
    const increment = 20;
    let isAdmin = false;
    let currentEditId = null;

    const elements = {
        search: document.getElementById('recipe-search'),
        attrFilter: document.getElementById('attr-filter'),
        grid: document.getElementById('recipe-grid'),
        resultCount: document.getElementById('result-count'),
        backupBtn: document.getElementById('backup-csv'),
        importBtn: document.getElementById('import-csv-btn'),
        fileInput: document.getElementById('csv-file-input'),
        loadingTrigger: document.getElementById('loading-trigger'),
        
        // Admin Elements
        adminLoginBtn: document.getElementById('admin-login-btn'),
        adminTools: document.getElementById('admin-tools'),
        addRecipeBtn: document.getElementById('add-recipe-btn'),
        clearDbBtn: document.getElementById('clear-db-btn'),
        profDashboard: document.getElementById('prof-dashboard'),
        
        // Modals
        overlay: document.getElementById('modal-overlay'),
        authModal: document.getElementById('auth-modal'),
        recipeModal: document.getElementById('recipe-modal'),
        passwordInput: document.getElementById('admin-password'),
        recipeForm: document.getElementById('recipe-form'),
        modalTitle: document.getElementById('modal-title'),
        imageInput: document.getElementById('image-upload-input')
    };

    // Initialize Module
    async function init() {
        await loadData();
        setupEventListeners();
        setupInfiniteScroll();
        applyFilters();
    }

    async function loadData() {
        // Try to load from LocalStorage first
        const localData = localStorage.getItem('lifeafter_recipes_db');
        if (localData) {
            console.log('Loading from LocalStorage');
            recipesData = JSON.parse(localData);
            return;
        }

        // Otherwise load from CSV
        try {
            const response = await fetch('../data/recipes.csv');
            if (!response.ok) throw new Error('Fetch failed');
            const text = await response.text();
            parseCSV(text);
        } catch (error) {
            console.warn('CSV fetch failed. Using sample data.');
            const sampleCSV = `編號,料理名稱,食材清單,屬性加成,備註,圖片數據,熟練度
1,果醬 (範例),水果,,本地模式預覽,,無
2,牛奶糖 (範例),蜂蜜、牛奶,移動速度提升+5%,本地模式預覽,,無
3,葡式蛋塔 (範例),麵粉、蜂蜜、牛奶,挖掘暴擊率+10%,本地模式預覽,,無`;
            parseCSV(sampleCSV);
        }
    }

    function parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];
            if (char === '"' && inQuotes && nextChar === '"') { currentField += '"'; i++; }
            else if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { currentRow.push(currentField.trim()); currentField = ''; }
            else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField.trim());
                    rows.push(currentRow);
                    currentField = ''; currentRow = [];
                }
                if (char === '\r' && nextChar === '\n') i++;
            } else { currentField += char; }
        }
        if (currentField || currentRow.length > 0) { currentRow.push(currentField.trim()); rows.push(currentRow); }

        const headers = rows[0];
        recipesData = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] || '';
                val = val.replace(/^"|"$/g, '');
                obj[header.trim()] = val;
            });
            return obj;
        });
        saveToLocal();
    }

    function saveToLocal() {
        localStorage.setItem('lifeafter_recipes_db', JSON.stringify(recipesData));
        calculateStats();
    }

    function calculateStats() {
        if (!isAdmin) return;
        const stats = { '領悟': 0, '生疏': 0, '熟練': 0, '掌握': 0, '無': 0 };
        recipesData.forEach(r => {
            const status = r['熟練度'] || '無';
            if (stats.hasOwnProperty(status)) stats[status]++;
        });

        // Update Dashboard
        elements.profDashboard.querySelector('.insight .count').textContent = stats['領悟'];
        elements.profDashboard.querySelector('.unfamiliar .count').textContent = stats['生疏'];
        elements.profDashboard.querySelector('.proficient .count').textContent = stats['熟練'];
        elements.profDashboard.querySelector('.master .count').textContent = stats['掌握'];
        
        const remaining = stats['領悟'] + stats['生疏'] + stats['熟練'];
        document.getElementById('remaining-count').textContent = remaining;
    }

    function setupEventListeners() {
        elements.search.addEventListener('input', resetAndFilter);
        elements.attrFilter.addEventListener('change', resetAndFilter);
        elements.backupBtn.addEventListener('click', exportCSV);
        elements.importBtn.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleImport);

        // Admin Auth
        elements.adminLoginBtn.addEventListener('click', () => {
            if (isAdmin) logout();
            else openModal('auth');
        });
        document.getElementById('auth-confirm').addEventListener('click', login);
        document.getElementById('auth-cancel').addEventListener('click', closeModal);
        elements.passwordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') login(); });

        // Admin Tools
        elements.addRecipeBtn.addEventListener('click', () => openModal('recipe'));
        elements.clearDbBtn.addEventListener('click', clearDatabase);
        elements.recipeForm.addEventListener('submit', handleRecipeSubmit);
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        
        // Image Upload
        elements.imageInput.addEventListener('change', handleImageUpload);
    }

    function login() {
        if (elements.passwordInput.value === '1491') {
            isAdmin = true;
            elements.adminLoginBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 登出管理員';
            elements.adminTools.style.display = 'flex';
            elements.profDashboard.style.display = 'grid';
            closeModal();
            calculateStats();
            applyFilters();
        } else {
            alert('密碼錯誤！');
        }
    }

    function logout() {
        isAdmin = false;
        elements.adminLoginBtn.innerHTML = '<i class="fas fa-user-shield"></i> 管理員登入';
        elements.adminTools.style.display = 'none';
        elements.profDashboard.style.display = 'none';
        applyFilters();
    }

    function openModal(type, id = null) {
        elements.overlay.style.display = 'flex';
        elements.authModal.style.display = 'none';
        elements.recipeModal.style.display = 'none';

        if (type === 'auth') {
            elements.authModal.style.display = 'block';
            elements.passwordInput.focus();
        } else if (type === 'recipe') {
            elements.recipeModal.style.display = 'block';
            currentEditId = id;
            if (id) {
                elements.modalTitle.textContent = '編輯食譜';
                const recipe = recipesData.find(r => r['編號'] === id);
                if (recipe) {
                    Object.keys(recipe).forEach(key => {
                        const input = elements.recipeForm.querySelector(`[name="${key}"]`);
                        if (input) input.value = recipe[key];
                    });
                }
            } else {
                elements.modalTitle.textContent = '新增食譜';
                elements.recipeForm.reset();
            }
        }
    }

    function closeModal() {
        elements.overlay.style.display = 'none';
        elements.passwordInput.value = '';
    }

    function handleRecipeSubmit(e) {
        e.preventDefault();
        const formData = new FormData(elements.recipeForm);
        const newRecipe = {};
        formData.forEach((value, key) => newRecipe[key] = value);

        if (currentEditId) {
            const index = recipesData.findIndex(r => r['編號'] === currentEditId);
            recipesData[index] = newRecipe;
        } else {
            if (!newRecipe['編號']) newRecipe['編號'] = Date.now().toString().slice(-6);
            recipesData.unshift(newRecipe);
        }

        saveToLocal();
        closeModal();
        applyFilters();
    }

    function deleteRecipe(id) {
        if (confirm('確定要刪除這筆食譜嗎？')) {
            recipesData = recipesData.filter(r => r['編號'] !== id);
            saveToLocal();
            applyFilters();
        }
    }

    function clearDatabase() {
        if (confirm('警告：這將清空所有本地修改並恢復至原始資料。確定嗎？')) {
            localStorage.removeItem('lifeafter_recipes_db');
            location.reload();
        }
    }

    function handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(event) {
            const base64 = event.target.result.split(',')[1];
            elements.recipeForm.querySelector('[name="圖片數據"]').value = base64;
        };
        reader.readAsDataURL(file);
    }

    function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            parseCSV(e.target.result);
            resetAndFilter();
            alert(`成功匯入 ${recipesData.length} 筆資料！`);
        };
        reader.readAsText(file);
    }

    function setupInfiniteScroll() {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && displayedCount < filteredData.length) {
                loadMore();
            }
        }, { threshold: 0.1 });
        observer.observe(elements.loadingTrigger);
    }

    function loadMore() {
        const nextBatch = filteredData.slice(displayedCount, displayedCount + increment);
        displayedCount += increment;
        renderCards(nextBatch, false);
    }

    function resetAndFilter() {
        displayedCount = increment;
        applyFilters();
    }

    function applyFilters() {
        const query = elements.search.value.toLowerCase();
        const selectedFilter = elements.attrFilter.value;

        filteredData = recipesData.filter(recipe => {
            const name = (recipe['料理名稱'] || '').toLowerCase();
            const ingredients = (recipe['食材清單'] || '').toLowerCase();
            const boost = (recipe['屬性加成'] || '').toLowerCase();
            const searchMatch = name.includes(query) || ingredients.includes(query) || boost.includes(query);
            if (!searchMatch) return false;

            if (selectedFilter) {
                if (!name.includes(selectedFilter) && !boost.includes(selectedFilter) && !ingredients.includes(selectedFilter)) {
                    if (selectedFilter === '採集' && !boost.includes('採集') && !boost.includes('速度') && !boost.includes('暴擊')) return false;
                    if (selectedFilter === '戰鬥' && !boost.includes('攻擊') && !boost.includes('傷害') && !boost.includes('暴擊')) return false;
                    if (selectedFilter === '移動速度' && !boost.includes('移動速度')) return false;
                    if (!boost.includes(selectedFilter)) return false;
                }
            }
            return true;
        });

        elements.resultCount.textContent = `找到 ${filteredData.length} 筆食譜`;
        renderCards(filteredData.slice(0, displayedCount), true);
    }

    function renderCards(data, clear) {
        if (clear) elements.grid.innerHTML = '';
        
        data.forEach(recipe => {
            const card = document.createElement('div');
            card.className = 'recipe-card';
            
            const ingredients = (recipe['食材清單'] || '').split('、').filter(i => i)
                .map(i => `<span class="ingredient-tag">${i}</span>`).join('');

            const boostHtml = (recipe['屬性加成'] || '').split('、').filter(b => b)
                .map(b => `<div class="boost-line">${b}</div>`).join('');

            let base64Data = recipe['圖片數據'] || '';
            const b64Match = base64Data.match(/[A-Za-z0-9+/]{20,}/);
            if (b64Match) base64Data = b64Match[0];

            const imgSrc = base64Data ? `data:image/jpeg;base64,${base64Data}` : 'https://placehold.co/160x160/222/f39c12?text=食譜圖片';

            const prof = recipe['熟練度'] || '無';
            const profClass = { '領悟': 'insight', '生疏': 'unfamiliar', '熟練': 'proficient', '掌握': 'master', '無': 'none' }[prof];

            card.innerHTML = `
                ${isAdmin ? `
                <div class="card-admin-btns">
                    <button class="admin-mini-btn edit" onclick="window.editRecipe('${recipe['編號']}')"><i class="fas fa-edit"></i></button>
                    <button class="admin-mini-btn delete" onclick="window.deleteRecipe('${recipe['編號']}')"><i class="fas fa-trash"></i></button>
                </div>
                ` : ''}
                ${isAdmin ? `<div class="proficiency-badge badge-${profClass}">${prof}</div>` : ''}
                <div class="recipe-img-container">
                    <img src="${imgSrc}" alt="${recipe['料理名稱']}" class="recipe-img" loading="lazy" onerror="this.src='https://placehold.co/160x160/222/f39c12?text=圖片損壞'">
                </div>
                <div class="recipe-info">
                    <div class="recipe-card-header">
                        <span class="recipe-name">${recipe['料理名稱']}</span>
                        <span class="recipe-id">#${recipe['編號']}</span>
                    </div>
                    <div class="ingredients-list">${ingredients}</div>
                    ${boostHtml ? `<div class="recipe-boost"><div class="boost-text">${boostHtml}</div></div>` : ''}
                </div>
                <div class="recipe-footer">
                    <span>${recipe['備註'] || ''}</span>
                    <span>${isAdmin ? '' : recipe['熟練度'] || ''}</span>
                </div>
            `;
            elements.grid.appendChild(card);
        });
    }

    // Export functions to window for onclick handlers
    window.editRecipe = (id) => openModal('recipe', id);
    window.deleteRecipe = (id) => deleteRecipe(id);

    function exportCSV() {
        if (recipesData.length === 0) return;
        
        // Define fixed headers to ensure consistency
        const headers = ['編號', '料理名稱', '食材清單', '屬性加成', '備註', '圖片數據', '熟練度'];
        
        const rows = recipesData.map(recipe => {
            return headers.map(header => {
                const val = recipe[header] || '';
                // Escape quotes and wrap in quotes
                return `"${val.replace(/"/g, '""')}"`;
            }).join(',');
        }).join('\n');

        const csvContent = "\uFEFF" + headers.join(',') + '\n' + rows;
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.setAttribute('href', URL.createObjectURL(blob));
        link.setAttribute('download', `明日之後食譜庫備份_${new Date().toISOString().slice(0,10)}.csv`);
        link.click();
    }

    init();
})();
