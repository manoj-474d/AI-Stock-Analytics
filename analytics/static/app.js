// app.js

// Seed-based random number generator for reproducible stock charts
function createSeededRandom(seedString) {
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
        hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
    }
    return function() {
        let x = Math.sin(hash++) * 10000;
        return x - Math.floor(x);
    };
}

// Generate Standard Normal variables (Box-Muller transform)
function boxMuller(randomFn) {
    let u = 0, v = 0;
    while(u === 0) u = randomFn(); 
    while(v === 0) v = randomFn();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Database of popular stocks and their parameters for simulation and offline fallback
const STOCK_DEFAULTS = {
    'AAPL': { name: 'Apple Inc.', basePrice: 175.0, drift: 0.0004, volatility: 0.015, currency: 'USD' },
    'MSFT': { name: 'Microsoft Corp.', basePrice: 410.0, drift: 0.0005, volatility: 0.014, currency: 'USD' },
    'GOOGL': { name: 'Alphabet Inc.', basePrice: 165.0, drift: 0.00035, volatility: 0.016, currency: 'USD' },
    'AMZN': { name: 'Amazon.com Inc.', basePrice: 180.0, drift: 0.00045, volatility: 0.018, currency: 'USD' },
    'TSLA': { name: 'Tesla Inc.', basePrice: 190.0, drift: 0.0002, volatility: 0.028, currency: 'USD' },
    'META': { name: 'Meta Platforms', basePrice: 480.0, drift: 0.0006, volatility: 0.022, currency: 'USD' },
    'NVDA': { name: 'NVIDIA Corp.', basePrice: 120.0, drift: 0.0018, volatility: 0.032, currency: 'USD' },
    'RELIANCE.NS': { name: 'Reliance Industries', basePrice: 2450.0, drift: 0.0004, volatility: 0.012, currency: 'INR' },
    'RELIANCE': { name: 'Reliance Industries', basePrice: 2450.0, drift: 0.0004, volatility: 0.012, currency: 'INR' },
    'TCS.NS': { name: 'TCS Ltd.', basePrice: 3850.0, drift: 0.0003, volatility: 0.011, currency: 'INR' },
    'TCS': { name: 'TCS Ltd.', basePrice: 3850.0, drift: 0.0003, volatility: 0.011, currency: 'INR' },
    'INFY.NS': { name: 'Infosys Ltd.', basePrice: 1420.0, drift: 0.00025, volatility: 0.013, currency: 'INR' },
    'INFY': { name: 'Infosys Ltd.', basePrice: 1420.0, drift: 0.00025, volatility: 0.013, currency: 'INR' },
    'HDFCBANK.NS': { name: 'HDFC Bank Ltd.', basePrice: 1510.0, drift: 0.0002, volatility: 0.012, currency: 'INR' },
    'SBIN.NS': { name: 'State Bank of India', basePrice: 780.0, drift: 0.00035, volatility: 0.015, currency: 'INR' },
    'TATASTEEL.NS': { name: 'Tata Steel Ltd.', basePrice: 145.0, drift: 0.0003, volatility: 0.018, currency: 'INR' },
    'BHARTIARTL.NS': { name: 'Bharti Airtel', basePrice: 1350.0, drift: 0.0005, volatility: 0.014, currency: 'INR' },
    'NOK': { name: 'Nokia Corp.', basePrice: 3.50, drift: -0.00005, volatility: 0.020, currency: 'USD' }
};

const USD_INR_RATE = 86.5;

function generateStockData(ticker, days = 180) {
    const cleanTicker = ticker ? ticker.toUpperCase() : 'AAPL';
    const config = STOCK_DEFAULTS[cleanTicker] || { 
        name: cleanTicker, 
        basePrice: 150.0, 
        drift: 0.0002, 
        volatility: 0.018, 
        currency: cleanTicker.endsWith('.NS') || cleanTicker.endsWith('.BO') ? 'INR' : 'USD' 
    };
    const rand = createSeededRandom(cleanTicker);
    let prices = [];
    let currentPrice = config.basePrice;
    let currentDate = new Date();
    currentDate.setDate(currentDate.getDate() - days);
    
    for (let i = 0; i < days; i++) {
        let dateStr = currentDate.toISOString().split('T')[0];
        let z = boxMuller(rand);
        let returnPct = (config.drift - (config.volatility ** 2) / 2) + config.volatility * z;
        currentPrice = currentPrice * Math.exp(returnPct);
        if (currentPrice < 0.1) currentPrice = 0.1;
        let finalPrice = currentPrice;
        if (config.currency === 'USD') {
            finalPrice = currentPrice * USD_INR_RATE;
        }
        prices.push({
            date: dateStr,
            close: parseFloat(finalPrice.toFixed(2))
        });
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return prices;
}

// ============================================================
// Live Yahoo Finance Stock Search (autocomplete)
// ============================================================
let searchDebounceTimer = null;
let currentSymbol = 'AAPL';
let currentSymbolName = 'Apple Inc.';

function initStockSearch() {
    const input   = document.getElementById('stockSearchInput');
    const sugBox  = document.getElementById('stockSuggestions');
    const spinner = document.getElementById('stockSearchSpinner');
    const hidden  = document.getElementById('stockSelect');
    const badge   = document.getElementById('selectedStockBadge');
    if (!input) return;

    // Set initial display
    input.value = 'Apple Inc. (AAPL)';
    badge.innerHTML = `<span style="color:var(--accent-primary)">📌 AAPL</span> — Apple Inc.`;

    input.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        const q = input.value.trim();
        if (q.length < 1) { sugBox.style.display = 'none'; return; }

        spinner.style.display = 'inline';
        searchDebounceTimer = setTimeout(async () => {
            try {
                const res  = await fetch(`/search-stocks?q=${encodeURIComponent(q)}`);
                const data = await res.json();
                spinner.style.display = 'none';
                renderSuggestions(data.results || []);
            } catch(e) {
                spinner.style.display = 'none';
                sugBox.style.display = 'none';
            }
        }, 350); // 350ms debounce
    });

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#stockSearchInput') && !e.target.closest('#stockSuggestions')) {
            sugBox.style.display = 'none';
        }
    });

    // Keyboard: Enter triggers analysis on current value
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            sugBox.style.display = 'none';
            runAnalysis();
        }
    });

    function renderSuggestions(results) {
        sugBox.innerHTML = '';
        if (results.length === 0) {
            sugBox.innerHTML = `<div style="padding:0.75rem 1rem; color:var(--text-muted, #6b7280); font-size:0.85rem;">No results found. Try a ticker symbol (e.g. TSLA, INFY.NS)</div>`;
            sugBox.style.display = 'block';
            return;
        }
        results.forEach(r => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:0.65rem 1rem; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.15s;';
            item.innerHTML = `
                <span style="font-weight:600; color:var(--accent-primary, #6366f1); font-size:0.9rem;">${r.symbol}</span>
                <span style="color:var(--text-secondary, #9ca3af); font-size:0.82rem; margin-left:0.5rem;">${r.name}</span>
                <span style="float:right; font-size:0.72rem; color:var(--text-muted, #6b7280); background:rgba(255,255,255,0.07); padding:0.1rem 0.4rem; border-radius:0.25rem;">${r.exchange}</span>
            `;
            item.addEventListener('mouseenter', () => item.style.background = 'rgba(99,102,241,0.12)');
            item.addEventListener('mouseleave', () => item.style.background = '');
            item.addEventListener('click', () => {
                currentSymbol     = r.symbol;
                currentSymbolName = r.name;
                hidden.value      = r.symbol;
                input.value       = `${r.name} (${r.symbol})`;
                badge.innerHTML   = `<span style="color:var(--accent-primary)">📌 ${r.symbol}</span> — ${r.name}`;
                sugBox.style.display = 'none';
                runAnalysis();
            });
            sugBox.appendChild(item);
        });
        sugBox.style.display = 'block';
    }
}


