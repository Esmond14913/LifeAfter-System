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
        
        // Check for embedded template first (for local file protocol support)
        const template = document.getElementById(`${moduleName}-template`);
        if (template) {
            contentArea.innerHTML = template.innerHTML;
            initializeModuleAssets(moduleName);
            return;
        }

        // Fallback to fetch if template not found
        if (moduleName === 'recipes') {
            try {
                const htmlRes = await fetch('modules/recipes.html');
                const html = await htmlRes.text();
                contentArea.innerHTML = html;
                initializeModuleAssets(moduleName);
                return;
            } catch (error) {
                console.error('Module load failed:', error);
                contentArea.innerHTML = `
                    <div class="error-container">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>模組載入失敗</h3>
                        <p>偵測到您正以本地檔案模式開啟。請確保 templates 已正確嵌入 index.html。</p>
                    </div>
                `;
                return;
            }
        }
        // ... (rest of the switch case)

        const section = document.createElement('div');
        section.className = 'module-container animate-fade-in';
        
        let content = '';
        switch(moduleName) {
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
                                <span class="stat-value">2026-04-23</span>
                                <span class="stat-label">最近更新</span>
                            </div>
                        </div>
                    </div>
                `;
                break;
            case 'market':
                content = `
                    <div class="module-placeholder">
                        <i class="fas fa-chart-line"></i>
                        <h3>交易市場</h3>
                        <p>模組開發中... 未來將串接或手動紀錄各區物價波動。</p>
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
                content = '<h3>模組載入錯誤</h3>';
        }
        
        section.innerHTML = content;
        contentArea.appendChild(section);
    }

    function initializeModuleAssets(moduleName) {
        // Load CSS
        if (!document.getElementById(`${moduleName}-css`)) {
            const link = document.createElement('link');
            link.id = `${moduleName}-css`;
            link.rel = 'stylesheet';
            link.href = `modules/${moduleName}.css`;
            document.head.appendChild(link);
        }
        
        // Load JS
        const script = document.createElement('script');
        script.src = `modules/${moduleName}.js`;
        script.id = `${moduleName}-script`;
        const oldScript = document.getElementById(`${moduleName}-script`);
        if (oldScript) oldScript.remove();
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
