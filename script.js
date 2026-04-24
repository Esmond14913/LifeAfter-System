document.addEventListener('DOMContentLoaded', () => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');
    const contentArea = document.getElementById('content-area');
    const timeDisplay = document.getElementById('current-time');

    // Sidebar Toggle Logic
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        // On mobile, we might use a different class
        if (window.innerWidth <= 768) {
            sidebar.classList.toggle('active');
        }
    });

    // Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // Update Active State
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            // Update Title
            const target = item.getAttribute('data-target');
            const navText = item.querySelector('.nav-text').textContent;
            pageTitle.textContent = navText;

            // Load Content Placeholder
            loadModule(target);

            // Close sidebar on mobile after selection
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
            }
        });
    });

    // Module Loading Function
    async function loadModule(moduleName) {
        contentArea.innerHTML = '<div class="loading">載入中...</div>';
        
        // 1. Try embedded template (Primary)
        const template = document.getElementById(`${moduleName}-template`);
        if (template) {
            contentArea.innerHTML = template.innerHTML;
            initializeModuleAssets(moduleName);
            return;
        }

        // 2. Try Fetch (Fallback for recipes)
        if (moduleName === 'recipes') {
            try {
                const htmlRes = await fetch('modules/recipes.html');
                const html = await htmlRes.text();
                contentArea.innerHTML = html;
                initializeModuleAssets(moduleName);
                return;
            } catch (e) { console.warn('Fetch failed, check templates'); }
        }

        // 3. Last Resort: Switch Case / Error
        const section = document.createElement('div');
        section.className = 'module-container animate-fade-in';
        let content = '';

        switch(moduleName) {
            case 'market':
                // This shouldn't happen if template exists, but as a backup:
                content = '<div class="error-container"><h3>請重新整理頁面</h3><p>交易市場模板未正確載入。</p></div>';
                break;
            case 'dashboard':
                content = `
                    <div class="welcome-card">
                        <h2>歡迎使用明日助手</h2>
                        <p>這是一個專為《明日之後》玩家設計的綜合系統。請從左側選單選擇功能。</p>
                        <div class="stats-grid">
                            <div class="stat-item">
                                <span class="stat-value">N/A</span>
                                <span class="stat-label">今日推薦食譜</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">穩定</span>
                                <span class="stat-label">市場波動指數</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-value">v1.2.0</span>
                                <span class="stat-label">當前版本</span>
                            </div>
                        </div>
                    </div>
                `;
                break;
            case 'costs':
                content = `
                    <div class="module-placeholder">
                        <i class="fas fa-hammer"></i>
                        <h3>製作成本</h3>
                        <p>模組開發中... 自動計算半成品與成品的材料成本與利潤。</p>
                    </div>
                `;
                break;
            case 'tools':
                content = `
                    <div class="module-placeholder">
                        <i class="fas fa-tools"></i>
                        <h3>小工具</h3>
                        <p>模組開發中... 包含專精點計算、採集效率估算等工具。</p>
                    </div>
                `;
                break;
            default:
                content = '<div class="error-container"><h3>模組路徑錯誤</h3><p>找不到指定的系統功能。</p></div>';
        }
        
        section.innerHTML = content;
        contentArea.appendChild(section);
    }

    function initializeModuleAssets(moduleName) {
        const initFuncName = `initialize${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`;
        
        // 1. If the function already exists (static load), call it immediately
        if (typeof window[initFuncName] === 'function') {
            console.log(`Module ${moduleName} already loaded, initializing directly.`);
            window[initFuncName]();
            return;
        }

        // 2. Load CSS
        if (!document.getElementById(`${moduleName}-css`)) {
            const link = document.createElement('link');
            link.id = `${moduleName}-css`;
            link.rel = 'stylesheet';
            link.href = `modules/${moduleName}.css`;
            document.head.appendChild(link);
        }
        
        // 3. Dynamic JS Loading (Fallback)
        const scriptId = `${moduleName}-script`;
        const oldScript = document.getElementById(scriptId);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.src = moduleName === 'market' ? `${moduleName}.js` : `modules/${moduleName}.js`;
        script.id = scriptId;
        
        script.onload = () => {
            if (typeof window[initFuncName] === 'function') {
                console.log(`Dynamic load complete, initializing: ${moduleName}`);
                window[initFuncName]();
            }
        };
        
        document.body.appendChild(script);
    }

    // Real-time Clock
    function updateTime() {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('zh-TW', { hour12: false });
    }
    
    setInterval(updateTime, 1000);
    updateTime();

    // Add CSS for placeholders dynamically if needed
    const style = document.createElement('style');
    style.textContent = `
        .module-placeholder {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 300px;
            background: var(--card-bg);
            border-radius: 12px;
            border: 1px dashed var(--border-color);
            color: var(--text-secondary);
        }
        .module-placeholder i {
            font-size: 4rem;
            margin-bottom: 20px;
            color: var(--accent-orange);
            opacity: 0.5;
        }
        .module-placeholder h3 {
            font-size: 1.5rem;
            margin-bottom: 10px;
            color: var(--text-primary);
        }
    `;
    document.head.appendChild(style);
});