// ----------------------------------------------------
// Client-Side Machine Learning: Linear Regression OLS
// ----------------------------------------------------
function trainAndPredict(prices, forecastOut = 30) {
    // Replicate model.py behavior:
    // X = prices[i], y = prices[i + forecastOut]
    const n = prices.length;
    if (n <= forecastOut * 2) {
        return { error: 'Not enough historical data to forecast.' };
    }
    
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;
    let count = 0;
    
    // Train on historical prices
    for (let i = 0; i < n - forecastOut; i++) {
        let xVal = prices[i];
        let yVal = prices[i + forecastOut];
        
        sumX += xVal;
        sumY += yVal;
        sumXY += xVal * yVal;
        sumXX += xVal * xVal;
        count++;
    }
    
    // Calculate slope (m) and intercept (c)
    const m = (count * sumXY - sumX * sumY) / (count * sumXX - sumX * sumX);
    const c = (sumY - m * sumX) / count;
    
    // Generate predicted future prices for the next 30 days
    // We project using the last forecastOut prices
    let predictions = [];
    for (let i = n - forecastOut; i < n; i++) {
        let currentVal = prices[i];
        let predictedVal = m * currentVal + c;
        predictions.push(parseFloat(predictedVal.toFixed(2)));
    }
    
    return {
        slope: m,
        intercept: c,
        predictions: predictions,
        ultimatePrediction: predictions[predictions.length - 1]
    };
}

