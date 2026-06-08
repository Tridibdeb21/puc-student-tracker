const API_BASE = window.location.port === "3000" 
    ? "" // Use relative URLs when on localhost:3000
    : window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:3000" // For Live Server on other ports
    : "https://tracking-k1dg.onrender.com"; // Production Render URL

const cfColors = {
    newbie: "text-gray-400",
    pupil: "text-green-400",
    specialist: "text-cyan-400",
    expert: "text-blue-400",
    candidate_master: "text-purple-400",
    master: "text-orange-400",
    international_master: "text-orange-500",
    grandmaster: "text-red-400",
    international_grandmaster: "text-red-500",
    legendary_grandmaster: "text-red-600"
};

// Generate a small SVG avatar with gradient background and initials
function generateAvatarSvg(initials, seed=0, size=40){
    const colors = ['#4F46E5','#06B6D4','#10B981','#F59E0B','#EF4444','#8B5CF6'];
    const c1 = colors[seed % colors.length];
    const c2 = colors[(seed+1) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${initials}">`+
        `<defs><linearGradient id="g${seed}" x1="0" x2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`+
        `<rect width="${size}" height="${size}" rx="8" fill="url(#g${seed})"/>`+
        `<text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="Poppins, Arial" font-size="${Math.floor(size/2.5)}" fill="white" font-weight="700">${initials}</text>`+
    `</svg>`;
    return svg;
}

let currentSort = "solvedToday";
let studentsData = [];
let weeklyChartInstance = null;
let currentDayOffset = 0;
let bdTimeInterval = null;
let isLoading = false;
let totalStudents = 0;
let fetchedStudents = 0;
let failedStudents = 0;
let hasLoadedStudents = false;
let hasLoadedContests = false;
let isLoadingContests = false;
let leaderboardAutoRefreshTimer = null;

// -------------------- NAVIGATION --------------------
function scrollToSection(id){
    document.getElementById(id).scrollIntoView({behavior:"smooth"});
}

// -------------------- BANGLADESH TIME UPDATER --------------------
async function updateBDTime() {
    try {
        const res = await fetch(`${API_BASE}/api/bd-time`);
        const data = await res.json();
        if(data.status === "OK") {
            document.getElementById("bdTime").textContent = data.bdTime;
            document.getElementById("footerBDTime").textContent = `Bangladesh Time: ${data.bdTime}`;
            const hdr = document.getElementById("headerBDTime"); if (hdr) hdr.textContent = data.bdTime;
        }
    } catch(err) {
        const now = Date.now();
        const bdOffset = 6 * 60 * 60 * 1000;
        const bdNow = new Date(now + bdOffset);
        
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        
        const dayOfWeek = days[bdNow.getUTCDay()];
        const month = months[bdNow.getUTCMonth()];
        const date = bdNow.getUTCDate();
        const year = bdNow.getUTCFullYear();
        const hours = bdNow.getUTCHours().toString().padStart(2, '0');
        const minutes = bdNow.getUTCMinutes().toString().padStart(2, '0');
        const seconds = bdNow.getUTCSeconds().toString().padStart(2, '0');
        
        const timeString = `${dayOfWeek}, ${month} ${date}, ${year} ${hours}:${minutes}:${seconds} (BD Time)`;
        
        document.getElementById("bdTime").textContent = timeString;
        document.getElementById("footerBDTime").textContent = `Bangladesh Time: ${timeString}`;
        const hdr = document.getElementById("headerBDTime"); if (hdr) hdr.textContent = timeString;
    }
}

function startBDTimeUpdater() {
    updateBDTime();
    if (bdTimeInterval) clearInterval(bdTimeInterval);
    bdTimeInterval = setInterval(updateBDTime, 10000);
}

// Theme toggle utilities
function applyTheme(theme){
    if(!theme) theme = localStorage.getItem('puc_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('puc_theme', theme);
    const btn = document.getElementById('themeToggle');
    if(btn) btn.textContent = theme === 'dark' ? 'Switch to Light' : 'Switch to Dark';
    if (weeklyChartInstance && studentsData && studentsData.length) {
        drawWeeklyChart(studentsData);
    }
}

function initThemeToggle(){
    applyTheme();
    const btn = document.getElementById('themeToggle');
    if(!btn) return;
    btn.addEventListener('click', ()=>{
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
    });
}

// -------------------- LOAD STUDENT COUNT --------------------
async function loadStudentCount() {
    try {
        const response = await fetch(`${API_BASE}/api/students/count`);
        const data = await response.json();
        
        if (data.status === "OK") {
            const studentCountEl = document.getElementById("studentCount");
            const detailsEl = document.getElementById("studentCountDetails");
            
            studentCountEl.textContent = `${data.count} students`;
            
            if (data.count > 0) {
                detailsEl.innerHTML = `<span class="text-green-400">${data.count} students registered</span>`;
            } else {
                detailsEl.innerHTML = `<span class="text-red-400">No students found in students.json</span>`;
            }
            
            totalStudents = data.count;
            updateStatusPanel("studentCount", `✅ ${data.count} students registered`);
            return data.count;
        }
    } catch (error) {
        console.error("Error loading student count:", error);
        document.getElementById("studentCountDetails").innerHTML = 
            `<span class="text-red-400">Error loading count</span>`;
        updateStatusPanel("studentCount", "❌ Error loading student count", "error");
    }
    return 0;
}

// -------------------- UPDATE STATUS PANEL --------------------
function updateStatusPanel(field = null, message = null, type = "success") {
    const statusLoading = document.getElementById("statusLoading");
    const statusCache = document.getElementById("statusCache");
    const statusApi = document.getElementById("statusApi");
    const statusGraph = document.getElementById("statusGraph");
    const statusContests = document.getElementById("statusContests");
    const statusDot = document.getElementById("statusDot");
    
    // Update specific field if provided
    if (field && message) {
        const element = document.getElementById(field);
        if (element) {
            const prefix = type === "success" ? "✅" : type === "error" ? "❌" : "🔄";
            element.innerHTML = `${prefix} ${message}`;
        }
    }
    
    // Update loading status
    if (isLoading) {
        statusLoading.innerHTML = `🔄 Loading: ${fetchedStudents}/${totalStudents} students`;
        statusDot.className = "status-indicator status-loading";
    } else if (fetchedStudents > 0) {
        if (failedStudents > 0) {
            statusLoading.innerHTML = `⚠️ Loaded: ${fetchedStudents}/${totalStudents} (${failedStudents} failed)`;
            statusDot.className = "status-indicator status-loading";
        } else {
            statusLoading.innerHTML = `✅ Loaded: ${fetchedStudents}/${totalStudents} students`;
            statusDot.className = "status-indicator status-online";
        }
    } else {
        statusLoading.innerHTML = "✅ Ready to load";
        statusDot.className = "status-indicator status-online";
    }
    
    // Cache status
    const cacheAge = Date.now() - (window.lastCacheTime || 0);
    if (cacheAge < 300000) { // 5 minutes
        statusCache.innerHTML = `✅ Cache: Fresh (${Math.floor(cacheAge/1000)}s ago)`;
    } else {
        statusCache.innerHTML = "🔄 Cache: Stale";
    }
    
    // Update other statuses if not already set
    if (!statusApi.innerHTML.includes("✅") && !statusApi.innerHTML.includes("❌")) {
        statusApi.innerHTML = "🌐 Codeforces API: ✅ Online";
    }
    
    if (!statusGraph.innerHTML.includes("✅") && !statusGraph.innerHTML.includes("❌")) {
        statusGraph.innerHTML = "📈 Weekly Graph: ✅ Ready";
    }
    
    if (!statusContests.innerHTML.includes("✅") && !statusContests.innerHTML.includes("❌")) {
        statusContests.innerHTML = "🏁 Contest Data: ✅ Ready";
    }
}

// -------------------- SHOW/HIDE LOADING PROGRESS --------------------
function showLoadingProgress() {
    document.getElementById("loadingProgress").classList.remove("hidden");
}

function hideLoadingProgress() {
    document.getElementById("loadingProgress").classList.add("hidden");
}

function updateProgress(current, total, message = "") {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    const progressDetails = document.getElementById("progressDetails");
    
    const percentage = Math.round((current / total) * 100);
    progressBar.style.width = `${percentage}%`;
    progressText.textContent = `${percentage}% (${current}/${total})`;
    
    if (message) {
        progressDetails.textContent = message;
    }
}

// -------------------- LOAD STUDENTS --------------------
async function loadStudents(sortBy=currentSort){
    if (isLoading) return;
    isLoading = true;
    
    currentSort = sortBy;
    const leaderboard = document.getElementById("leaderboard");
    const refreshBtn = document.getElementById("refreshLeaderboardBtn");
    
    showLoadingProgress();
    updateProgress(0, totalStudents, "Starting data fetch...");
    
    refreshBtn.disabled = true;
    refreshBtn.innerHTML = "⏳ Loading...";
    
    leaderboard.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="text-center text-yellow-300 py-4">Loading leaderboard... ⏳</p>
        <p class="text-center text-gray-400 text-sm">Fetching data for ALL ${totalStudents} students, please wait...</p>
        <p class="text-center text-gray-500 text-xs">This may take a moment as we fetch from Codeforces API</p>
    `;
    
    // Hide previous days display
    document.getElementById("previousDaysDisplay").classList.add("hidden");
    document.getElementById("dateDisplay").textContent = "";
    currentDayOffset = 0;

    try{
        // Update status
        fetchedStudents = 0;
        failedStudents = 0;
        updateStatusPanel();
        
        updateProgress(0, totalStudents, "Connecting to server...");
        
        const fresh = sortBy === '__fresh__';
        const endpoint = fresh ? `${API_BASE}/api/students/today?fresh=1` : `${API_BASE}/api/students/today`;
        const res = await fetch(endpoint);
        const data = await res.json();
        if(data.status !== "OK") throw new Error("Failed to fetch: " + (data.comment || "Unknown error"));

        studentsData = data.result || [];
        fetchedStudents = studentsData.length;
        failedStudents = data.failedHandles?.length || 0;
        // store failed handles for UI display/debugging
        window.failedHandlesList = data.failedHandles || [];
        
        const weeklyTagWinners = data.weeklyTagWinners || {};
        const weeklyWinner = data.weeklyWinner;

        if(data.currentBDTime) {
            document.getElementById("bdTime").textContent = data.currentBDTime;
            document.getElementById("footerBDTime").textContent = `Bangladesh Time: ${data.currentBDTime}`;
        }

        // Update student count display
        const total = data.totalStudents || totalStudents;
        const fetched = data.fetchedStudents || studentsData.length;
        
        document.getElementById("studentCount").textContent = `${total} students`;
        document.getElementById("studentCountDetails").innerHTML = 
            `<span class="${fetched === total ? 'text-green-400' : 'text-yellow-400'}">` +
            `${fetched}/${total} loaded</span>` +
            (failedStudents > 0 ? ` <span class="text-red-400">(${failedStudents} failed)</span>` : "");

        updateProgress(fetched, total, `Processing ${fetched} students...`);

        // Sort
        if(sortBy === "solvedToday"){
            studentsData.sort((a,b)=>{
                if(b.solvedToday !== a.solvedToday) return b.solvedToday - a.solvedToday;
                return (a.rating || 0) - (b.rating || 0);
            });
        } else if(sortBy === "rating"){
            studentsData.sort((a,b)=>(b.rating||0)-(a.rating||0));
        }

        // Position and medals
        studentsData.forEach((s,i)=>{
            s.position = i + 1;
            if(i===0) s.medal="🥇";
            else if(i===1) s.medal="🥈";
            else if(i===2) s.medal="🥉";
            else s.medal="";
        });

        updateProgress(total, total, "Rendering leaderboard...");
        renderWeeklyWinner(weeklyWinner, data.failedHandles || [], studentsData);
        renderLeaderboard(studentsData, "leaderboard");
        renderWeeklyTagWinners(weeklyTagWinners);
        drawWeeklyChart(studentsData);
        updateQuickStats();
        hasLoadedStudents = true;
        
        // Update cache time
        window.lastCacheTime = Date.now();
        updateStatusPanel("statusLoading", `✅ ${fetched}/${total} students loaded`);
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ✅ Loaded");
        
    } catch(err){
        console.error(err);
        leaderboard.innerHTML = `
            <div class="text-center py-8">
                <p class='text-red-400 text-lg'>❌ Error fetching data</p>
                <p class='text-gray-300 text-sm mt-2'>${err.message || "Codeforces API might be down"}</p>
                <button onclick="loadStudents()" class="refresh-btn mt-4">
                    🔄 Retry
                </button>
            </div>
        `;
        updateStatusPanel("statusLoading", "❌ Failed to load data", "error");
    } finally {
        isLoading = false;
        hideLoadingProgress();
        const refreshBtn = document.getElementById("refreshLeaderboardBtn");
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = "↻ Refresh Leaderboard";
        updateStatusPanel();
    }
}

async function ensureStudentsLoaded() {
    if (!totalStudents) {
        totalStudents = await loadStudentCount();
    }

    if (totalStudents > 0 && !hasLoadedStudents) {
        await loadStudents();
    }
}

async function loadContestsOnce() {
    if (hasLoadedContests || isLoadingContests) return;
    isLoadingContests = true;
    try {
        await Promise.all([loadUpcomingContests(), loadLast3Contests()]);
        hasLoadedContests = true;
    } finally {
        isLoadingContests = false;
    }
}

// -------------------- LOAD PREVIOUS DAYS --------------------
async function loadPreviousDay(dayOffset){
    if (isLoading) return;
    isLoading = true;
    
    const previousLeaderboard = document.getElementById("previousLeaderboard");
    previousLeaderboard.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="text-center text-yellow-300 py-4">Loading previous day... ⏳</p>
        <p class="text-center text-gray-400 text-sm">Fetching data for ${totalStudents} students...</p>
    `;
    
    try{
        // Update status
        fetchedStudents = 0;
        failedStudents = 0;
        updateStatusPanel();
        
        const res = await fetch(`${API_BASE}/api/students/day/${dayOffset}`);
        const data = await res.json();
        if(data.status !== "OK") throw new Error("Failed to fetch");

        studentsData = data.result || [];
        fetchedStudents = studentsData.length;
        failedStudents = data.failedHandles?.length || 0;
        
        // Update student count display
        const total = data.totalStudents || totalStudents;
        const fetched = data.fetchedStudents || studentsData.length;
        
        document.getElementById("studentCount").textContent = `${total} students`;
        document.getElementById("studentCountDetails").innerHTML = 
            `<span class="${fetched === total ? 'text-green-400' : 'text-yellow-400'}">` +
            `${fetched}/${total} loaded</span>` +
            (failedStudents > 0 ? ` <span class="text-red-400">(${failedStudents} failed)</span>` : "");
        
        studentsData.sort((a,b)=>{
            if(b.solvedToday !== a.solvedToday) return b.solvedToday - a.solvedToday;
            return (a.rating || 0) - (b.rating || 0);
        });
        
        studentsData.forEach((s,i)=>{
            s.position = i + 1;
            if(i===0) s.medal="🥇";
            else if(i===1) s.medal="🥈";
            else if(i===2) s.medal="🥉";
            else s.medal="";
        });
        
        // Show previous days display
        const previousDaysDisplay = document.getElementById("previousDaysDisplay");
        previousDaysDisplay.classList.remove("hidden");
        
        const dateDisplay = document.getElementById("dateDisplay");
        dateDisplay.innerHTML = `📅 Viewing: ${data.displayDate}`;
        currentDayOffset = dayOffset;
        
        if(data.currentBDTime) {
            document.getElementById("bdTime").textContent = data.currentBDTime;
            document.getElementById("footerBDTime").textContent = `Bangladesh Time: ${data.currentBDTime}`;
        }
        
        renderLeaderboard(studentsData, "previousLeaderboard");
        updateQuickStats();
        updateStatusPanel("statusLoading", `✅ ${fetched}/${total} students loaded`);

    }catch(err){
        console.error(err);
        previousLeaderboard.innerHTML = `
            <div class="text-center py-8">
                <p class='text-red-400 text-lg'>❌ Error fetching data</p>
                <p class='text-gray-300 text-sm mt-2'>${err.message || "Codeforces API might be down"}</p>
                <button onclick="loadPreviousDay(${dayOffset})" class="refresh-btn mt-4">
                    🔄 Retry
                </button>
            </div>
        `;
        updateStatusPanel("statusLoading", "❌ Failed to load data", "error");
    } finally {
        isLoading = false;
        updateStatusPanel();
    }
}

// -------------------- SHOW TODAY'S DATA --------------------
function showToday() {
    if (currentDayOffset !== 0) {
        currentDayOffset = 0;
        loadStudents(currentSort);
    }
}

// -------------------- FORCE REFRESH --------------------
function forceRefresh() {
    // Clear cache
    window.lastCacheTime = 0;
    updateStatusPanel("statusCache", "🔄 Cache cleared");
    // Force reload
    loadStudents('__fresh__');
}

// -------------------- REFRESH WEEKLY CHART --------------------
function refreshWeeklyChart() {
    if (studentsData.length > 0) {
        drawWeeklyChart(studentsData);
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ✅ Refreshed");
    }
}

// -------------------- WEEKLY WINNER --------------------
function renderWeeklyWinner(weeklyWinnerData, failedHandles = [], students = []){
    const container = document.getElementById("weeklyWinner");
    if (weeklyWinnerData && weeklyWinnerData.handle) {
        const initials = (weeklyWinnerData.handle || '').split(/[_\.\s-]+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase();
        // Try to find avatar from loaded students data
        const student = (studentsData || []).find(s => s.handle && s.handle.toLowerCase() === weeklyWinnerData.handle.toLowerCase());
        const avatarHtml = student && (student.avatar || student.titlePhoto) ?
            `<img src="${student.avatar || student.titlePhoto}" alt="${weeklyWinnerData.handle}" class="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg"/>`
            : generateAvatarSvg(initials, (weeklyWinnerData.rating||0), 80);

        container.innerHTML = `
            <div style="position:relative; overflow:visible;">
                <div class="p-4 rounded-lg text-left bg-gradient-to-r from-yellow-400 to-amber-500 border-2 border-yellow-300 shadow-xl flex items-center gap-4">
                    <div style="flex:0 0 auto">${avatarHtml}</div>
                    <div style="flex:1"> 
                        <div class="flex items-center gap-3">
                            <div class="text-2xl font-extrabold text-slate-900">${weeklyWinnerData.handle}</div>
                            <div class="text-sm px-3 py-1 rounded bg-white/10 text-white font-semibold">🏆 Weekly Winner</div>
                        </div>
                        <div class="mt-2 text-sm text-slate-900">Rating: <span class="font-bold">${weeklyWinnerData.rating || 0}</span> · Max: <span class="font-bold">${weeklyWinnerData.maxRating || 0}</span></div>
                        <div class="mt-2 text-sm text-slate-900">Solved <span class="font-bold">${weeklyWinnerData.daysSolved}</span> days this week (unique solves)</div>
                        <div class="mt-3 flex gap-2">
                            <a href="https://codeforces.com/profile/${weeklyWinnerData.handle}" target="_blank" class="refresh-btn text-sm px-4 py-2">View Profile</a>
                        </div>
                    </div>
                    <div style="flex:0 0 90px; text-align:center">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2l1.176 3.618L17 7.236l-3 2.184L14.352 15 12 13.236 9.648 15 10 9.42 7 7.236l3.824-1.618L12 2z" fill="#fff" opacity="0.95"/>
                        </svg>
                        <div class="text-xs text-slate-900 font-bold mt-1">Top Performer</div>
                    </div>
                </div>
                <div class="confetti-container" aria-hidden="true" style="position:absolute; left:0; right:0; top:-18px; height:0; pointer-events:none; overflow:visible">
                    <style>
                        .confetti-container span{ position:absolute; width:8px; height:12px; opacity:0.95; transform-origin:center; animation:fall 1800ms linear forwards; }
                        @keyframes fall{ 0%{ transform: translateY(-10px) rotate(0deg); opacity:1 } 100%{ transform: translateY(120px) rotate(360deg); opacity:0 } }
                    </style>
                    ${Array.from({length:12}).map((_,i)=>{
                        const left = Math.round((i/12)*100);
                        const colors = ['#ef4444','#f59e0b','#10b981','#06b6d4','#8b5cf6','#f472b6'];
                        const c = colors[i % colors.length];
                        const delay = Math.floor(Math.random()*400);
                        return `<span style="left:${left}%; top:0; background:${c}; animation-delay:${delay}ms"></span>`;
                    }).join('')}
                </div>
            </div>
        `;
    } else {
        // Provide clear reasons and diagnostics when no winner
        const reason = failedHandles && failedHandles.length ?
            `Could not determine winner due to ${failedHandles.length} failed handle fetches.` :
            `No student met the minimum requirement (5 days with unique solves).`;

        // Optionally show top candidates (who solved most days) for transparency
        let candidatesHtml = '';
        try {
            const ranked = (students || []).map(s=>({ handle: s.handle, totalDays: Object.values(s.weeklySolves||{}).filter(v=>v>0).length, rating: s.rating||0 }))
                .sort((a,b)=> b.totalDays - a.totalDays || b.rating - a.rating)
                .slice(0,5);

            if (ranked.length) {
                candidatesHtml = `<div class="mt-3 text-xs text-gray-300">Top candidates this week:<ul class="mt-2 text-left inline-block">` +
                    ranked.map(r=>`<li>${r.handle} — ${r.totalDays} days</li>`).join('') + `</ul></div>`;
            }
        } catch(e){ candidatesHtml = ''; }

        container.innerHTML = `
            <div class="bg-gray-700 p-4 rounded-lg text-center">
                <div class="text-lg">🏆 No weekly winner this week</div>
                <p class="text-sm text-gray-300 mt-2">${reason}</p>
                ${failedHandles && failedHandles.length ? `<p class="text-xs text-red-400 mt-2">Failed handles: ${failedHandles.join(', ')}</p>` : ''}
                ${candidatesHtml}
            </div>
        `;
    }
}

function highlightHandle(handle){
    // Scroll to leaderboard and temporarily highlight the row
    scrollToSection('leaderboard');
    setTimeout(()=>{
        const links = Array.from(document.querySelectorAll('#leaderboard a'));
        const target = links.find(a=>a.textContent.trim()===handle);
        if(target){
            const row = target.closest('tr');
            row.classList.add('contest-highlight');
            setTimeout(()=> row.classList.remove('contest-highlight'), 4000);
        } else {
            alert('Handle not visible in current leaderboard view. Try refreshing or searching.');
        }
    }, 400);
}

// -------------------- LEADERBOARD --------------------
function renderLeaderboard(data, containerId){
    const container = document.getElementById(containerId);
    
    if (!data || data.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8">
                <p class="text-yellow-300 text-lg">No data available</p>
                <p class="text-gray-400 text-sm mt-2">No students found or failed to fetch data</p>
            </div>
        `;
        return;
    }
    
    const total = data.length;
    let html = `
    <div class="mb-3 bg-gradient-to-r from-black/30 to-transparent p-3 rounded-lg">
        <div class="flex justify-between items-center">
            <div>
                <div class="text-sm text-gray-300">Showing <span class="text-yellow-300">${total}</span> students</div>
                <div class="text-xs text-gray-400">Sorted by: ${currentSort === 'solvedToday' ? 'Solved Today' : 'Rating'}</div>
            </div>
            <div class="text-xs text-gray-400">Refresh to update live data</div>
        </div>
    </div>
    <div class="overflow-hidden rounded-lg border border-transparent">
    <table class="w-full text-sm bg-gradient-to-b from-black/20 to-transparent">
    <thead class="bg-black/30 backdrop-blur sticky top-0">
    <tr class="text-left text-gray-300 text-xs tracking-wider">
        <th class="p-3 w-12">#</th>
        <th class="p-3">Student</th>
        <th class="p-3 w-24">Rating</th>
        <th class="p-3 w-28">Rank</th>
        <th class="p-3 w-24">Streak</th>
        <th class="p-3 w-20">Solved</th>
        <th class="p-3 w-36">Problems</th>
    </tr>
    </thead><tbody>`;

    data.forEach((s,i)=>{
        const colorClass=cfColors[s.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white";
        let medal = s.medal || "";

        // Show all solved problems with visible tags.
        let problemsHtml = s.todayProblems && s.todayProblems.length
            ? `<div class="space-y-2 max-h-64 overflow-auto pr-1">${s.todayProblems.map(p => {
                const tags = (p.tags && p.tags.length)
                    ? p.tags.map(tag => `<span class="inline-flex items-center px-2 py-1 rounded-full bg-white/10 text-gray-200 border border-white/10 mr-1 mb-1">${tag}</span>`).join('')
                    : `<span class="text-gray-500">No tags</span>`;

                return `
                    <a href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="block rounded-lg border border-white/10 bg-black/20 hover:bg-black/30 transition-colors p-2 text-xs">
                        <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0">
                                <div class="text-sky-300 font-semibold break-words">${p.name}</div>
                                <div class="text-gray-400 mt-1">${p.contestId}${p.index} · ${p.rating}</div>
                            </div>
                            <div class="text-[10px] text-gray-500 whitespace-nowrap">open</div>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1">${tags}</div>
                    </a>`;
            }).join('')}</div>`
            : "<span class='text-gray-500 text-xs'>No solves today</span>";

        const diffHtml = `<div class="flex gap-1 flex-wrap items-center">
            ${s.difficultyCount?.easy?`<div class="w-4 h-4 bg-green-400 rounded-full text-xs flex items-center justify-center text-black" title="Easy: ${s.difficultyCount.easy}">${s.difficultyCount.easy}</div>`:""}
            ${s.difficultyCount?.med1?`<div class="w-4 h-4 bg-lime-400 rounded-full text-xs flex items-center justify-center text-black" title="Medium 1: ${s.difficultyCount.med1}">${s.difficultyCount.med1}</div>`:""}
            ${s.difficultyCount?.med2?`<div class="w-4 h-4 bg-orange-400 rounded-full text-xs flex items-center justify-center text-black" title="Medium 2: ${s.difficultyCount.med2}">${s.difficultyCount.med2}</div>`:""}
            ${s.difficultyCount?.hard?`<div class="w-4 h-4 bg-red-400 rounded-full text-xs flex items-center justify-center text-black" title="Hard: ${s.difficultyCount.hard}">${s.difficultyCount.hard}</div>`:""}
        </div>`;
        // avatar initials
        const initials = (s.handle || '').split(/[_\.\s-]+/).filter(Boolean).map(x=>x[0]).slice(0,2).join('').toUpperCase();
        const profileImage = s.titlePhoto || s.avatar || null;
        const avatarMarkup = profileImage
            ? `<img src="${profileImage}" alt="${s.handle}" class="w-10 h-10 rounded-full object-cover border-2 border-white/20 shadow-lg"/>`
            : generateAvatarSvg(initials, i, 40);
        html+=`<tr class="border-b border-gray-800 hover:bg-black/20">
            <td class="p-3 font-semibold">${s.position} ${medal}</td>
            <td class="p-3 flex items-center gap-3">
                ${avatarMarkup}
                <div>
                    <a href="https://codeforces.com/profile/${s.handle}" target="_blank" class="${colorClass} font-semibold hover:underline">${s.handle}</a>
                    <div class="text-xs text-gray-400">${s.maxRating ? 'Max: '+(s.maxRating||0) : ''}</div>
                </div>
            </td>
            <td class="p-3 font-semibold">${s.rating || 0}</td>
            <td class="p-3">${s.rank || "-"}</td>
            <td class="p-3 ${s.streak > 0 ? 'text-green-400 font-bold' : 'text-gray-400'}">${s.streak || 0} 🔥</td>
            <td class="p-3 font-bold ${s.solvedToday > 0 ? 'text-green-400' : 'text-gray-400'}">${s.solvedToday || 0}</td>
            <td class="p-3">${problemsHtml}</td>
        </tr>`;
    });

    html += `</tbody></table></div>
    <div class="mt-3 p-3 text-xs text-gray-300 bg-black/20 rounded">
        <p>* Streak counts days with <span class="text-green-400">unique problem solves only</span> (duplicates filtered)</p>
        <p>✅ Showing <span class="text-yellow-300">${data.length}</span> out of <span class="text-green-400">${totalStudents}</span> total students</p>
        ${failedStudents > 0 ? `<p class="text-red-400">⚠️ ${failedStudents} students failed to load (Codeforces API issue)</p>` : ''}
        ${window.failedHandlesList && window.failedHandlesList.length ? `<div class="mt-2 text-xs text-gray-400">Failed handles: <span id="failedHandlesList">${window.failedHandlesList.join(', ')}</span> <button onclick="copyFailedHandles()" class="ml-2 px-2 py-1 text-xs rounded bg-gray-700">Copy</button></div>` : ''}
    </div>`;
    
    container.innerHTML=html;
    
    // Update leaderboard stats
    document.getElementById("leaderboardStats").innerHTML = 
        `<span class="${data.length === totalStudents ? 'text-green-400' : 'text-yellow-400'}">${data.length}/${totalStudents}</span> students loaded`;
}

// -------------------- WEEKLY TAG WINNERS --------------------
function renderWeeklyTagWinners(winners){
    const container = document.getElementById("tagWinnersContainer");
    
    if(!winners || Object.keys(winners).length === 0){
        container.innerHTML = `
            <div class="bg-gray-700 p-4 rounded-lg">
                <p class="text-center text-yellow-300">No tag winners this week</p>
                <p class="text-center text-gray-400 text-xs mt-1">Students haven't solved enough problems with tags this week</p>
            </div>
        `;
        return;
    }
    
    // Sort tags by count (descending)
    const sortedTags = Object.entries(winners)
        .sort((a, b) => b[1].count - a[1].count);
    
    // Show top 12 tags
    const topTags = sortedTags.slice(0, 12);
    
    let html = `
    <div class="mb-3 text-xs text-gray-400 text-center">
        Showing top ${topTags.length} tags from ALL students' unique solves
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">`;
    
    topTags.forEach(([tag, data]) => {
        html += `
        <div class="bg-gray-700 rounded p-3 hover:bg-gray-600 transition-colors contest-card">
            <h3 class="font-bold text-white text-sm mb-1 truncate" title="${tag}">${tag}</h3>
            <p class="text-yellow-300 text-xs truncate" title="${data.winner}">Winner: ${data.winner}</p>
            <p class="text-green-400 text-xs font-bold">${data.count} unique problems</p>
        </div>`;
    });
    
    html += `</div>
    <div class="mt-3 text-xs text-gray-400 text-center">
        Based on ALL students' submissions this week
    </div>`;
    
    container.innerHTML = html;
}

// -------------------- HANDLE SEARCH --------------------
function filterByHandle(){
    const query=document.getElementById("handleSearch").value.trim().toLowerCase();
    if(!query){
        const containerId = currentDayOffset > 0 ? "previousLeaderboard" : "leaderboard";
        renderLeaderboard(studentsData, containerId);
    } else {
        const filtered=studentsData.filter(s=>s.handle.toLowerCase().includes(query));
        const containerId = currentDayOffset > 0 ? "previousLeaderboard" : "leaderboard";
        renderLeaderboard(filtered, containerId);
    }
}

function copyFailedHandles(){
    const list = window.failedHandlesList || [];
    if(list.length === 0) return;
    const text = list.join(', ');
    navigator.clipboard?.writeText(text).then(()=>{
        alert('Failed handles copied to clipboard');
    }).catch(()=>{ prompt('Failed handles:', text); });
}

function clearSearch() {
    document.getElementById("handleSearch").value = '';
    const containerId = currentDayOffset > 0 ? "previousLeaderboard" : "leaderboard";
    renderLeaderboard(studentsData, containerId);
}

// -------------------- WEEKLY CHART --------------------
function drawWeeklyChart(data, selectedHandles=null){
    const ctx=document.getElementById('weeklyChart').getContext('2d');
    if(weeklyChartInstance) weeklyChartInstance.destroy();

    const isLightTheme = document.documentElement.getAttribute('data-theme') === 'light';
    const chartTextColor = isLightTheme ? '#0f172a' : '#ffffff';
    const chartGridColor = isLightTheme ? 'rgba(15, 23, 42, 0.10)' : 'rgba(255, 255, 255, 0.10)';
    const chartTooltipBg = isLightTheme ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.80)';
    const chartTooltipText = isLightTheme ? '#0f172a' : '#ffffff';

    if (!data || data.length === 0) {
        const container = document.querySelector(".chart-container");
        container.innerHTML = 
            `<div class="text-center py-8">
                <p class="text-yellow-300">No data available for chart</p>
                <p class="text-gray-400 text-sm mt-2">Load student data first</p>
            </div>`;
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ❌ No data", "error");
        return;
    }

    // Get first student with weeklySolves data
    const studentWithData = data.find(s => s.weeklySolves && Object.keys(s.weeklySolves).length > 0);
    if (!studentWithData || !studentWithData.weeklySolves) {
        const container = document.querySelector(".chart-container");
        container.innerHTML = 
            `<div class="text-center py-8">
                <p class="text-yellow-300">No weekly data available</p>
                <p class="text-gray-400 text-sm mt-2">Weekly solve data not found</p>
            </div>`;
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ❌ No weekly data", "error");
        return;
    }

    // Get dates from weeklySolves (last 7 days)
    const allDates = Object.keys(studentWithData.weeklySolves);
    const labels = allDates.sort((a, b) => new Date(a.replace(/-/g, '/')) - new Date(b.replace(/-/g, '/')));
    
    // Format dates for display
    const formattedLabels = labels.map(date => {
        const [year, month, day] = date.split('-');
        const d = new Date(Date.UTC(parseInt(year), parseInt(month)-1, parseInt(day)));
        return d.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            weekday: 'short'
        });
    });

    const datasets = [];
    
    // If selectedHandles is provided it may be a string (single) or array (multiple)
    const handlesArray = (typeof selectedHandles === 'string') ? [selectedHandles] : (Array.isArray(selectedHandles) ? selectedHandles : null);
    if (handlesArray && handlesArray.length > 0) {
        // Show only selected handles
        const colors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#8B5CF6'
        ];
        handlesArray.slice(0, 10).forEach((h, index) => {
            const student = data.find(s => s.handle === h);
            if (student && student.weeklySolves) {
                datasets.push({
                    label: student.handle,
                    data: labels.map(d => student.weeklySolves[d] || 0),
                    borderWidth: 3,
                    fill: false,
                    tension: 0.4,
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    pointRadius: 4,
                    pointHoverRadius: 6
                });
            }
        });
    } else {
        // Show top 10 students for better visualization
        const studentsWithData = data.filter(s => s.weeklySolves && Object.values(s.weeklySolves).some(v => v > 0));
        
        if (studentsWithData.length === 0) {
            const container = document.querySelector(".chart-container");
            container.innerHTML = 
                `<div class="text-center py-8">
                    <p class="text-yellow-300">No solve data for the week</p>
                    <p class="text-gray-400 text-sm mt-2">Students haven't solved any problems this week</p>
                </div>`;
            updateStatusPanel("statusGraph", "📈 Weekly Graph: ❌ No solve data", "error");
            return;
        }
        
        // Sort by total weekly solves
        const sortedStudents = [...studentsWithData].sort((a, b) => {
            const totalA = Object.values(a.weeklySolves || {}).reduce((sum, val) => sum + val, 0);
            const totalB = Object.values(b.weeklySolves || {}).reduce((sum, val) => sum + val, 0);
            return totalB - totalA;
        });
        
        // Take top 10 or all if less than 10
        const topStudents = sortedStudents.slice(0, 10);
        
        const colors = [
            '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
            '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#8B5CF6'
        ];
        
        topStudents.forEach((s, index) => {
            if (s.weeklySolves) {
                datasets.push({
                    label: s.handle,
                    data: labels.map(d => s.weeklySolves[d] || 0),
                    borderWidth: 2,
                    fill: false,
                    tension: 0.3,
                    borderColor: colors[index % colors.length],
                    backgroundColor: colors[index % colors.length],
                    pointRadius: 3,
                    pointHoverRadius: 5
                });
            }
        });
    }

    weeklyChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: formattedLabels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: chartTextColor,
                        font: { size: 12, weight: '600' },
                        usePointStyle: true,
                        boxWidth: 10,
                        padding: 14
                    },
                    position: 'top',
                    align: 'center',
                    maxHeight: 100,
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: chartTooltipBg,
                    titleColor: chartTooltipText,
                    bodyColor: chartTooltipText,
                    callbacks: {
                        title: function(tooltipItems) {
                            const index = tooltipItems[0].dataIndex;
                            const originalDate = labels[index];
                            const [year, month, day] = originalDate.split('-');
                            const d = new Date(Date.UTC(year, month-1, day));
                            return d.toLocaleDateString('en-US', { 
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                            }) + ' (BD)';
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            label += context.parsed.y + ' unique solve(s)';
                            return label;
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Weekly Progress (Unique Solves Only)',
                    color: chartTextColor,
                    font: { size: 14, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        color: chartTextColor, 
                        stepSize: 1, 
                        font: { size: 11 },
                        precision: 0
                    },
                    grid: { 
                        color: chartGridColor,
                        drawBorder: false
                    },
                    title: {
                        display: true,
                        text: 'Unique Problems Solved',
                        color: chartTextColor,
                        font: { size: 12, weight: 'bold' }
                    }
                },
                x: {
                    ticks: { 
                        color: chartTextColor, 
                        maxRotation: 45, 
                        font: { size: 10 } 
                    },
                    grid: { 
                        color: chartGridColor,
                        drawBorder: false
                    },
                    title: {
                        display: true,
                        text: 'Date (Bangladesh Time)',
                        color: chartTextColor,
                        font: { size: 12, weight: 'bold' }
                    }
                }
            },
            interaction: { 
                intersect: false, 
                mode: 'nearest' 
            },
            animation: {
                duration: 750,
                easing: 'easeInOutQuart'
            }
        }
    });
    
    weeklyChartInstance.resize();
    updateStatusPanel("statusGraph", "📈 Weekly Graph: ✅ Loaded");
}

