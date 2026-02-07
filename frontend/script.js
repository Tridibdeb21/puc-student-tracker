const API_BASE = "https://puc-student-tracker.onrender.com";

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

let currentSort = "solvedToday";
let studentsData = [];
let weeklyChartInstance = null;
let currentDayOffset = 0;
let bdTimeInterval = null;
let isLoading = false;
let totalStudents = 0;
let fetchedStudents = 0;
let failedStudents = 0;

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
    }
}

function startBDTimeUpdater() {
    updateBDTime();
    if (bdTimeInterval) clearInterval(bdTimeInterval);
    bdTimeInterval = setInterval(updateBDTime, 10000);
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

// -------------------- LOAD DAILY PROBLEM --------------------
async function loadDailyProblem() {
    const container = document.getElementById("dailyProblemContent");
    container.innerHTML = `<div class="loading-spinner" style="width: 30px; height: 30px; border-width: 3px;"></div><p class="text-yellow-300 text-sm">Loading today's problem...</p>`;
    
    try {
        const response = await fetch(`${API_BASE}/api/daily-problem`);
        const data = await response.json();
        
        if (data.status === "OK") {
            const problem = data.problem;
            const tags = problem.tags.map(tag => `<span class="bg-gray-700 px-2 py-1 rounded text-xs">${tag}</span>`).join(' ');
            
            container.innerHTML = `
                <div class="bg-gray-800 p-4 rounded-lg">
                    <h3 class="text-lg font-bold text-blue-300 mb-2">${problem.name}</h3>
                    <div class="flex flex-col sm:flex-row justify-center items-center gap-3 mb-3">
                        <span class="bg-green-600 px-3 py-1 rounded font-bold">Rating: ${problem.rating}</span>
                        <a href="${problem.url}" target="_blank" 
                           class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-bold flex items-center gap-2 text-sm">
                           🔗 Solve Problem
                        </a>
                    </div>
                    <div class="flex flex-wrap gap-2 justify-center mb-3">
                        ${tags}
                    </div>
                    <p class="text-gray-300 text-xs">Problem ID: ${problem.contestId}${problem.index}</p>
                </div>
            `;
        } else {
            container.innerHTML = `<p class="text-red-400 text-sm">Failed to load daily problem.</p>`;
        }
    } catch (error) {
        console.error("Error loading daily problem:", error);
        container.innerHTML = `<p class="text-red-400 text-sm">Error loading daily problem.</p>`;
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
        
        const res = await fetch(`${API_BASE}/api/students/today`);
        const data = await res.json();
        if(data.status !== "OK") throw new Error("Failed to fetch: " + (data.comment || "Unknown error"));

        studentsData = data.result || [];
        fetchedStudents = studentsData.length;
        failedStudents = data.failedHandles?.length || 0;
        
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
        renderWeeklyWinner(weeklyWinner);
        renderLeaderboard(studentsData, "leaderboard");
        renderWeeklyTagWinners(weeklyTagWinners);
        drawWeeklyChart(studentsData);
        updateQuickStats();
        
        // Update cache time
        window.lastCacheTime = Date.now();
        updateStatusPanel("statusLoading", `✅ ${fetched}/${total} students loaded`);
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ✅ Loaded");
        
        // Load contests in background
        setTimeout(() => {
            loadUpcomingContests();
            loadLast3Contests();
        }, 100);

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
    loadStudents();
}

// -------------------- REFRESH WEEKLY CHART --------------------
function refreshWeeklyChart() {
    if (studentsData.length > 0) {
        drawWeeklyChart(studentsData);
        updateStatusPanel("statusGraph", "📈 Weekly Graph: ✅ Refreshed");
    }
}

// -------------------- WEEKLY WINNER --------------------
function renderWeeklyWinner(weeklyWinnerData){
    const container = document.getElementById("weeklyWinner");
    if (weeklyWinnerData && weeklyWinnerData.handle) {
        container.innerHTML = `
            <div class="bg-gradient-to-r from-yellow-600 to-amber-600 p-4 rounded-lg text-center">
                <span class="text-2xl">🏆 Weekly Winner:</span>
                <span class="text-yellow-300 font-bold text-xl">${weeklyWinnerData.handle}</span>
                <p class="text-sm mt-2">Solved ${weeklyWinnerData.daysSolved} days this week with unique problems</p>
                <p class="text-xs text-gray-200 mt-1">(Need at least 5 days with unique solves to win)</p>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="bg-gray-700 p-4 rounded-lg text-center">
                <span class="text-lg">🏆 No weekly winner this week</span>
                <p class="text-sm text-gray-300 mt-2">(Need at least 5 days with unique solves)</p>
            </div>
        `;
    }
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
    <div class="mb-3 bg-gray-800 p-2 rounded">
        <div class="flex justify-between items-center">
            <span class="text-sm text-gray-300">Showing <span class="text-yellow-300">${total}</span> students</span>
            <span class="text-xs text-gray-400">Sorted by: ${currentSort === 'solvedToday' ? 'Solved Today' : 'Rating'}</span>
        </div>
    </div>
    <table class="w-full table-fixed bg-gray-800 rounded-lg text-xs">
    <thead class="bg-gray-700 sticky top-0">
    <tr>
        <th class="w-8 p-2">#</th>
        <th class="p-2">Handle</th>
        <th class="p-2 w-16">Rating</th>
        <th class="p-2 w-20">Rank</th>
        <th class="p-2 w-16">Streak*</th>
        <th class="p-2 w-20">Solved</th>
        <th class="p-2 w-28">Difficulty</th>
        <th class="p-2">Problems Solved</th>
    </tr>
    </thead><tbody>`;

    data.forEach((s,i)=>{
        const colorClass=cfColors[s.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white";
        let medal = s.medal || "";

        // Show up to 3 problems
        const maxProblems = 3;
        let problemsHtml = s.todayProblems && s.todayProblems.length 
            ? s.todayProblems.slice(0, maxProblems).map(p=>`
                <a href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}" 
                   target="_blank" 
                   class="text-blue-400 hover:underline break-words block text-xs mb-1"
                   title="${p.name} (${p.rating}) [${p.tags?.join(', ') || 'No tags'}]">
                   ${p.name.substring(0, 30)}${p.name.length > 30 ? '...' : ''} (${p.rating})
                </a>`).join("") 
            : "<span class='text-gray-500 text-xs'>No solves today</span>";
        
        if (s.todayProblems && s.todayProblems.length > maxProblems) {
            problemsHtml += `<span class="text-gray-400 text-xs block mt-1">+${s.todayProblems.length - maxProblems} more</span>`;
        }

        const diffHtml = `<div class="flex gap-1 flex-wrap justify-center">
            ${s.difficultyCount?.easy?`<div class="w-4 h-4 bg-green-400 rounded-full text-xs flex items-center justify-center text-black" title="Easy: ${s.difficultyCount.easy}">${s.difficultyCount.easy}</div>`:""}
            ${s.difficultyCount?.med1?`<div class="w-4 h-4 bg-lime-400 rounded-full text-xs flex items-center justify-center text-black" title="Medium 1: ${s.difficultyCount.med1}">${s.difficultyCount.med1}</div>`:""}
            ${s.difficultyCount?.med2?`<div class="w-4 h-4 bg-orange-400 rounded-full text-xs flex items-center justify-center text-black" title="Medium 2: ${s.difficultyCount.med2}">${s.difficultyCount.med2}</div>`:""}
            ${s.difficultyCount?.hard?`<div class="w-4 h-4 bg-red-400 rounded-full text-xs flex items-center justify-center text-black" title="Hard: ${s.difficultyCount.hard}">${s.difficultyCount.hard}</div>`:""}
        </div>`;

        html+=`<tr class="border-t border-gray-700 hover:bg-gray-700">
            <td class="text-center p-2">${s.position} ${medal}</td>
            <td class="p-2"><a href="https://codeforces.com/profile/${s.handle}" target="_blank" class="${colorClass} font-bold hover:underline text-sm">${s.handle}</a></td>
            <td class="text-center p-2">${s.rating || 0}</td>
            <td class="text-center p-2">${s.rank || "-"}</td>
            <td class="text-center p-2 ${s.streak > 0 ? 'text-green-400 font-bold' : 'text-gray-400'}">${s.streak || 0} 🔥</td>
            <td class="text-center font-bold text-lg p-2 ${s.solvedToday > 0 ? 'text-green-400' : 'text-gray-400'}">${s.solvedToday || 0}</td>
            <td class="p-2">${diffHtml}</td>
            <td class="break-words p-2">${problemsHtml}</td>
        </tr>`;
    });

    html += `</tbody></table>
    <div class="mt-3 bg-gray-800 p-3 rounded text-xs">
        <p>* Streak counts days with <span class="text-green-400">unique problem solves only</span> (duplicates filtered)</p>
        <p>✅ Showing <span class="text-yellow-300">${data.length}</span> out of <span class="text-green-400">${totalStudents}</span> total students</p>
        ${failedStudents > 0 ? `<p class="text-red-400">⚠️ ${failedStudents} students failed to load (Codeforces API issue)</p>` : ''}
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

function clearSearch() {
    document.getElementById("handleSearch").value = '';
    const containerId = currentDayOffset > 0 ? "previousLeaderboard" : "leaderboard";
    renderLeaderboard(studentsData, containerId);
}

// -------------------- WEEKLY CHART --------------------
function drawWeeklyChart(data, selectedHandle=null){
    const ctx=document.getElementById('weeklyChart').getContext('2d');
    if(weeklyChartInstance) weeklyChartInstance.destroy();

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
    
    if (selectedHandle) {
        // Show specific handle
        const student = data.find(s => s.handle === selectedHandle);
        if (student && student.weeklySolves) {
            datasets.push({
                label: student.handle,
                data: labels.map(d => student.weeklySolves[d] || 0),
                borderWidth: 3,
                fill: false,
                tension: 0.4,
                borderColor: '#3B82F6',
                backgroundColor: '#3B82F6',
                pointRadius: 4,
                pointHoverRadius: 6
            });
        }
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
                        color: 'white',
                        font: { size: 11 },
                        usePointStyle: true,
                        boxWidth: 10,
                        padding: 15
                    },
                    position: 'top',
                    align: 'center',
                    maxHeight: 100,
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
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
                    color: 'white',
                    font: { size: 14, weight: 'bold' }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { 
                        color: 'white', 
                        stepSize: 1, 
                        font: { size: 11 },
                        precision: 0
                    },
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    title: {
                        display: true,
                        text: 'Unique Problems Solved',
                        color: 'white',
                        font: { size: 12, weight: 'bold' }
                    }
                },
                x: {
                    ticks: { 
                        color: 'white', 
                        maxRotation: 45, 
                        font: { size: 10 } 
                    },
                    grid: { 
                        color: 'rgba(255, 255, 255, 0.1)',
                        drawBorder: false
                    },
                    title: {
                        display: true,
                        text: 'Date (Bangladesh Time)',
                        color: 'white',
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
            <div class="${bgClass} rounded p-3 contest-card">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div class="flex-1">
                        <a href="${c.url}" target="_blank" 
                           class="hover:underline font-bold text-sm md:text-base">
                           ${c.name} ${c.isLive?"🔥 LIVE":c.isSoon?"⏰ Soon":""}
                        </a>
                        <div class="flex flex-wrap gap-2 mt-1 text-xs">
                            <span class="bg-gray-800 px-2 py-1 rounded">🕒 ${c.startTime} (BD)</span>
                            <span class="bg-gray-800 px-2 py-1 rounded">⏱ ${c.duration}</span>
                        </div>
                    </div>
                    <a href="${c.url}" target="_blank" 
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

// -------------------- FEEDBACK FORM --------------------
document.addEventListener('DOMContentLoaded', function() {
    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const message = document.getElementById('message').value.trim();
            const feedbackMessage = document.getElementById('feedbackMessage');
            
            if (message.length < 10) {
                feedbackMessage.textContent = "Message must be at least 10 characters long.";
                feedbackMessage.className = "text-red-400 text-sm";
                feedbackMessage.classList.remove('hidden');
                return;
            }
            
            const submitBtn = feedbackForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = '<span class="text-sm">Sending...</span>';
            submitBtn.disabled = true;
            
            try {
                const response = await fetch(`${API_BASE}/api/feedback`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, message })
                });
                
                const data = await response.json();
                
                if (data.status === "OK") {
                    feedbackMessage.textContent = data.comment;
                    feedbackMessage.className = "text-green-400 text-sm";
                    
                    feedbackForm.reset();
                    
                    setTimeout(() => {
                        feedbackMessage.classList.add('hidden');
                    }, 5000);
                } else {
                    feedbackMessage.textContent = data.comment || "Failed to send feedback.";
                    feedbackMessage.className = "text-red-400 text-sm";
                }
            } catch (error) {
                console.error("Error submitting feedback:", error);
                feedbackMessage.textContent = "Network error. Please try again.";
                feedbackMessage.className = "text-red-400 text-sm";
            } finally {
                feedbackMessage.classList.remove('hidden');
                submitBtn.innerHTML = originalText;
                submitBtn.disabled = false;
            }
        });
    }
});

// -------------------- INITIAL LOAD --------------------
document.addEventListener('DOMContentLoaded', async function() {
    startBDTimeUpdater();
    
    // Initialize status
    updateStatusPanel();
    
    // Load student count first
    totalStudents = await loadStudentCount();
    
    // Load daily problem
    loadDailyProblem();
    
    // Load main data
    if (totalStudents > 0) {
        setTimeout(() => {
            loadStudents();
        }, 500);
    } else {
        // Show error if no students
        document.getElementById("leaderboard").innerHTML = `
            <div class="text-center py-8">
                <p class="text-red-400 text-lg">❌ No students found</p>
                <p class="text-gray-300 text-sm mt-2">Please check students.json file</p>
                <button onclick="location.reload()" class="refresh-btn mt-4">
                    🔄 Reload Page
                </button>
            </div>
        `;
        updateStatusPanel("statusLoading", "❌ No students found", "error");
    }
    
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
});