// ----------------------------------------------------
// Toast Notification Engine
// ----------------------------------------------------
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast`;
    
    let icon = '✨';
    if (type === 'success') icon = '🟢';
    if (type === 'error') icon = '🔴';
    if (type === 'info') icon = '🔵';
    
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);
    
    // Remove toast after 3.5 seconds
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s reverse forwards';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3500);
}

// ----------------------------------------------------
// Cloud Database Sync Engine (KVdb.io serverless REST)
// ----------------------------------------------------
const KVDB_BASE = 'https://kvdb.io/A9vStockSimDb2026/';

async function cloudGet(key, defaultValue) {
    // 1. Instantly read local cache
    const local = localStorage.getItem('cloud_' + key);
    let result = local ? JSON.parse(local) : defaultValue;
    
    // 2. Attempt remote sync with strict 800ms abort timeout so UI never hangs
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        const res = await fetch(KVDB_BASE + key, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.status === 200) {
            const txt = await res.text();
            const data = JSON.parse(txt);
            localStorage.setItem('cloud_' + key, JSON.stringify(data));
            return data;
        }
    } catch (e) {
        // Silently use local cache
    }
    return result;
}

async function cloudSet(key, value) {
    try {
        const valStr = JSON.stringify(value);
        localStorage.setItem('cloud_' + key, valStr); // Cache locally immediately
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 800);
        await fetch(KVDB_BASE + key, {
            method: 'POST',
            body: valStr,
            signal: controller.signal
        });
        clearTimeout(timeoutId);
    } catch (e) {
        // Cached locally
    }
}

async function getSyncedUsers() {
    const defaultUsers = {
        'admin': { password: 'adminpassword', portfolio: { balance: 1000000, stocks: {} } },
        'demouser': { password: 'password123', portfolio: { balance: 100000, stocks: {} } }
    };
    let users = { ...defaultUsers };
    
    // Read local cache first for instant login
    const local = localStorage.getItem('cloud_users') || localStorage.getItem('users');
    if (local) {
        try {
            Object.assign(users, JSON.parse(local));
        } catch(e) {}
    }
    
    return users;
}

async function saveSyncedUsers(users) {
    try {
        localStorage.setItem('users', JSON.stringify(users));
        localStorage.setItem('cloud_users', JSON.stringify(users));
    } catch(e) {}
    await cloudSet('users', users);
}

// Log browser logins centrally
async function logUserLoginOnline(username) {
    if (username === 'admin') return;
    try {
        const logs = await cloudGet('logs', []);
        
        // Find browser client details
        const ua = navigator.userAgent;
        let browser = "Chrome";
        if (ua.indexOf("Firefox") > -1) browser = "Firefox";
        else if (ua.indexOf("Safari") > -1) browser = "Safari";
        else if (ua.indexOf("Edge") > -1) browser = "Edge";
        else if (ua.indexOf("OPR") > -1) browser = "Opera";
        
        // Generate simulated country / region for other logins
        const locations = [
            "India (Mumbai)", "India (Bangalore)", "United States (California)", 
            "United States (New York)", "United Kingdom (London)", "Germany (Frankfurt)",
            "Singapore", "Australia (Sydney)", "Canada (Toronto)"
        ];
        const randLoc = locations[Math.floor(Math.random() * locations.length)];
        const simulatedIp = `157.44.${Math.floor(Math.random()*250)}.${Math.floor(Math.random()*250)}`;
        
        const newLog = {
            username: username,
            time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            browser: browser,
            location: `${randLoc} [IP: ${simulatedIp}]`
        };
        
        logs.unshift(newLog);
        if (logs.length > 50) logs.pop(); // Cap log size
        await cloudSet('logs', logs);
    } catch (e) {
        console.error("Failed to log activity to online dashboard", e);
    }
}

// ============================================================
// UI Flow & Session Management
// ============================================================
let chartInstance = null;
let portfolio = {
    balance: 100000,
    stocks: {}
};


// Initialize app when DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Check if client is accessing via a shared link
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTicker = urlParams.get('ticker') || urlParams.get('stock');
    const isShared = urlParams.get('share') === '1' || urlParams.get('client') === '1' || !!sharedTicker;
    
    const cachedUser = localStorage.getItem('currentUser');

    if (isShared) {
        // Direct Client Guest session without login hurdle
        const clientUser = cachedUser ? JSON.parse(cachedUser) : { username: 'Client Guest', isClient: true };
        if (sharedTicker) {
            currentSymbol = sharedTicker.toUpperCase();
            currentSymbolName = (STOCK_DEFAULTS[currentSymbol] && STOCK_DEFAULTS[currentSymbol].name) || currentSymbol;
            const hidden = document.getElementById('stockSelect');
            if (hidden) hidden.value = currentSymbol;
            const input = document.getElementById('stockSearchInput');
            if (input) input.value = `${currentSymbolName} (${currentSymbol})`;
        }
        logVisitToServer(clientUser.username);
        showDashboard(clientUser);
        showToast(`Viewing client analysis for ${currentSymbol}`, 'info');
    } else if (cachedUser) {
        logVisitToServer(JSON.parse(cachedUser).username);
        showDashboard(JSON.parse(cachedUser));
    } else {
        logVisitToServer('Guest');
        showLoginPage();
    }
    
    // Wire up events
    setupAuthListeners();
    setupAdminListeners();
});

// Log visit to Flask server (real IP, browser, OS recorded server-side)
function logVisitToServer(username) {
    fetch('/log-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ page: window.location.pathname, username: username })
    }).catch(() => {}); // Silent fail — never break the UI
}

function showLoginPage() {
    document.getElementById('authPage').style.display = 'flex';
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'none';
}

function showDashboard(user) {
    document.getElementById('authPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'flex';
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('userInitial').innerText = user.username.charAt(0).toUpperCase();
    document.getElementById('userDisplayName').innerText = user.username;
    
    // Toggle Admin Panel button inside navbar
    const adminBtn = document.getElementById('btnGoAdmin');
    if (user.username === 'admin') {
        adminBtn.style.display = 'inline-flex';
    } else {
        adminBtn.style.display = 'none';
    }
    
    // Load simulation portfolio
    loadPortfolioData(user.username);
    
    // Initialize live stock search autocomplete
    initStockSearch();
    
    // Load real market watchlist from Yahoo Finance backend
    buildWatchlistTable();
    
    // Run initial analysis after a short delay so DOM is fully settled
    setTimeout(() => runAnalysis(), 800);
    
    // Build live ticker strip in the nav bar
    buildLiveTickerStrip();
    
    showToast(`Welcome back, ${user.username}!`, 'success');
}

function setupAuthListeners() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    
    document.getElementById('toRegister').addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    });
    
    document.getElementById('toLogin').addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
    
    // Handle registration
    document.getElementById('btnDoRegister').addEventListener('click', async () => {
        const user = document.getElementById('regUser').value.trim();
        const pass = document.getElementById('regPass').value.trim();
        const errDiv = document.getElementById('regError');
        
        errDiv.innerText = '';
        
        if (user.length < 3) {
            errDiv.innerText = 'Username must be at least 3 characters.';
            return;
        }
        if (pass.length < 5) {
            errDiv.innerText = 'Password must be at least 5 characters.';
            return;
        }
        
        // Disable button while syncing
        const btn = document.getElementById('btnDoRegister');
        btn.disabled = true;
        btn.innerText = 'Syncing cloud databases...';
        
        // Sync users
        let users = await getSyncedUsers();
        if (users[user]) {
            errDiv.innerText = 'Username already registered.';
            btn.disabled = false;
            btn.innerText = 'Create Account';
            return;
        }
        
        // Save user
        users[user] = { password: pass, portfolio: { balance: 100000, stocks: {} } };
        await saveSyncedUsers(users);
        
        btn.disabled = false;
        btn.innerText = 'Create Account';
        
        showToast('Registration successful! Please login.', 'success');
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
    });
    
    // Handle login
    const doLogin = async () => {
        const userEl = document.getElementById('loginUser');
        const passEl = document.getElementById('loginPass');
        const user = userEl ? userEl.value.trim() : '';
        const pass = passEl ? passEl.value.trim() : '';
        const errDiv = document.getElementById('loginError');
        
        if (errDiv) errDiv.innerText = '';
        
        const btn = document.getElementById('btnDoLogin');
        const btnText = btn ? btn.querySelector('.btn-text') : null;
        if (btn) {
            btn.disabled = true;
            if (btnText) btnText.innerText = 'Authenticating...';
            else btn.innerText = 'Authenticating...';
        }
        
        let users = await getSyncedUsers();
        if (!users[user] || users[user].password !== pass) {
            if (errDiv) errDiv.innerText = 'Invalid username or password.';
            if (btn) {
                btn.disabled = false;
                if (btnText) btnText.innerText = 'Access Dashboard';
                else btn.innerHTML = '<span class="btn-text">Access Dashboard</span><span class="btn-arrow">&#8594;</span>';
            }
            return;
        }
        
        // Log in session
        const sessionUser = { username: user };
        localStorage.setItem('currentUser', JSON.stringify(sessionUser));
        
        // Log this login visit with username
        logVisitToServer(user);
        
        if (btn) {
            btn.disabled = false;
            if (btnText) btnText.innerText = 'Access Dashboard';
            else btn.innerHTML = '<span class="btn-text">Access Dashboard</span><span class="btn-arrow">&#8594;</span>';
        }
        
        showDashboard(sessionUser);
    };

    document.getElementById('btnDoLogin').addEventListener('click', doLogin);

    // Keyboard Enter submission on auth forms
    const onEnterLogin = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            doLogin();
        }
    };
    document.getElementById('loginUser')?.addEventListener('keydown', onEnterLogin);
    document.getElementById('loginPass')?.addEventListener('keydown', onEnterLogin);

    const onEnterReg = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('btnDoRegister')?.click();
        }
    };
    document.getElementById('regUser')?.addEventListener('keydown', onEnterReg);
    document.getElementById('regPass')?.addEventListener('keydown', onEnterReg);
    
    // Handle logout
    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        showLoginPage();
        showToast('Logged out successfully.', 'info');
    });
}

// ----------------------------------------------------
// Admin panel logic & operations
// ----------------------------------------------------
window.showAdminPage = function() {
    document.getElementById('dashboardPage').style.display = 'none';
    document.getElementById('adminPage').style.display = 'flex';
    syncAdminData();
};

window.exitAdminPage = function() {
    document.getElementById('adminPage').style.display = 'none';
    document.getElementById('dashboardPage').style.display = 'flex';
    runAnalysis(); // Re-draw chart when going back
};

window.syncAdminData = async function() {
    showToast('Loading visitor data from server...', 'info');

    // --- Registered users stat (from localStorage) ---
    const users = await getSyncedUsers();
    let totalUsers = 0;
    for (let u in users) { if (u !== 'admin') totalUsers++; }
    document.getElementById('adminTotalUsers').innerText = totalUsers;

    // --- Real visits from Flask backend ---
    let visits = [];
    try {
        const res = await fetch('/get-visits');
        const json = await res.json();
        visits = json.visits || [];
    } catch(e) {
        showToast('Could not fetch visitor data from server.', 'error');
    }

    document.getElementById('adminTotalLogins').innerText = visits.length;

    // Unique IPs count
    const uniqueIPs = new Set(visits.map(v => v.ip)).size;
    document.getElementById('adminTotalCapital').innerText = uniqueIPs;

    // --- Visitor log table ---
    const logsTableBody = document.getElementById('adminLogsTableBody');
    logsTableBody.innerHTML = '';

    if (visits.length === 0) {
        logsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-muted);">No visitors recorded yet</td></tr>`;
    } else {
        visits.forEach(v => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong style="color: var(--accent-secondary);">${v.username || 'Guest'}</strong></td>
                <td style="font-family:monospace; color: var(--accent-primary); font-size:0.85rem;">${v.ip}</td>
                <td style="font-size: 0.8rem; color: var(--text-secondary);">${v.time}</td>
                <td><span class="admin-badge browser">${v.browser} / ${v.platform}</span></td>
                <td><span class="admin-badge location">${v.page}</span></td>
            `;
            logsTableBody.appendChild(row);
        });
    }

    showToast('Visitor data loaded!', 'success');
};

function setupAdminListeners() {
    // Admin logout button
    document.getElementById('btnAdminLogout').addEventListener('click', () => {
        localStorage.removeItem('currentUser');
        showLoginPage();
        showToast('Logged out successfully.', 'info');
    });
    
    // Admin clear logs button — clears real server-side visits
    document.getElementById('btnClearLogsBtn').addEventListener('click', async () => {
        if (confirm('Are you sure you want to permanently delete all visitor logs?')) {
            try {
                await fetch('/clear-visits', { method: 'POST' });
                syncAdminData();
                showToast('Visitor logs cleared!', 'success');
            } catch(e) {
                showToast('Failed to clear logs.', 'error');
            }
        }
    });
}


// ----------------------------------------------------
// Portfolio & Simulation Management
// ----------------------------------------------------
function loadPortfolioData(username) {
    let users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[username]) {
        if (!users[username].portfolio) {
            users[username].portfolio = { balance: 100000, stocks: {} };
        }
        portfolio = users[username].portfolio;
    }
    updatePortfolioUI();
}

function savePortfolioData() {
    const cachedUser = localStorage.getItem('currentUser');
    if (!cachedUser) return;
    const username = JSON.parse(cachedUser).username;
    
    let users = JSON.parse(localStorage.getItem('users') || '{}');
    if (users[username]) {
        users[username].portfolio = portfolio;
        localStorage.setItem('users', JSON.stringify(users));
    }
    updatePortfolioUI();
}

function updatePortfolioUI() {
    // These elements were removed from the UI — guard against missing DOM nodes
    const balEl = document.getElementById('portfolioBalance');
    const nwEl  = document.getElementById('portfolioNetWorth');
    if (balEl) balEl.innerText = `₹${portfolio.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (nwEl)  nwEl.innerText  = `₹${portfolio.balance.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setupSimulatorListeners() {
    // Guard: simulator elements removed from UI — skip if not present
    if (!document.getElementById('btnBuyStock')) return;

    document.getElementById('btnBuyStock').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('simQty').value);
        if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid quantity.', 'error'); return; }
        let data = generateStockData(currentSymbol, 2);
        let currentPrice = data[data.length - 1].close;
        let totalCost = currentPrice * qty;
        if (portfolio.balance < totalCost) { showToast('Insufficient funds in wallet.', 'error'); return; }
        portfolio.balance -= totalCost;
        portfolio.stocks[currentSymbol] = (portfolio.stocks[currentSymbol] || 0) + qty;
        savePortfolioData();
        showToast(`Bought ${qty} shares of ${currentSymbol}!`, 'success');
    });

    document.getElementById('btnSellStock').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('simQty').value);
        if (isNaN(qty) || qty <= 0) { showToast('Please enter a valid quantity.', 'error'); return; }
        let ownedShares = portfolio.stocks[currentSymbol] || 0;
        if (ownedShares < qty) { showToast('Not enough shares.', 'error'); return; }
        let data = generateStockData(currentSymbol, 2);
        let totalRefund = data[data.length - 1].close * qty;
        portfolio.balance += totalRefund;
        portfolio.stocks[currentSymbol] = ownedShares - qty;
        if (portfolio.stocks[currentSymbol] === 0) delete portfolio.stocks[currentSymbol];
        savePortfolioData();
        showToast(`Sold ${qty} shares of ${currentSymbol}!`, 'success');
    });
}

// ----------------------------------------------------
// Prediction Dashboard Engine
// ----------------------------------------------------
window.changeTicker = function(symbol, name) {
    currentSymbol     = symbol;
    currentSymbolName = name || symbol;
    // Update the search input and badge to reflect the clicked ticker
    const input = document.getElementById('stockSearchInput');
    const badge = document.getElementById('selectedStockBadge');
    const hidden = document.getElementById('stockSelect');
    if (input) input.value = `${currentSymbolName} (${symbol})`;
    if (badge) badge.innerHTML = `<span style="color:var(--accent-primary)">📌 ${symbol}</span> — ${currentSymbolName}`;
    if (hidden) hidden.value = symbol;
    runAnalysis();
};

window.runAnalysis = async function() {
    const pulseLoader    = document.getElementById('pulseLoader');
    const forecastResults = document.getElementById('forecastResults');
    
    if (pulseLoader) pulseLoader.style.display = 'flex';
    if (forecastResults) forecastResults.style.opacity = '0.3';
    
    const stockSelectEl = document.getElementById('stockSelect');
    const symbol   = (stockSelectEl ? stockSelectEl.value : '') || currentSymbol || 'AAPL';
    currentSymbol  = symbol;
    const dateSelectEl = document.getElementById('dateSelect');
    const daysBack = parseInt(dateSelectEl ? dateSelectEl.value : '180') || 180;
    
    const fetchDays = Math.max(daysBack, 365);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - fetchDays);
    const startDateStr = startDate.toISOString().split('T')[0];
    
    let data = null;
    let isLive = false;
    
    try {
        const res = await fetch('/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: symbol, start_date: startDateStr })
        });
        if (res.ok) {
            const json = await res.json();
            if (!json.error && json.historical && json.historical.prices) {
                data = json;
                isLive = true;
            }
        }
    } catch(netErr) {
        console.warn('Backend unavailable, using client simulation fallback', netErr);
    }
    
    if (!data) {
        // Fallback to client-side simulation
        const historyData = generateStockData(symbol, fetchDays);
        const prices = historyData.map(h => h.close);
        const dates  = historyData.map(h => h.date);
        const ml = trainAndPredict(prices, 30);
        const cur = prices[prices.length - 1];
        const pred = ml.ultimatePrediction || (cur * 1.025);
        const fcast = ml.predictions || Array(30).fill(cur);
        data = {
            historical: { dates: dates, prices: prices },
            forecast: fcast,
            current_price: cur,
            predicted_price: pred,
            ticker: symbol
        };
    }
    
    if (pulseLoader) pulseLoader.style.display = 'none';
    if (forecastResults) forecastResults.style.opacity = '1';
    
    let prices = data.historical.prices;
    let dates  = data.historical.dates;
    const fullPrices = prices;
    if (prices.length > daysBack) {
        prices = prices.slice(prices.length - daysBack);
        dates  = dates.slice(dates.length  - daysBack);
    }
    const forecast     = data.forecast || [];
    const currentPrice = data.current_price;
    const predPrice    = data.predicted_price;
    
    const diff = predPrice - currentPrice;
    const pct  = ((diff / currentPrice) * 100).toFixed(2);
    const isUp = diff >= 0;
    
    let signal = 'HOLD';
    if (pct > 2.0)       signal = 'BUY';
    else if (pct < -2.0) signal = 'SELL';
    
    let badgeHTML = '';
    if (signal === 'BUY')  badgeHTML = '<span class="badge-pill buy">BUY</span>';
    if (signal === 'SELL') badgeHTML = '<span class="badge-pill sell">SELL</span>';
    if (signal === 'HOLD') badgeHTML = '<span class="badge-pill hold">HOLD</span>';
    
    const absPct = Math.abs(parseFloat(pct));
    let confidence, confLabel;
    if (absPct > 15)     { confidence = 'Very High'; confLabel = 'strong trend signal'; }
    else if (absPct > 8) { confidence = 'High';      confLabel = 'clear trend direction'; }
    else if (absPct > 4) { confidence = 'Moderate';  confLabel = 'moderate trend detected'; }
    else if (absPct > 2) { confidence = 'Low-Mod';   confLabel = 'weak trend present'; }
    else                 { confidence = 'Low';        confLabel = 'sideways / uncertain'; }
    
    const cardPriceToday = document.getElementById('cardPriceToday');
    if (cardPriceToday) cardPriceToday.innerText = `₹${currentPrice.toFixed(2)}`;
    
    const cardPriceForecast = document.getElementById('cardPriceForecast');
    if (cardPriceForecast) cardPriceForecast.innerText = `₹${predPrice.toFixed(2)}`;
    
    const cardChangePrice = document.getElementById('cardChangePrice');
    if (cardChangePrice) cardChangePrice.innerText = `${isUp ? '+' : ''}₹${diff.toFixed(2)}`;
    
    const changeIndicator = document.getElementById('cardChangePercent');
    if (changeIndicator) {
        changeIndicator.className = `trend-indicator ${isUp ? 'up' : 'down'}`;
        changeIndicator.innerHTML = `${isUp ? '▲' : '▼'} ${Math.abs(pct)}%`;
    }
    
    const cardRec = document.getElementById('cardRecommendation');
    if (cardRec) cardRec.innerHTML = badgeHTML;
    
    const cardSignal = document.getElementById('cardSignalVal');
    if (cardSignal) {
        cardSignal.innerText = signal === 'BUY' ? '📈 BUY' : signal === 'SELL' ? '📉 SELL' : '⏸ HOLD';
        cardSignal.style.color = signal === 'BUY' ? 'var(--success)' : signal === 'SELL' ? 'var(--danger)' : 'var(--warning)';
    }
    const cardConf = document.getElementById('cardConfidence');
    if (cardConf) cardConf.innerText = confidence;
    const cardConfLabel = document.getElementById('cardConfidenceLabel');
    if (cardConfLabel) cardConfLabel.innerText = confLabel;
    
    const chartLabel = document.getElementById('chartStockLabel');
    if (chartLabel) chartLabel.innerText = `${symbol} — 30-Day Forecast`;
    
    const history = dates.map((d, i) => ({ date: d, close: prices[i] }));
    renderChart(history, forecast);
    
    renderForecastReasons(symbol, currentSymbolName || symbol, fullPrices, currentPrice, predPrice, pct, signal);
    
    if (isLive) {
        showToast(`📡 Live data loaded for ${symbol} from Yahoo Finance`, 'info');
    } else {
        showToast(`📊 Simulation forecast loaded for ${symbol}`, 'info');
    }
};

// ============================================================
// FORECAST REASON ENGINE — "Why Will This Stock Change?"
// Computes statistics from the full historical price array
// and renders the 6 reason cards + AI verdict
// ============================================================
function renderForecastReasons(symbol, name, prices, currentPrice, predPrice, pctChange, signal) {
    const section = document.getElementById('forecastReasonSection');
    if (!section) return;
    section.style.display = 'block';
    
    const n = prices.length;
    const pct = parseFloat(pctChange);
    const isUp = pct >= 0;
    
    // Update header
    const reasonName = document.getElementById('reasonStockName');
    if (reasonName) reasonName.innerText = `${name} (${symbol})`;
    
    // Big signal badge
    const bigBadge = document.getElementById('forecastSignalBig');
    if (bigBadge) {
        bigBadge.className = 'forecast-signal-badge';
        if (signal === 'BUY')  { bigBadge.classList.add('buy-signal');  bigBadge.innerText = '📈 BUY'; }
        if (signal === 'SELL') { bigBadge.classList.add('sell-signal'); bigBadge.innerText = '📉 SELL'; }
        if (signal === 'HOLD') { bigBadge.classList.add('hold-signal'); bigBadge.innerText = '⏸ HOLD'; }
    }
    
    // ─── Compute metrics ───────────────────────────────────
    
    // 1. Overall trend: compare first 20% vs last 20% of prices
    const slice = Math.max(10, Math.floor(n * 0.2));
    const earlyAvg = prices.slice(0, slice).reduce((s,v) => s+v, 0) / slice;
    const recentAvg = prices.slice(-slice).reduce((s,v) => s+v, 0) / slice;
    const trendPct = ((recentAvg - earlyAvg) / earlyAvg) * 100;
    
    // 2. Volatility: standard deviation of daily returns (last 30 days)
    const last30 = prices.slice(-Math.min(30, n));
    const returns = [];
    for (let i = 1; i < last30.length; i++) {
        returns.push((last30[i] - last30[i-1]) / last30[i-1]);
    }
    const meanRet = returns.reduce((s,v) => s+v, 0) / (returns.length || 1);
    const variance = returns.reduce((s,v) => s + (v - meanRet)**2, 0) / (returns.length || 1);
    const volatility = Math.sqrt(variance) * 100; // as %
    
    // 3. 7-day momentum
    const last7 = prices.slice(-Math.min(8, n));
    const mom7pct = last7.length >= 2 ? ((last7[last7.length-1] - last7[0]) / last7[0]) * 100 : 0;
    
    // 4. Linear regression slope on last 30 trading days (per day, as % of current price)
    const slopeWindow = Math.min(30, n);
    const yw = prices.slice(-slopeWindow);
    const xm = (slopeWindow - 1) / 2;
    let num = 0, den = 0;
    for (let i = 0; i < slopeWindow; i++) {
        num += (i - xm) * yw[i];
        den += (i - xm) ** 2;
    }
    const slope = den !== 0 ? num / den : 0; // price per day
    const slopePctPerDay = (slope / currentPrice) * 100;
    
    // 5. Distance from 52-week high
    const yearPrices = prices.slice(-Math.min(252, n));
    const high52 = Math.max(...yearPrices);
    const distFrom52High = ((currentPrice - high52) / high52) * 100; // negative = below high
    
    // 6. Risk: composite of volatility + distance from high
    const riskScore = Math.min(100, Math.max(0, volatility * 15 + Math.abs(distFrom52High) * 0.5));
    
    // ─── Helper: set reason card ───────────────────────────
    function setCard(id, valId, descId, meterId, value, valText, desc, meterPct, cardClass) {
        const card = document.getElementById(id);
        if (!card) return;
        card.className = 'reason-card ' + (cardClass || '');
        const v = document.getElementById(valId);
        const d = document.getElementById(descId);
        const m = document.getElementById(meterId);
        if (v) v.innerText = valText;
        if (d) d.innerText = desc;
        if (m) { m.style.width = '0%'; setTimeout(() => { m.style.width = Math.min(100, Math.abs(meterPct)) + '%'; }, 100); }
    }
    
    // ─── Card 1: Trend Momentum ────────────────────────────
    const trendClass = trendPct > 2 ? 'bullish' : trendPct < -2 ? 'bearish' : 'neutral';
    const trendIcon = document.getElementById('rcTrend')?.querySelector('.reason-card-icon');
    if (trendIcon) trendIcon.innerText = trendPct >= 0 ? '📈' : '📉';
    setCard('rcTrend', 'rcTrendVal', 'rcTrendDesc', 'rcTrendMeter', trendPct,
        `${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(2)}%`,
        trendPct > 5 ? `The stock has been in a strong upward trend over the analysis period (+${trendPct.toFixed(1)}%), which the ML model uses to project continued momentum.`
        : trendPct > 2 ? `A moderate upward trend of ${trendPct.toFixed(1)}% was detected — the model interprets this as mild bullish pressure.`
        : trendPct < -5 ? `A sharp downward trend of ${trendPct.toFixed(1)}% was detected. The model projects continued downward pressure over the next 30 days.`
        : trendPct < -2 ? `A mild downward drift of ${trendPct.toFixed(1)}% signals weak bearish momentum in the historical data.`
        : `Price trend is relatively flat (${trendPct.toFixed(1)}%), meaning no strong directional bias is present in the training data.`,
        Math.abs(trendPct) * 3,
        trendClass
    );
    
    // ─── Card 2: Volatility ────────────────────────────────
    const volClass = volatility < 1 ? 'bullish' : volatility > 3 ? 'bearish' : 'neutral';
    setCard('rcVol', 'rcVolVal', 'rcVolDesc', 'rcVolMeter', volatility,
        `${volatility.toFixed(2)}% / day`,
        volatility < 1 ? `Very low daily volatility (${volatility.toFixed(2)}%) means the stock is stable and the forecast is likely more accurate. Low uncertainty favors predictable price movement.`
        : volatility < 2 ? `Moderate volatility of ${volatility.toFixed(2)}% per day. The stock moves with normal market fluctuation — forecast accuracy is reasonable.`
        : volatility < 3 ? `Above-average volatility (${volatility.toFixed(2)}%). The stock is moving significantly day-to-day, which can amplify forecast uncertainty.`
        : `High volatility of ${volatility.toFixed(2)}% daily. This stock has large price swings — treat the forecast direction as guidance only, as actual prices may deviate widely.`,
        Math.min(100, volatility * 20),
        volClass
    );
    
    // ─── Card 3: 7-Day Momentum ────────────────────────────
    const momClass = mom7pct > 1 ? 'bullish' : mom7pct < -1 ? 'bearish' : 'neutral';
    const momIcon = document.getElementById('rcMom')?.querySelector('.reason-card-icon');
    if (momIcon) momIcon.innerText = mom7pct >= 0 ? '⚡' : '🌊';
    setCard('rcMom', 'rcMomVal', 'rcMomDesc', 'rcMomMeter', mom7pct,
        `${mom7pct >= 0 ? '+' : ''}${mom7pct.toFixed(2)}% (7d)`,
        mom7pct > 5 ? `Strong short-term rally of ${mom7pct.toFixed(2)}% in the last 7 days. If this recent surge continues, the 30-day forecast may even be conservative.`
        : mom7pct > 1 ? `Gentle positive momentum of ${mom7pct.toFixed(2)}% over 7 days. The stock is trending up in the near term, supporting the bullish forecast.`
        : mom7pct < -5 ? `Sharp 7-day drop of ${mom7pct.toFixed(2)}%. Recent selling pressure is a key driver of the bearish forecast — the model has captured this decline.`
        : mom7pct < -1 ? `Mild short-term weakness of ${mom7pct.toFixed(2)}% over the past week. Bearish short-term momentum contributes to the forecast decline.`
        : `Flat short-term performance (${mom7pct.toFixed(2)}% over 7 days). Neither buyers nor sellers are dominant right now — the market is consolidating.`,
        Math.abs(mom7pct) * 8,
        momClass
    );
    
    // ─── Card 4: Regression Slope ─────────────────────────
    const slopeClass = slopePctPerDay > 0.03 ? 'bullish' : slopePctPerDay < -0.03 ? 'bearish' : 'neutral';
    setCard('rcSlope', 'rcSlopeVal', 'rcSlopeDesc', 'rcSlopeMeter', slopePctPerDay,
        `₹${slope.toFixed(2)} / day`,
        slopePctPerDay > 0.1 ? `The linear regression model fitted to the last 30 trading days shows a steep upward slope of ₹${slope.toFixed(2)}/day. This is the primary mathematical driver of the BUY signal.`
        : slopePctPerDay > 0.03 ? `A gentle positive regression slope of ₹${slope.toFixed(2)}/day. The trend line is pointing upward, which anchors the bullish 30-day forecast.`
        : slopePctPerDay < -0.1 ? `The OLS regression slope is strongly negative at ₹${slope.toFixed(2)}/day. The model projects this downward trajectory to persist — this is the core SELL driver.`
        : slopePctPerDay < -0.03 ? `A mild negative slope of ₹${slope.toFixed(2)}/day from the regression model. Slight downward bias in the trend contributes to a bearish forecast.`
        : `Near-zero slope of ₹${slope.toFixed(2)}/day. The regression line is flat — no strong directional force is detected, leading to a HOLD recommendation.`,
        Math.min(100, Math.abs(slopePctPerDay) * 800),
        slopeClass
    );
    
    // ─── Card 5: 52-Week High Distance ───────────────────
    const dist52Class = distFrom52High > -5 ? 'bullish' : distFrom52High < -25 ? 'bearish' : 'neutral';
    const dist52Icon = document.getElementById('rc52')?.querySelector('.reason-card-icon');
    if (dist52Icon) dist52Icon.innerText = distFrom52High > -5 ? '🏔️' : distFrom52High < -25 ? '🕳️' : '📊';
    setCard('rc52', 'rc52Val', 'rc52Desc', 'rc52Meter', distFrom52High,
        `${distFrom52High.toFixed(1)}% from high`,
        distFrom52High > -3 ? `The stock is trading near its 52-week high (₹${high52.toFixed(2)}), just ${Math.abs(distFrom52High).toFixed(1)}% below peak. This indicates strong market confidence and positive momentum.`
        : distFrom52High > -10 ? `Moderately close to its 52-week high of ₹${high52.toFixed(2)}. The stock has partially recovered and may have room to grow further.`
        : distFrom52High > -25 ? `Currently ${Math.abs(distFrom52High).toFixed(1)}% below the 52-week high of ₹${high52.toFixed(2)}. There is meaningful headroom for recovery, but the stock has seen a notable decline.`
        : `The stock has fallen ${Math.abs(distFrom52High).toFixed(1)}% from its 52-week high of ₹${high52.toFixed(2)}. Deep correction territory — either a value opportunity or continued decline depending on other signals.`,
        Math.min(100, 100 + distFrom52High * 2),
        dist52Class
    );
    
    // ─── Card 6: Risk Score ───────────────────────────────
    const riskClass = riskScore < 30 ? 'bullish' : riskScore > 65 ? 'bearish' : 'neutral';
    const riskLabel = riskScore < 20 ? 'Very Low' : riskScore < 40 ? 'Low' : riskScore < 60 ? 'Medium' : riskScore < 80 ? 'High' : 'Very High';
    setCard('rcRisk', 'rcRiskVal', 'rcRiskDesc', 'rcRiskMeter', riskScore,
        `${riskLabel} (${riskScore.toFixed(0)}/100)`,
        riskScore < 20 ? `Risk score of ${riskScore.toFixed(0)}/100 — Very low risk. The stock has been stable with low volatility and is close to its highs. The ML forecast is more reliable in low-risk environments.`
        : riskScore < 40 ? `Moderate-low risk (${riskScore.toFixed(0)}/100). Normal market conditions — the forecast has reasonable reliability. Standard due diligence is advised.`
        : riskScore < 60 ? `Medium risk (${riskScore.toFixed(0)}/100). Elevated daily volatility combined with a pullback from highs increases forecast uncertainty. Treat the direction as likely but magnitude as uncertain.`
        : riskScore < 80 ? `High risk (${riskScore.toFixed(0)}/100). This stock has significant volatility and has dropped considerably from peak. While the model gives a direction, actual outcomes may vary widely.`
        : `Very high risk (${riskScore.toFixed(0)}/100). Extreme volatility and large drawdown detected. This forecast should be treated with extra caution — only suitable for experienced traders.`,
        riskScore,
        riskClass
    );
    
    // ─── AI Verdict Summary ───────────────────────────────
    const verdictEl = document.getElementById('verdictText');
    const verdictIcon = document.getElementById('verdictIcon');
    if (verdictEl) {
        const absChange = Math.abs(predPrice - currentPrice).toFixed(2);
        const absPct = Math.abs(pct).toFixed(2);
        let verdict = '';
        
        if (signal === 'BUY') {
            verdictEl.style.color = 'var(--success)';
            if (verdictIcon) verdictIcon.innerText = '🚀';
            verdict = `The AI model predicts ${name} (${symbol}) will RISE by approximately ₹${absChange} (${absPct}%) over the next 30 days. ` +
                `This bullish forecast is driven by: (1) a ${trendPct > 0 ? 'positive' : 'recovering'} long-term trend of ${trendPct.toFixed(1)}%, ` +
                `(2) a positive regression slope of ₹${slope.toFixed(2)}/day, ` +
                `(3) ${mom7pct >= 0 ? 'positive' : 'recovering'} short-term momentum (7d: ${mom7pct.toFixed(2)}%), ` +
                `and (4) the stock being ${Math.abs(distFrom52High).toFixed(1)}% from its annual high of ₹${high52.toFixed(2)}. ` +
                `Risk level is ${riskLabel.toLowerCase()} (${riskScore.toFixed(0)}/100). ` +
                `Confidence: ${volatility < 2 ? 'higher' : 'moderate'} — daily volatility is ${volatility.toFixed(2)}%.`;
        } else if (signal === 'SELL') {
            verdictEl.style.color = 'var(--danger)';
            if (verdictIcon) verdictIcon.innerText = '📉';
            verdict = `The AI model predicts ${name} (${symbol}) will FALL by approximately ₹${absChange} (${absPct}%) over the next 30 days. ` +
                `This bearish forecast is driven by: (1) a downward trend of ${trendPct.toFixed(1)}% over the analysis window, ` +
                `(2) a negative regression slope of ₹${slope.toFixed(2)}/day indicating sustained selling pressure, ` +
                `(3) short-term weakness (7d momentum: ${mom7pct.toFixed(2)}%), ` +
                `and (4) the stock being ${Math.abs(distFrom52High).toFixed(1)}% below its 52-week high (₹${high52.toFixed(2)}). ` +
                `Risk level is ${riskLabel.toLowerCase()} (${riskScore.toFixed(0)}/100). ` +
                `Exercise caution — daily volatility is ${volatility.toFixed(2)}% which may amplify losses.`;
        } else {
            verdictEl.style.color = 'var(--text-secondary)';
            if (verdictIcon) verdictIcon.innerText = '🤖';
            verdict = `The AI model predicts ${name} (${symbol}) will remain largely FLAT, moving ${pct >= 0 ? '+' : ''}${pct}% to ₹${predPrice.toFixed(2)} over 30 days. ` +
                `The model does not see a strong directional signal: ` +
                `trend change is only ${trendPct.toFixed(1)}%, the regression slope is near-zero at ₹${slope.toFixed(2)}/day, ` +
                `and short-term momentum is ${mom7pct.toFixed(2)}%. ` +
                `The stock is ${Math.abs(distFrom52High).toFixed(1)}% from its 52-week high. ` +
                `Verdict: HOLD — wait for a clearer directional breakout before taking a position. ` +
                `Risk: ${riskLabel} (${riskScore.toFixed(0)}/100), daily volatility: ${volatility.toFixed(2)}%.`;
        }
        verdictEl.innerText = verdict;
    }
}

// ============================================================
// Live Ticker Strip Builder — populates nav ticker from market-overview
// ============================================================
async function buildLiveTickerStrip() {
    const strip = document.getElementById('liveTickerStrip');
    if (!strip) return;
    let stocks = [];
    try {
        const res = await fetch('/market-overview');
        if (res.ok) {
            const data = await res.json();
            stocks = (data.stocks || []).slice(0, 15);
        }
    } catch(e) {}
    
    if (stocks.length === 0) {
        // Fallback simulation stocks
        const fallbackKeys = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'SBIN.NS'];
        stocks = fallbackKeys.map(k => {
            const conf = STOCK_DEFAULTS[k] || { name: k, basePrice: 150 };
            const cur = conf.currency === 'USD' ? conf.basePrice * USD_INR_RATE : conf.basePrice;
            const prev = cur * (1 + (Math.random() * 0.04 - 0.02));
            return {
                ticker: k,
                name: conf.name,
                current_price: cur,
                previous_close: prev
            };
        });
    }
    
    // Build items (duplicated for seamless loop)
    const buildItems = (list) => list.map(s => {
        const diff = s.current_price - s.previous_close;
        const pct = s.previous_close > 0 ? ((diff / s.previous_close) * 100).toFixed(2) : '0.00';
        const isUp = diff >= 0;
        return `<span class="ticker-item" onclick="changeTicker('${s.ticker}', '${(s.name || s.ticker).replace(/'/g, "\\'")}')" style="cursor:pointer;">
            <span class="ticker-sym">${s.ticker.replace('.NS','').replace('.BO','')}</span>
            <span class="${isUp ? 'ticker-up' : 'ticker-down'}">
                ${isUp ? '▲' : '▼'} ₹${s.current_price.toFixed(0)} (${isUp ? '+' : ''}${pct}%)
            </span>
            <span style="color:rgba(255,255,255,0.15); margin:0 0.25rem;">|</span>
        </span>`;
    }).join('');
    
    strip.innerHTML = buildItems(stocks) + buildItems(stocks);
}

// Render logic utilizing Chart.js
function renderChart(history, predictions) {
    const ctx = document.getElementById('predictionChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    // Labels for history
    const labels = history.map(h => h.date);
    
    // Future labels (30 days ahead)
    let lastDate = new Date(labels[labels.length - 1]);
    for (let i = 1; i <= 30; i++) {
        let futureDate = new Date(lastDate);
        futureDate.setDate(lastDate.getDate() + i);
        labels.push(futureDate.toISOString().split('T')[0]);
    }
    
    const historicalPrices = history.map(h => h.close);
    
    // Forecast data array (null values for historical part, links to end of history)
    const forecastPrices = Array(historicalPrices.length - 1).fill(null);
    forecastPrices.push(historicalPrices[historicalPrices.length - 1]);
    forecastPrices.push(...predictions);
    
    // Pad historical prices with nulls for the future forecast labels
    const paddedHistory = [...historicalPrices, ...Array(30).fill(null)];
    
    // Gradient shading
    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.25)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Historical Price',
                    data: paddedHistory,
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.15
                },
                {
                    label: '30-Day AI Forecast',
                    data: forecastPrices,
                    borderColor: '#a855f7',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    fill: false,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    labels: {
                        color: '#9ca3af',
                        font: { family: "'Inter', sans-serif", size: 12 }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    borderColor: 'rgba(255, 255, 255, 0.1)',
                    borderWidth: 1,
                    titleColor: '#f3f4f6',
                    bodyColor: '#9ca3af',
                    titleFont: { weight: 'bold', family: "'Inter', sans-serif" },
                    bodyFont: { family: "'Inter', sans-serif" },
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += '₹' + context.parsed.y.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#6b7280', maxTicksLimit: 10 }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: '#6b7280',
                        callback: function(value) { return '₹' + value; }
                    }
                }
            }
        }
    });
}

// ============================================================
// Market Table Watchlist Builder — fetches LIVE data from backend
// ============================================================
async function buildWatchlistTable() {
    const tableBody = document.getElementById('marketOverviewTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-secondary);">⏳ Loading market data...</td></tr>`;
    
    let stocks = [];
    try {
        const res  = await fetch('/market-overview');
        if (res.ok) {
            const data = await res.json();
            stocks = data.stocks || [];
        }
    } catch(e) {}
    
    if (stocks.length === 0) {
        // Fallback simulation stocks so table is never empty
        const fallbackKeys = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'RELIANCE.NS', 'TCS.NS', 'INFY.NS', 'HDFCBANK.NS', 'SBIN.NS'];
        stocks = fallbackKeys.map(k => {
            const conf = STOCK_DEFAULTS[k] || { name: k, basePrice: 150 };
            const cur = conf.currency === 'USD' ? conf.basePrice * USD_INR_RATE : conf.basePrice;
            const prev = cur * (1 + (Math.random() * 0.03 - 0.015));
            return {
                ticker: k,
                name: conf.name,
                current_price: cur,
                previous_close: prev
            };
        });
    }
    
    tableBody.innerHTML = '';
    stocks.forEach(s => {
        const current = s.current_price;
        const prev    = s.previous_close;
        const diff    = current - prev;
        const pct     = prev > 0 ? ((diff / prev) * 100).toFixed(2) : '0.00';
        const isUp    = diff >= 0;
        
        // Compute signal for table
        const pctNum = parseFloat(pct);
        let signalPill = '';
        if (pctNum > 0.5)        signalPill = '<span class="table-signal-pill buy">BUY</span>';
        else if (pctNum < -0.5)  signalPill = '<span class="table-signal-pill sell">SELL</span>';
        else                     signalPill = '<span class="table-signal-pill hold">HOLD</span>';
        
        const row = document.createElement('tr');
        row.style.cursor = 'pointer';
        row.title = `Click to analyze ${s.ticker}`;
        row.onclick = () => changeTicker(s.ticker, s.name || s.ticker);
        
        row.innerHTML = `
            <td>
                <span class="table-ticker-badge">${s.ticker}</span>
                <span style="font-size: 0.78rem; color: var(--text-secondary); margin-left: 0.5rem;">${s.name || ''}</span>
            </td>
            <td style="font-weight: 700; font-family: 'Outfit', sans-serif;">₹${current.toFixed(2)}</td>
            <td style="color: var(--text-secondary);">₹${prev.toFixed(2)}</td>
            <td class="trend-indicator ${isUp ? 'up' : 'down'}">
                ${isUp ? '▲ +' : '▼ '}₹${Math.abs(diff).toFixed(2)}
            </td>
            <td class="trend-indicator ${isUp ? 'up' : 'down'}">
                ${isUp ? '▲' : '▼'} ${Math.abs(pct)}%
            </td>
            <td>${signalPill}</td>
        `;
        tableBody.appendChild(row);
    });
}

