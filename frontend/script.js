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

// -------------------- NAVIGATION --------------------
function scrollToSection(id){
    document.getElementById(id).scrollIntoView({behavior:"smooth"});
}

// -------------------- LOAD STUDENTS --------------------
async function loadStudents(sortBy=currentSort){
    currentSort = sortBy;
    const leaderboard = document.getElementById("leaderboard");
    leaderboard.innerHTML = `<p class="text-center text-yellow-300 py-4">Loading leaderboard... ⏳</p>`;

    try{
        const res = await fetch(`${API_BASE}/api/students/today`);
        const data = await res.json();
        if(data.status!=="OK") throw new Error("Failed to fetch");

        studentsData = data.result;
        const weeklyTagWinners = data.weeklyTagWinners || {};
        const weeklyWinner = data.weeklyWinner;

        // ---------------- SORT ----------------
        if(sortBy==="solvedToday"){
            // Sort by problems solved today descending, then rating ascending
            studentsData.sort((a,b)=>{
                if(b.solvedToday !== a.solvedToday) return b.solvedToday - a.solvedToday;
                return (a.rating || 0) - (b.rating || 0);
            });
        } else if(sortBy==="rating"){
            studentsData.sort((a,b)=>(b.rating||0)-(a.rating||0));
        }

        // POSITION
        studentsData.forEach((s,i)=>s.position=i+1);

        renderWeeklyWinner(weeklyWinner);
        renderLeaderboard(studentsData);
        renderWeeklyTagWinners(weeklyTagWinners);
        drawWeeklyChart(studentsData);
        loadLast3Contests();
        loadUpcomingContests();

    } catch(err){
        console.error(err);
        leaderboard.innerHTML = "<p class='text-center text-red-400 py-4'>❌ Error fetching data</p>";
    }
}

// -------------------- LOAD PREVIOUS DAYS --------------------
async function loadPreviousDay(dayOffset){
    const leaderboard = document.getElementById("leaderboard");
    leaderboard.innerHTML = `<p class="text-center text-yellow-300 py-4">Loading previous day leaderboard... ⏳</p>`;
    try{
        const res = await fetch(`${API_BASE}/api/students/day/${dayOffset}`);
        const data = await res.json();
        if(data.status!=="OK") throw new Error("Failed to fetch");

        studentsData = data.result;
        studentsData.forEach((s,i)=>s.position=i+1);
        renderLeaderboard(studentsData);

    }catch(err){
        console.error(err);
        leaderboard.innerHTML = "<p class='text-center text-red-400 py-4'>❌ Error fetching data</p>";
    }
}

// -------------------- WEEKLY WINNER --------------------
function renderWeeklyWinner(handle){
    const container=document.getElementById("weeklyWinner");
    container.innerHTML = handle ? `🏆 Weekly Winner: ${handle}` : "No weekly winner this week";
}