function showAllWeekly(){ 
    drawWeeklyChart(studentsData); 
}

function showTop5Weekly() {
    const studentsWithData = studentsData.filter(s => s.weeklySolves && Object.values(s.weeklySolves).some(v => v > 0));
    
    if (studentsWithData.length === 0) {
        alert("No students with weekly solve data available.");
        return;
    }
    
    const topStudents = [...studentsWithData]
        .sort((a, b) => {
            const totalA = Object.values(a.weeklySolves || {}).reduce((sum, val) => sum + val, 0);
            const totalB = Object.values(b.weeklySolves || {}).reduce((sum, val) => sum + val, 0);
            return totalB - totalA;
        })
        .slice(0, 5);
    
    drawWeeklyChart(topStudents);
}

function selectWeeklyHandle(){
    const handles = studentsData.map(s => s.handle).sort();
    const handleList = handles.join('\n');
    const h = prompt(`Select a handle from the list:\n\n${handleList}`)?.trim(); 
    if(!h) return;
    
    if(!handles.includes(h)){
        alert(`Handle "${h}" not found in the student list.`);
        return;
    }
    
    drawWeeklyChart(studentsData, h);
}

function selectWeeklyHandles(){
    // Create a modal with a multi-select for handles
    const overlay = document.createElement('div');
    overlay.id = 'multiSelectOverlay';
    overlay.style = 'position:fixed;left:0;top:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:10000';

    const box = document.createElement('div');
    box.style = 'background:var(--bg);padding:20px;border-radius:12px;max-width:720px;width:90%;box-shadow:0 12px 40px rgba(0,0,0,0.6);';

    box.innerHTML = `
        <h3 style="font-size:18px;margin-bottom:8px;color:var(--text)">Select Handles to Display</h3>
        <p style="color:var(--muted);font-size:12px;margin-bottom:10px">Hold Ctrl/Cmd to select multiple handles. Max 10 handles.</p>
        <select id="multiHandlesSelect" multiple size="10" style="width:100%;padding:8px;border-radius:6px;background:rgba(255,255,255,0.02);color:var(--text);border:1px solid rgba(255,255,255,0.04)"></select>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">
            <button id="multiCancel" class="refresh-btn" style="background:#6b7280">Cancel</button>
            <button id="multiApply" class="refresh-btn">Apply</button>
        </div>
    `;

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const select = document.getElementById('multiHandlesSelect');
    const handles = studentsData.map(s=>s.handle).sort();
    handles.forEach(h=>{
        const opt = document.createElement('option'); opt.value = h; opt.text = h; select.appendChild(opt);
    });

    document.getElementById('multiCancel').addEventListener('click', ()=>{ overlay.remove(); });
    document.getElementById('multiApply').addEventListener('click', ()=>{
        const chosen = Array.from(select.selectedOptions).map(o=>o.value).slice(0,10);
        overlay.remove();
        if(!chosen || chosen.length===0) return;
        drawWeeklyChart(studentsData, chosen);
    });
}

