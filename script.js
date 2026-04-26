document.addEventListener('DOMContentLoaded', async () => {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sidebar-toggle-btn');
    const navItems = document.querySelectorAll('.nav-item');
    const pageTitle = document.getElementById('page-title');
    const contentArea = document.getElementById('content-area');
    const timeDisplay = document.getElementById('current-time');

    // --- Global Data Handle Management (Bug-free version) ---
    const DB_NAME = 'LifeAfter_Market_FS';
    const STORE_NAME = 'handles';
    window.dirHandle = null;

    const openDB = () => new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });

    window.saveHandleToDB = async (handle) => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, 'dir_handle');
        return new Promise((resolve) => tx.oncomplete = resolve);
    };

    window.getHandleFromDB = async () => {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('dir_handle');
        return new Promise((resolve) => req.onsuccess = () => resolve(req.result));
    };

    // Global permission helper
    window.verifyPermission = async (handle) => {
        if (!handle) return false;
        const opts = { mode: 'readwrite' };
        if ((await handle.queryPermission(opts)) === 'granted') return true;
        try {
            // Must be called from user gesture, so this is safe inside click handlers
            return (await handle.requestPermission(opts)) === 'granted';
        } catch (e) { return false; }
    };

    // Load initial handle
    async function initGlobalFS() {
        try {
            const savedHandle = await window.getHandleFromDB();
            if (savedHandle) window.dirHandle = savedHandle;
            // Load Dashboard by default
            loadModule('dashboard');
        } catch (err) { }
    }

    // Sidebar Toggle Logic
    toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        if (window.innerWidth <= 768) sidebar.classList.toggle('active');
    });

    // Navigation Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const target = item.getAttribute('data-target');
            const navText = item.querySelector('.nav-text').textContent;
            pageTitle.textContent = navText;
            loadModule(target);
            if (window.innerWidth <= 768) sidebar.classList.remove('active');
        });
    });

    async function loadModule(moduleName) {
        contentArea.innerHTML = '<div class="loading">載入中...</div>';
        const template = document.getElementById(`${moduleName}-template`);
        if (template) {
            contentArea.innerHTML = template.innerHTML;
            initializeModuleAssets(moduleName);
            return;
        }

        if (moduleName === 'recipes') {
            try {
                const htmlRes = await fetch('modules/recipes.html');
                const html = await htmlRes.text();
                contentArea.innerHTML = html;
                initializeModuleAssets(moduleName);
                return;
            } catch (e) { }
        }

        if (moduleName === 'dashboard') {
            contentArea.innerHTML = `
                <div class="welcome-card">
                    <h2>歡迎使用明日助手</h2>
                    <p>這是一個專為《明日之後》玩家設計的綜合系統。請從左側選單選擇功能。</p>
                    <div class="stats-grid">
                        <div class="stat-item">
                            <span class="stat-value">穩定</span>
                            <span class="stat-label">系統狀態</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${window.dirHandle ? '已連結' : '未連結'}</span>
                            <span class="stat-label">資料夾狀態</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">v2.0.5</span>
                            <span class="stat-label">當前版本</span>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        contentArea.innerHTML = `<div class="module-placeholder"><i class="fas fa-tools"></i><h3>${moduleName} 模組</h3><p>載入中...</p></div>`;
    }

    function initializeModuleAssets(moduleName) {
        const initFuncName = `initialize${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`;
        if (typeof window[initFuncName] === 'function') {
            window[initFuncName]();
            return;
        }

        if (!document.getElementById(`${moduleName}-css`)) {
            const link = document.createElement('link');
            link.id = `${moduleName}-css`;
            link.rel = 'stylesheet';
            link.href = `modules/${moduleName}.css`;
            document.head.appendChild(link);
        }
        
        const scriptId = `${moduleName}-script`;
        const oldScript = document.getElementById(scriptId);
        if (oldScript) oldScript.remove();

        const script = document.createElement('script');
        script.src = moduleName === 'market' || moduleName === 'species' || moduleName === 'profit' ? `${moduleName}.js` : `modules/${moduleName}.js`;
        script.id = scriptId;
        script.onload = () => {
            if (typeof window[initFuncName] === 'function') window[initFuncName]();
        };
        document.body.appendChild(script);
    }

    function updateTime() {
        const now = new Date();
        timeDisplay.textContent = now.toLocaleTimeString('zh-TW', { hour12: false });
    }
    setInterval(updateTime, 1000);
    updateTime();

    await initGlobalFS();
});