// ============================================================
// CSV Report Exporter — uses live backend data from Yahoo Finance
// ============================================================
window.exportCSVReport = function() {
    showToast('Downloading live CSV report from Yahoo Finance...', 'info');
    // Trigger the server-side /download-stocks endpoint which uses yfinance
    const a = document.createElement('a');
    a.href = '/download-stocks';
    a.download = 'Market_AI_Prediction_Report.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('📥 CSV report downloaded!', 'success');
};

// ----------------------------------------------------
// Custom stock modal creation (Interactive WOW feature)
// ----------------------------------------------------
window.openCustomStockModal = function() {
    document.getElementById('customStockModal').style.display = 'flex';
};

window.closeCustomStockModal = function() {
    document.getElementById('customStockModal').style.display = 'none';
};

window.createCustomStock = function() {
    const symbol = document.getElementById('customSym').value.trim().toUpperCase();
    const name = document.getElementById('customName').value.trim();
    const basePrice = parseFloat(document.getElementById('customPrice').value);
    const trend = parseFloat(document.getElementById('customTrend').value);
    
    if (!symbol || !name || isNaN(basePrice) || isNaN(trend)) {
        showToast('Please fill out all fields with valid data.', 'error');
        return;
    }
    
    // Add custom stock to our global configuration list
    STOCK_DEFAULTS[symbol] = {
        name: name,
        basePrice: basePrice,
        drift: trend / 10000, // Scale drift to standard daily range
        volatility: 0.015,
        currency: 'INR'
    };
    
    // Add to HTML dropdown
    const select = document.getElementById('stockSelect');
    const opt = document.createElement('option');
    opt.value = symbol;
    opt.innerText = `[INR] ${name} (${symbol})`;
    select.appendChild(opt);
    
    // Rebuild tables
    buildWatchlistTable();
    closeCustomStockModal();
    changeTicker(symbol);
    showToast(`Custom stock ${symbol} successfully simulated!`, 'success');
};

// ============================================================
// Client Share Link Engine
// ============================================================
window.copyClientShareLink = function() {
    const sym = document.getElementById('stockSelect')?.value || currentSymbol || 'AAPL';
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const shareUrl = `${baseUrl}?ticker=${encodeURIComponent(sym)}&share=1`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast(`🔗 Shareable link for ${sym} copied to clipboard!`, 'success');
        }).catch(() => {
            fallbackPromptShare(shareUrl);
        });
    } else {
        fallbackPromptShare(shareUrl);
    }
};

function fallbackPromptShare(url) {
    prompt('Copy this shareable link for your client:', url);
}