// -------------------- UPCOMING CONTESTS --------------------
async function loadUpcomingContests(){
    const container = document.getElementById("upcomingContests");
    container.innerHTML = `<div class="loading-spinner" style="width: 30px; height: 30px; border-width: 3px;"></div><p class="text-yellow-300 text-center">Loading ALL upcoming contests...</p>`;
    
    updateStatusPanel("statusContests", "🏁 Contest Data: 🔄 Loading...");
    
    try{
        const res = await fetch(`${API_BASE}/api/contests/upcoming`);
        const data = await res.json();
        if(data.status !== "OK") throw new Error("Failed");

        if(!data.contests || data.contests.length === 0){
            container.innerHTML = `<p class="text-yellow-300 text-center">No upcoming contests</p>`;
            updateStatusPanel("statusContests", "🏁 Contest Data: ✅ No contests", "success");
            return;
        }

        let html = `<div class="space-y-3">`;
        
        // Show ALL contests
        data.contests.forEach(c => {
            const bgClass = c.isLive ? "bg-red-600 border-2 border-red-400" : 
                          c.isSoon ? "bg-yellow-700 border border-yellow-500" : "bg-gray-700 border border-gray-600";
            
            html += `
            <div id="contest-${c.id}" data-contest-id="${c.id}" class="${bgClass} rounded p-3 contest-card" onclick="(function(){ history.pushState({}, '', '/contests/${c.id}'); router(); })()" style="cursor: pointer;">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div class="flex-1">
                        <div class="hover:underline font-bold text-sm md:text-base text-blue-200">
                           ${c.name} ${c.isLive?"🔥 LIVE":c.isSoon?"⏰ Soon":""}
                        </div>
                        <div class="flex flex-wrap gap-2 mt-1 text-xs">
                            <span class="bg-gray-800 px-2 py-1 rounded">🕒 ${c.startTime} (BD)</span>
                            <span class="bg-gray-800 px-2 py-1 rounded">⏱ ${c.duration}</span>
                        </div>
                    </div>
                    <a href="${c.url}" target="_blank" rel="noopener noreferrer"
                       class="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded font-bold text-xs whitespace-nowrap">
                       Participate
                    </a>
                </div>
            </div>`;
        });
        
        html += `</div>
        <div class="mt-3 text-xs text-gray-400 text-center">
            Showing <span class="text-yellow-300">${data.contests.length}</span> upcoming contests
        </div>`;
        
        container.innerHTML = html;
        updateStatusPanel("statusContests", `🏁 Contest Data: ✅ ${data.contests.length} contests`);

    } catch(err) {
        console.error(err);
        container.innerHTML = `
            <div class="text-center py-4">
                <p class="text-red-400">Unable to load contests</p>
                <p class="text-gray-400 text-xs mt-1">${err.message || "Codeforces API might be down"}</p>
            </div>
        `;
        updateStatusPanel("statusContests", "🏁 Contest Data: ❌ Failed", "error");
    }
}

