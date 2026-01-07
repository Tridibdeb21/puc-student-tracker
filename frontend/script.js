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
let weeklyChartInstance;

// -------------------- NAVIGATION --------------------
function scrollToSection(id){
    document.getElementById(id).scrollIntoView({behavior:"smooth"});
}

// -------------------- LOAD STUDENTS --------------------
async function loadStudents(sortBy = currentSort) {
    currentSort = sortBy;

    const leaderboard = document.getElementById("leaderboard");
    leaderboard.innerHTML = `<p class="text-center text-yellow-300 py-4">Loading leaderboard... ⏳</p>`;

    try {
        const res = await fetch(`${API_BASE}/api/students/today`);
        const data = await res.json();
        if (data.status !== "OK") throw new Error("Failed to fetch");

        studentsData = data.result;
        const weeklyTagWinners = data.weeklyTagWinners || {};
        const weeklyWinner = data.weeklyWinner;

        // SORT
        if (sortBy === "solvedToday") {
            studentsData.sort((a,b)=>b.solvedToday - a.solvedToday || (a.rating||0) - (b.rating||0));
        } else if(sortBy==="rating"){
            studentsData.sort((a,b)=>(b.rating||0)-(a.rating||0));
        }

        // MEDALS (lower rating wins tie)
        const medals=["🥇","🥈","🥉"];
        studentsData.forEach((s,i)=>{
            s.medal = "";
        });
        for(let i=0;i<studentsData.length;i++){
            if(i<3) studentsData[i].medal = medals[i];
        }

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

// -------------------- WEEKLY WINNER --------------------
function renderWeeklyWinner(handle){
    const container=document.getElementById("weeklyWinner");
    container.innerHTML = handle ? `🏆 Weekly Winner: ${handle}` : "No weekly winner this week";
}

// -------------------- LEADERBOARD --------------------
function renderLeaderboard(data){
    let html = `<table class="w-full table-fixed bg-gray-800 rounded-lg text-sm md:text-base">
    <thead class="bg-gray-700">
    <tr>
        <th>#</th><th>Handle</th><th>Rating</th><th>MaxRating</th><th>Rank</th><th>Streak</th><th>Solved Today</th><th>Difficulty</th><th>Problems Solved Today</th>
    </tr>
    </thead><tbody>`;

    data.forEach((s,index)=>{
        const colorClass=cfColors[s.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white";
        const problemsHtml = s.todayProblems.length ? s.todayProblems.map(p=>`<a href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}" target="_blank" class="text-blue-400 hover:underline break-words">${p.name} (${p.rating}) [${p.tags.join(', ')}]</a>`).join("<br>") : "-";

        const diffHtml = `<div class="flex gap-1 flex-wrap justify-center">
            ${s.difficultyCount.easy?`<div class="w-4 h-4 bg-green-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.easy}</div>`:""}
            ${s.difficultyCount.med1?`<div class="w-4 h-4 bg-lime-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.med1}</div>`:""}
            ${s.difficultyCount.med2?`<div class="w-4 h-4 bg-orange-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.med2}</div>`:""}
            ${s.difficultyCount.hard?`<div class="w-4 h-4 bg-red-400 rounded-full text-xs flex items-center justify-center text-black">${s.difficultyCount.hard}</div>`:""}
        </div>`;

        html+=`<tr class="border-t border-gray-700">
            <td class="text-center">${s.medal||index+1}</td>
            <td><a href="https://codeforces.com/profile/${s.handle}" target="_blank" class="${colorClass} font-bold hover:underline">${s.handle}</a></td>
            <td class="text-center">${s.rating}</td>
            <td class="text-center">${s.maxRating}</td>
            <td class="text-center">${s.rank}</td>
            <td class="text-center">${s.streak}</td>
            <td class="text-center">${s.solvedToday}</td>
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

        container.innerHTML=`<h2 class="text-2xl font-bold mb-4 text-center text-yellow-300">🏆 Last 3 CF Contests Standings</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">`;

        data.contests.forEach(contest=>{
            let table=`<div class="bg-gray-700 p-4 rounded overflow-x-auto">
            <h3 class="text-lg font-bold mb-2 text-center text-blue-400">${contest.name}</h3>
            <table class="w-full text-sm text-center">
            <thead><tr><th>Handle</th><th>Standing</th><th>Rating Δ</th></tr></thead><tbody>`;

            contest.participants.forEach(p=>{
                const color=p.ratingChange>0?"text-green-400":p.ratingChange<0?"text-red-400":"text-gray-300";
                table+=`<tr>
                    <td><a href="https://codeforces.com/profile/${p.handle}" target="_blank" class="${cfColors[p.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white"} font-bold hover:underline">${p.handle}</a></td>
                    <td>${p.standing}</td>
                    <td class="${color} font-bold">${p.ratingChange!=="—"?p.ratingChange:"—"}</td>
                </tr>`;
            });
            table+="</tbody></table></div>";
            container.innerHTML+=table;
        });

        container.innerHTML+="</div>";
    }catch(err){
        console.error(err);
        container.innerHTML=`<p class="text-red-400 text-center">❌ Unable to load last 3 contests standings</p>`;
    }
}

// -------------------- INITIAL LOAD --------------------
loadStudents();