// -------------------- LEADERBOARD --------------------
function renderLeaderboard(data){
    let html = `<table class="w-full table-fixed bg-gray-800 rounded-lg text-sm md:text-base min-w-[1000px]">
    <thead class="bg-gray-700">
    <tr>
        <th class="w-10">Pos</th>
        <th>Handle</th>
        <th>Rating</th>
        <th>MaxRating</th>
        <th>Rank</th>
        <th>Streak</th>
        <th class="w-36">Solved Today</th> <!-- Increased size -->
        <th>Difficulty</th>
        <th class="w-72">Problems Solved Today</th> <!-- Increased size -->
    </tr>
    </thead><tbody>`;

    data.forEach((s,i)=>{
        const colorClass=cfColors[s.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white";

        // Medals
        let medal = "";
        if(i===0) medal="🥇";
        else if(i===1) medal="🥈";
        else if(i===2) medal="🥉";

        const problemsHtml = s.todayProblems.length 
            ? s.todayProblems.map(p=>`<a href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}" target="_blank" class="text-blue-400 hover:underline break-words">${p.name} (${p.rating}) [${p.tags.join(', ')}]</a>`).join("<br>") 
            : "-";

        const diffHtml = `<div class="flex gap-1 flex-wrap justify-center">
            ${s.difficultyCount.easy?`<div class="w-4 h-4 bg-green-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.easy}</div>`:""}
            ${s.difficultyCount.med1?`<div class="w-4 h-4 bg-lime-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.med1}</div>`:""}
            ${s.difficultyCount.med2?`<div class="w-4 h-4 bg-orange-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.med2}</div>`:""}
            ${s.difficultyCount.hard?`<div class="w-4 h-4 bg-red-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.hard}</div>`:""}
        </div>`;

        html+=`<tr class="border-t border-gray-700">
            <td class="text-center">${s.position} ${medal}</td>
            <td><a href="https://codeforces.com/profile/${s.handle}" target="_blank" class="${colorClass} font-bold hover:underline">${s.handle}</a></td>
            <td class="text-center">${s.rating}</td>
            <td class="text-center">${s.maxRating}</td>
            <td class="text-center">${s.rank}</td>
            <td class="text-center">${s.streak}</td>
            <td class="text-center font-bold">${s.solvedToday}</td>
            <td>${diffHtml}</td>
            <td class="break-words">${problemsHtml}</td>
        </tr>`;
    });

    html+="</tbody></table>";
    document.getElementById("leaderboard").innerHTML=html;
}

// -------------------- WEEKLY TAG WINNERS --------------------
function renderWeeklyTagWinners(winners){
    let html=`<h2 class="text-2xl font-bold mb-4 text-center">🏆 Weekly Tag Winners</h2>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">`;
    for(let tag in winners){
        const w=winners[tag];
        html+=`<div class="bg-gray-700 rounded p-4 cursor-pointer hover:bg-gray-600 tag-card" onclick="toggleWinner(this)">
            <h3 class="font-bold text-white text-lg mb-1">${tag}</h3>
            <p class="mt-1 text-yellow-300 winner-info">Winner: ${w.winner} (${w.count})</p>
        </div>`;
    }
    html+="</div>";
    document.getElementById("weeklyTagWinners").innerHTML=html;
}

// -------------------- HANDLE SEARCH --------------------
function filterByHandle(){
    const query=document.getElementById("handleSearch").value.trim().toLowerCase();
    if(!query){
        renderLeaderboard(studentsData);
    } else {
        const filtered=studentsData.filter(s=>s.handle.toLowerCase().includes(query));
        renderLeaderboard(filtered);
    }
}

// -------------------- TOGGLE WINNER --------------------
function toggleWinner(card){
    const p=card.querySelector(".winner-info");
    if(p)p.classList.toggle("hidden");
}

// -------------------- WEEKLY CHART --------------------
function drawWeeklyChart(data, selectedHandle=null){
    const ctx=document.getElementById('weeklyChart').getContext('2d');
    if(weeklyChartInstance) weeklyChartInstance.destroy();

    const labels=Object.keys(data[0]?.weeklySolves||{}).reverse();
    const datasets=[];
    data.forEach(s=>{
        const show = !selectedHandle || s.handle === selectedHandle;
        datasets.push({
            label:s.handle,
            data:labels.map(d=>s.weeklySolves[d]),
            borderWidth:2,
            fill:false,
            tension:0.3,
            hidden: !show
        });
    });

    weeklyChartInstance=new Chart(ctx,{
        type:'line',
        data:{labels,datasets},
        options:{responsive:true,plugins:{legend:{labels:{color:'white'}}},scales:{y:{beginAtZero:true,ticks:{color:'white',stepSize:1}},x:{ticks:{color:'white'}}}}
    });
}

function showAllWeekly(){ drawWeeklyChart(studentsData); }
function selectWeeklyHandle(){
    const h=prompt("Enter handle:")?.trim(); if(!h) return;
    drawWeeklyChart(studentsData,h);
}

// -------------------- UPCOMING CONTESTS --------------------
async function loadUpcomingContests(){
    const container=document.getElementById("upcomingContests");
    container.innerHTML=`<p class="text-yellow-300 text-center">Loading contests... ⏳</p>`;
    try{
        const res=await fetch(`${API_BASE}/api/contests/upcoming`);
        const data=await res.json();
        if(data.status!=="OK") throw new Error("Failed");

        if(!data.contests.length){
            container.innerHTML=`<p class="text-yellow-300 text-center">No upcoming contests</p>`;
            return;
        }

        container.innerHTML="";
        data.contests.forEach(c=>{
            const div=document.createElement("div");
            div.className=`p-2 rounded hover:bg-gray-600 ${c.isLive?"bg-red-600 font-bold":c.isSoon?"bg-yellow-700 text-black font-bold":"bg-gray-700"}`;
            div.innerHTML=`<a href="${c.url}" target="_blank" class="hover:underline">${c.name} ${c.isLive?"🔥 LIVE":""}</a>
                <p class="text-sm">🕒 ${c.startTime} | ⏱ ${c.duration}</p>`;
            container.appendChild(div);
        });

    }catch(err){
        console.error(err);
        container.innerHTML=`<p class="text-red-400 text-center">❌ Unable to load contests</p>`;
    }
}

// -------------------- LAST 3 CONTESTS --------------------
async function loadLast3Contests(){
    const container=document.getElementById("last3Contests");
    container.innerHTML=`<p class="text-yellow-300 text-center">Loading last 3 contests standings... ⏳</p>`;
    try{
        const res=await fetch(`${API_BASE}/api/contests/last-3-standings`);
        const data=await res.json();
        if(data.status!=="OK") throw new Error("Failed");

        let html=`<h2 class="text-2xl font-bold mb-4 text-center">🏁 Last 3 Contests Standings</h2>`;
        data.contests.forEach(c=>{
            html+=`<h3 class="text-xl font-bold mt-2 mb-1 text-center">${c.name}</h3>`;
            html+=`<table class="w-full table-fixed bg-gray-800 rounded-lg text-sm md:text-base mb-4">
            <thead class="bg-gray-700"><tr>
            <th>Pos</th><th>Handle</th><th>Standing</th><th>Rating Change</th></tr></thead><tbody>`;
            c.participants.forEach((p,i)=>{
                const rc=p.ratingChange;
                let rcSymbol="";
                if(rc!=="—"){
                    rcSymbol = rc>0 ? `<span class="text-green-400 font-bold">+${rc}</span>` : `<span class="text-red-400 font-bold">${rc}</span>`;
                }
                html+=`<tr class="border-t border-gray-700">
                    <td class="text-center">${i+1}</td>
                    <td><a href="https://codeforces.com/profile/${p.handle}" target="_blank" class="text-blue-400 hover:underline">${p.handle}</a></td>
                    <td class="text-center">${p.standing}</td>
                    <td class="text-center">${rcSymbol}</td>
                </tr>`;
            });
            html+="</tbody></table>";
        });
        container.innerHTML=html;

    }catch(err){
        console.error(err);
        container.innerHTML=`<p class="text-red-400 text-center">❌ Unable to load last 3 contests</p>`;
    }
}

// -------------------- INITIAL LOAD --------------------
loadStudents();