// -------------------- LAST 3 CONTESTS --------------------
async function loadLast3Contests(){
    const container = document.getElementById("last3Contests");
    container.innerHTML = `
        <div class="loading-spinner" style="width: 30px; height: 30px; border-width: 3px;"></div>
        <p class="text-center text-yellow-300">Loading ALL students contest standings...</p>
        <p class="text-center text-gray-400 text-xs">This may take a moment for large student lists</p>
    `;
    
    updateStatusPanel("statusContests", "🏁 Contest Data: 🔄 Loading standings...");
    
    try{
        const res = await fetch(`${API_BASE}/api/contests/last-3-standings`);
        const data = await res.json();
        if(data.status !== "OK") throw new Error("Failed");

        if(!data.contests || data.contests.length === 0){
            container.innerHTML = `<p class="text-center text-yellow-300">No recent contests available</p>`;
            updateStatusPanel("statusContests", "🏁 Contest Data: ✅ No recent contests", "success");
            return;
        }
        
        let html = `<div class="space-y-6">`;
        
        data.contests.forEach((c, contestIndex) => {
            const participants = c.participants || [];
            const successfulParticipants = participants.filter(p => 
                p.standing !== "Did not participate" && p.standing !== "Error fetching data"
            ).length;
            
            html += `
            <div class="bg-gray-800 p-4 rounded-lg">
                <h3 class="text-lg font-bold mb-3 text-center text-blue-300">${c.name}</h3>
                <div class="text-xs text-gray-400 mb-3 text-center">
                    Showing <span class="text-yellow-300">ALL ${participants.length}</span> students
                    <span class="ml-2 text-green-400">(${successfulParticipants} participated)</span>
                </div>
                <div class="scrollable-table" style="max-height: 400px;">
                    <table class="w-full bg-gray-700 rounded-lg text-xs">
                    <thead class="bg-gray-600 sticky top-0">
                    <tr>
                        <th class="p-2 w-10">#</th>
                        <th class="p-2">Handle</th>
                        <th class="p-2 w-20">Standing</th>
                        <th class="p-2 w-24">Rating Change</th>
                    </tr>
                    </thead>
                    <tbody>`;
            
            // Show ALL students
            participants.forEach((p,i) => {
                const rc = p.ratingChange;
                let rcSymbol = "—";
                let rcClass = "";
                
                if(rc !== "—" && rc !== undefined){
                    const rcNum = parseInt(rc);
                    if(!isNaN(rcNum)){
                        if(rcNum > 0){
                            rcSymbol = `+${rcNum}`;
                            rcClass = "text-green-400 font-bold";
                        } else if(rcNum < 0){
                            rcSymbol = `${rcNum}`;
                            rcClass = "text-red-400 font-bold";
                        } else {
                            rcSymbol = "0";
                            rcClass = "text-gray-300";
                        }
                    }
                }
                
                const standingClass = p.standing === "Did not participate" ? "text-gray-500" : 
                                    p.standing === "Error fetching data" ? "text-red-500" : 
                                    "text-white";
                
                html += `
                <tr class="border-t border-gray-600 hover:bg-gray-600">
                    <td class="p-2 text-center">${i+1}</td>
                    <td class="p-2">
                        <a href="https://codeforces.com/profile/${p.handle}" target="_blank" 
                           class="text-blue-400 hover:underline truncate block max-w-[150px]">
                           ${p.handle}
                        </a>
                    </td>
                    <td class="p-2 text-center ${standingClass}">${p.standing}</td>
                    <td class="p-2 text-center ${rcClass}">${rcSymbol}</td>
                </tr>`;
            });
            
            html += `</tbody></table></div></div>`;
        });
        
        html += `</div>`;
        container.innerHTML = html;
        
        updateStatusPanel("statusContests", `🏁 Contest Data: ✅ ${data.contests.length} contests loaded`);

    } catch(err){
        console.error(err);
        container.innerHTML = `
            <div class="text-center py-4">
                <p class="text-red-400 text-center text-sm">Unable to load contest standings</p>
                <p class="text-gray-400 text-xs mt-1">${err.message || "Codeforces API might be down"}</p>
            </div>
        `;
        updateStatusPanel("statusContests", "🏁 Contest Data: ❌ Failed to load", "error");
    }
}

