(function() {
    let recipesData = [];
    let filteredData = [];
    let displayedCount = 20;
    const increment = 20;

    const elements = {
        search: document.getElementById('recipe-search'),
        attrFilter: document.getElementById('attr-filter'),
        grid: document.getElementById('recipe-grid'),
        resultCount: document.getElementById('result-count'),
        backupBtn: document.getElementById('backup-csv'),
        loadingTrigger: document.getElementById('loading-trigger')
    };

    // Initialize Module
    async function init() {
        await loadCSV();
        setupEventListeners();
        setupInfiniteScroll();
        applyFilters();
    }

    async function loadCSV() {
        try {
            const response = await fetch('../data/recipes.csv');
            if (!response.ok) throw new Error('Fetch failed');
            const text = await response.text();
            parseCSV(text);
        } catch (error) {
            console.warn('CSV fetch failed (likely local file protocol). Using sample data.');
            // Fallback sample data
            const sampleCSV = `編號,料理名稱,食材清單,屬性加成,備註,圖片數據,熟練度
1,果醬 (範例),水果,,本地模式預覽,,無
2,牛奶糖 (範例),蜂蜜、牛奶,移動速度提升+5%,本地模式預覽,,無
3,葡式蛋塔 (範例),麵粉、蜂蜜、牛奶,挖掘暴擊率+10%,本地模式預覽,,無`;
            parseCSV(sampleCSV);
            
            // Show a tip to the user
            const tip = document.createElement('div');
            tip.className = 'local-tip';
            tip.innerHTML = '<i class="fas fa-info-circle"></i> 目前為離線預覽模式。若要載入完整資料，建議使用本地伺服器或點擊備份匯入。';
            elements.grid.before(tip);
        }
    }

    function parseCSV(text) {
        // More robust CSV parsing to handle quoted fields and line breaks inside quotes
        const rows = [];
        let currentRow = [];
        let currentField = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"' && inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                currentRow.push(currentField.trim());
                currentField = '';
            } else if ((char === '\r' || char === '\n') && !inQuotes) {
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField.trim());
                    rows.push(currentRow);
                    currentField = '';
                    currentRow = [];
                }
                if (char === '\r' && nextChar === '\n') i++;
            } else {
                currentField += char;
            }
        }
        if (currentField || currentRow.length > 0) {
            currentRow.push(currentField.trim());
            rows.push(currentRow);
        }

        const headers = rows[0];
        recipesData = rows.slice(1).map(row => {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] || '';
                // Clean up leading/trailing quotes that might have escaped the parser
                val = val.replace(/^"|"$/g, '');
                obj[header.trim()] = val;
            });
            return obj;
        });
        
        console.log('Parsed recipes:', recipesData.length);
    }

    function setupEventListeners() {
        elements.search.addEventListener('input', () => { resetAndFilter(); });
        elements.attrFilter.addEventListener('change', () => { resetAndFilter(); });
        elements.backupBtn.addEventListener('click', exportCSV);

        // Import logic
        const importBtn = document.getElementById('import-csv-btn');
        const fileInput = document.getElementById('csv-file-input');
        
        if (importBtn && fileInput) {
            importBtn.addEventListener('click', () => fileInput.click());
            fileInput.addEventListener('change', handleImport);
        }
    }

    function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(e) {
            const text = e.target.result;
            // Clean up Tip if it exists
            const tip = document.querySelector('.local-tip');
            if (tip) tip.remove();
            
            parseCSV(text);
            resetAndFilter();
            alert(`成功匯入 ${recipesData.length} 筆食譜資料！`);
        };
        reader.readAsText(file);
    }

    function resetAndFilter() {
        displayedCount = increment;
        applyFilters();
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

    function applyFilters() {
        const query = elements.search.value.toLowerCase();
        const selectedFilter = elements.attrFilter.value;

        filteredData = recipesData.filter(recipe => {
            const name = (recipe['料理名稱'] || '').toLowerCase();
            const ingredients = (recipe['食材清單'] || '').toLowerCase();
            const boost = (recipe['屬性加成'] || '').toLowerCase();
            
            // Search Match
            const searchMatch = name.includes(query) || ingredients.includes(query) || boost.includes(query);
            if (!searchMatch) return false;

            // Category/Attribute Match
            if (selectedFilter) {
                if (!name.includes(selectedFilter) && !boost.includes(selectedFilter) && !ingredients.includes(selectedFilter)) {
                    // Specific logic for common tags
                    if (selectedFilter === '採集' && !boost.includes('採集') && !boost.includes('速度') && !boost.includes('暴擊')) return false;
                    if (selectedFilter === '戰鬥' && !boost.includes('攻擊') && !boost.includes('傷害') && !boost.includes('暴擊')) return false;
                    if (selectedFilter === '移動速度' && !boost.includes('移動速度')) return false;
                    
                    // If not caught by special tags, just check if the string exists
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
            
            const ingredients = (recipe['食材清單'] || '').split('、')
                .filter(i => i)
                .map(i => `<span class="ingredient-tag">${i}</span>`)
                .join('');

            // Clean Base64 data: remove any non-base64 leading characters (like BOM or artifacts)
            let base64Data = recipe['圖片數據'] || '';
            // If it starts with anything other than valid base64 chars, try to find the start
            // Base64 often starts with /9j/ (JPEG) or iVBOR (PNG)
            const b64Match = base64Data.match(/[A-Za-z0-9+/]{20,}/);
            if (b64Match) {
                base64Data = b64Match[0];
            }

            const boostHtml = (recipe['屬性加成'] || '').split('、')
                .filter(b => b)
                .map(b => `<div class="boost-line">${b}</div>`)
                .join('');

            const imgSrc = base64Data ? `data:image/jpeg;base64,${base64Data}` : 'https://placehold.co/160x160/222/f39c12?text=食譜圖片';

            card.innerHTML = `
                <div class="recipe-img-container">
                    <img src="${imgSrc}" alt="${recipe['料理名稱']}" class="recipe-img" loading="lazy" 
                         onerror="this.src='https://placehold.co/160x160/222/f39c12?text=圖片損壞'">
                </div>
                <div class="recipe-info">
                    <div class="recipe-card-header">
                        <span class="recipe-name">${recipe['料理名稱']}</span>
                        <span class="recipe-id">#${recipe['編號']}</span>
                    </div>
                    <div class="ingredients-list">
                        ${ingredients}
                    </div>
                    ${boostHtml ? `
                    <div class="recipe-boost">
                        <div class="boost-text">${boostHtml}</div>
                    </div>
                    ` : ''}
                </div>
                <div class="recipe-footer">
                    <span>${recipe['備註'] || ''}</span>
                    <span>${recipe['熟練度'] || ''}</span>
                </div>
            `;
            elements.grid.appendChild(card);
        });
    }

    function exportCSV() {
        // Implementation of CSV export
        const headers = Object.keys(recipesData[0]).join(',');
        const rows = recipesData.map(recipe => Object.values(recipe).map(v => `"${v}"`).join(',')).join('\n');
        const csvContent = "\uFEFF" + headers + '\n' + rows; // Add BOM for Excel Chinese support
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `lifeafter_recipes_backup_${new Date().toISOString().slice(0,10)}.csv`);
        link.click();
    }

    init();
})();