// -------------------- UPDATE QUICK STATS --------------------
function updateQuickStats() {
    const quickStats = document.getElementById("quickStats");
    if (!studentsData || studentsData.length === 0) {
        quickStats.innerHTML = `
            <div class="bg-gray-700 p-4 rounded text-center">
                <p class="text-gray-300 text-sm">No data available</p>
                <p class="text-gray-400 text-xs mt-1">Load student data first</p>
            </div>
        `;
        return;
    }
    
    const totalSolvedToday = studentsData.reduce((sum, student) => sum + (student.solvedToday || 0), 0);
    const activeToday = studentsData.filter(student => (student.solvedToday || 0) > 0).length;
    
    const studentsWithStreak = studentsData.filter(s => (s.streak || 0) > 0).length;
    const maxStreak = studentsData.length > 0 ? Math.max(...studentsData.map(s => s.streak || 0)) : 0;
    const avgSolved = studentsData.length > 0 ? (totalSolvedToday / studentsData.length).toFixed(1) : "0.0";
    
    let topPerformer = null;
    let maxSolved = 0;
    
    studentsData.forEach(student => {
        if ((student.solvedToday || 0) > maxSolved) {
            maxSolved = student.solvedToday || 0;
            topPerformer = student.handle;
        }
    });
    
    quickStats.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div class="bg-gray-700 p-2 rounded text-center">
                <div class="text-base font-bold text-green-400">${activeToday}</div>
                <div class="text-xs text-gray-300">Active Today</div>
            </div>
            <div class="bg-gray-700 p-2 rounded text-center">
                <div class="text-base font-bold text-blue-400">${totalSolvedToday}</div>
                <div class="text-xs text-gray-300">Total Solves</div>
            </div>
            <div class="bg-gray-700 p-2 rounded text-center">
                <div class="text-base font-bold text-yellow-400">${studentsWithStreak}</div>
                <div class="text-xs text-gray-300">With Streak</div>
            </div>
            <div class="bg-gray-700 p-2 rounded text-center">
                <div class="text-base font-bold text-purple-400">${maxStreak}</div>
                <div class="text-xs text-gray-300">Max Streak</div>
            </div>
        </div>
        <div class="mt-3 bg-gray-800 p-3 rounded">
            ${topPerformer ? `
            <div class="flex flex-col sm:flex-row justify-between items-center">
                <div class="text-sm">
                    <span class="text-gray-300">Top Performer: </span>
                    <span class="text-yellow-300 font-bold">${topPerformer}</span>
                </div>
                <div class="text-green-400 font-bold text-sm">${maxSolved} solves</div>
            </div>
            ` : ''}
            <div class="mt-2 text-xs text-gray-400">
                <p>Average solves: <span class="text-blue-300">${avgSolved}</span> per student</p>
                <p>${currentDayOffset > 0 ? 'Viewing previous day stats' : "Today's statistics"}</p>
                <p class="text-gray-500 mt-1">* Streak counts unique solves only</p>
            </div>
        </div>
    `;
}


// -------------------- INITIAL LOAD --------------------
// -------------------- SIMPLE CLIENT ROUTER --------------------
function hideAllMainSections() {
    const ids = [
        'manual',
        'weeklyWinner',
        'leaderboardSection',
        'previousDays',
        'quickFacts',
        'weeklyTagWinners',
        'weeklyChartSection',
        'contests'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    });
}

function showSectionByPath(path) {
    const routeMap = {
        '/': 'leaderboardSection',
        '/daily': 'leaderboardSection',
        '/manual': 'manual',
        '/leaderboard': 'leaderboardSection',
        '/previous': 'previousDays',
        '/weekly': 'weeklyChartSection',
        '/contests': 'contests'
    };

    // Exact match first
    let target = routeMap[path] || null;
    // Support direct routes like /contests/2224 and legacy /contest/2224
    if (!target) {
        if (path.startsWith('/contests') || path.startsWith('/contest')) {
            target = 'contests';
        } else {
            target = routeMap['/'];
        }
    }
    hideAllMainSections();
    const el = document.getElementById(target);
    if (el) el.classList.remove('hidden');

    // When showing leaderboard, also ensure the Weekly Winner card is visible
    // so the winner appears at the top of the leaderboard as expected.
    if (target === 'leaderboardSection') {
        const ww = document.getElementById('weeklyWinner');
        if (ww && ww.classList.contains('hidden')) ww.classList.remove('hidden');
    }

    // Trigger data loads for heavier pages
    if (target === 'leaderboardSection') {
        ensureStudentsLoaded();
        if (leaderboardAutoRefreshTimer) clearInterval(leaderboardAutoRefreshTimer);
        leaderboardAutoRefreshTimer = setInterval(() => {
            const leaderboardSection = document.getElementById('leaderboardSection');
            if (leaderboardSection && !leaderboardSection.classList.contains('hidden') && !isLoading) {
                loadStudents('__fresh__');
            }
        }, 180000);
    } else if (target === 'contests') {
        // If path includes an id like /contests/2224, extract it to scroll after loading
        const parts = path.split('/').filter(Boolean);
        const contestId = parts.length >= 2 ? parts[1] : null;
        loadContestsOnce().then(() => {
            if (contestId) {
                setTimeout(() => {
                    const el = document.getElementById(`contest-${contestId}`);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.classList.add('contest-highlight');
                        setTimeout(() => el.classList.remove('contest-highlight'), 3000);
                    }
                }, 150);
            }
        });
    } else if (target === 'weeklyChartSection') {
        // if we already have data, draw chart; otherwise load students first
        if (studentsData && studentsData.length) {
            drawWeeklyChart(studentsData);
        } else {
            ensureStudentsLoaded().then(() => {
                if (studentsData && studentsData.length) drawWeeklyChart(studentsData);
            });
        }
    }
}

function router() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    showSectionByPath(path);
}

// Intercept internal nav links to use History API
document.addEventListener('click', function(e){
    const a = e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
    // same-origin internal link
    e.preventDefault();
    history.pushState({}, '', href);
    router();
});

window.addEventListener('popstate', router);

document.addEventListener('DOMContentLoaded', async function() {
    startBDTimeUpdater();
    initThemeToggle();
    
    // Initialize status
    updateStatusPanel();
    
    // Load student count first (route handlers decide what else to load)
    totalStudents = await loadStudentCount();
    
    // Keyboard shortcuts
    const handleSearch = document.getElementById('handleSearch');
    if (handleSearch) {
        handleSearch.addEventListener('keydown', function(e) {
            if(e.key === 'Escape') {
                this.value = '';
                filterByHandle();
            }
            if(e.key === 'Enter' && this.value.trim()) {
                e.preventDefault();
                filterByHandle();
            }
        });
        
        // Focus search on Ctrl+F
        document.addEventListener('keydown', function(e) {
            if((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                handleSearch.focus();
            }
            // Refresh on F5
            if(e.key === 'F5') {
                e.preventDefault();
                loadStudents();
            }
        });
    }
    
    // Add resize listener for chart
    window.addEventListener('resize', function() {
        if (weeklyChartInstance) {
            weeklyChartInstance.resize();
        }
    });
    // Initialize router to show correct page based on URL
    router();
});
