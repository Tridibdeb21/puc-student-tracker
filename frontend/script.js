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

async function loadStudents(sortBy = currentSort) {
    currentSort = sortBy;

    const leaderboard = document.getElementById("leaderboard");
    leaderboard.innerHTML = `
<table class="min-w-full table-auto bg-gray-800 rounded-lg">
    <thead class="bg-gray-700">
        <tr>
            <th class="px-6 py-3 min-w-[50px]">#</th>
            <th class="px-6 py-3 min-w-[120px]">Handle</th>
            <th class="px-6 py-3 min-w-[80px]">Rating</th>
            <th class="px-6 py-3 min-w-[120px]">Rank</th>
            <th class="px-6 py-3 min-w-[80px]">Streak</th>
            <th class="px-6 py-3 min-w-[120px]">Solved Today</th>
            <th class="px-6 py-3 min-w-[150px]">Difficulty</th>
            <th class="px-6 py-3 min-w-[250px]">Problems Solved Today</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td colspan="8" class="text-center text-yellow-300 py-8">Loading leaderboard... ⏳</td>
        </tr>
    </tbody>
</table>
`;

    try {
        const res = await fetch("https://puc-student-tracker.onrender.com/api/students/today");
        const data = await res.json();
        if (data.status !== "OK") throw new Error("Failed to fetch");

        studentsData = data.result;
        const weeklyTagWinners = data.weeklyTagWinners || {};
        const weeklyWinner = data.weeklyWinner;

        // SORT
        if (sortBy === "solvedToday") {
            studentsData.sort((a, b) => b.solvedToday - a.solvedToday || (a.rating || 0) - (b.rating || 0));
        } else if (sortBy === "rating") {
            studentsData.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        }

        // MEDALS
        const medals = ["🥇","🥈","🥉"];
        studentsData.forEach((s,i)=>s.medal=i<3?medals[i]:"");

        // RENDER WEEKLY WINNER
        renderWeeklyWinner(weeklyWinner);

        // RENDER LEADERBOARD
        renderLeaderboard(studentsData);

        // RENDER WEEKLY TAG WINNERS
        renderWeeklyTagWinners(weeklyTagWinners);

        // RENDER CHART
        drawWeeklyChart(studentsData);

    } catch (err) {
        console.error(err);
        leaderboard.innerHTML = "<p class='text-center text-red-400 py-4'>❌ Error fetching data</p>";
    }
}

// -------------------- WEEKLY WINNER --------------------
function renderWeeklyWinner(handle) {
    const container = document.getElementById("weeklyWinner");
    if (!container) {
        const div = document.createElement("div");
        div.id = "weeklyWinner";
        div.className = "mb-6 text-center text-2xl font-bold text-yellow-300";
        div.innerHTML = handle ? `🏆 Weekly Winner: ${handle}` : "No weekly winner this week";
        document.querySelector(".max-w-6xl").prepend(div);
    } else {
        container.innerHTML = handle ? `🏆 Weekly Winner: ${handle}` : "No weekly winner this week";
    }
}

// -------------------- LEADERBOARD --------------------
function renderLeaderboard(data) {
    let html = `
<table class="w-full table-fixed bg-gray-800 rounded-lg text-sm md:text-base">
    <thead class="bg-gray-700">
        <tr>
        <th class="w-[3%] px-1 py-2">#</th>
        <th class="w-[12%] px-1 py-2">Handle</th>
        <th class="w-[7%] px-1 py-2">Rating</th>
        <th class="w-[10%] px-1 py-2">Rank</th>
        <th class="w-[7%] px-1 py-2">Streak</th>
        <th class="w-[10%] px-1 py-2">Solved Today</th>
        <th class="w-[15%] px-1 py-2">Difficulty</th>
        <th class="w-[36%] px-1 py-2">Problems Solved Today</th>
        </tr>
    </thead>
    <tbody>`;

    data.forEach((s,index)=>{
        const colorClass = cfColors[s.rank?.replace(/\s+/g,"_").toLowerCase()]||"text-white";
        const problemsHtml = s.todayProblems.length
            ? s.todayProblems.map(p=>`<a href="https://codeforces.com/problemset/problem/${p.contestId}/${p.index}" target="_blank" class="text-blue-400 hover:underline break-words">${p.name} (${p.rating}) [${p.tags.join(", ")}]</a>`).join("<br>")
            : "-";

       const diffHtml = `<div class="flex gap-1 flex-wrap justify-center">
    ${s.difficultyCount.easy?`<div class="w-4 h-4 bg-green-400 rounded-full flex items-center justify-center text-black text-xs">${s.difficultyCount.easy}</div>`:""}
    ${s.difficultyCount.medium?`<div class="w-4 h-4 bg-orange-400 rounded-full flex items-center justify-center text-black text-xs">${s.difficultyCount.medium}</div>`:""}
    ${s.difficultyCount.hard?`<div class="w-4 h-4 bg-red-400 rounded-full flex items-center justify-center text-black text-xs">${s.difficultyCount.hard}</div>`:""}
</div>`;


        html+=`<tr class="border-t border-gray-700 align-top">
            <td class="px-1 py-2 text-center">${s.medal||index+1}</td>
            <td class="px-1 py-2 break-words"><a href="https://codeforces.com/profile/${s.handle}" target="_blank" class="${colorClass} font-bold hover:underline">${s.handle}</a></td>
            <td class="px-1 py-2 text-center">${s.rating}</td>
            <td class="px-1 py-2 text-center">${s.rank}</td>
            <td class="px-1 py-2 text-center">${s.streak}</td>
            <td class="px-1 py-2 text-center">${s.solvedToday}</td>
            <td class="px-1 py-2">${diffHtml}</td>
            <td class="px-1 py-2 break-words">${problemsHtml}</td>
        </tr>`;
    });

    html+="</tbody></table>";
    document.getElementById("leaderboard").innerHTML = html;
}



// -------------------- WEEKLY TAG WINNERS --------------------
function renderWeeklyTagWinners(winners) {
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
function filterByHandle() {
    const query = document.getElementById("handleSearch").value.trim().toLowerCase();
    if (!query) {
        renderLeaderboard(studentsData); // show all if empty
    } else {
        const filtered = studentsData.filter(s => s.handle.toLowerCase().includes(query));
        renderLeaderboard(filtered);
    }
}

// -------------------- TOGGLE WINNER INFO --------------------
function toggleWinner(card){
    const p=card.querySelector(".winner-info");
    if(p)p.classList.toggle("hidden");
}

// -------------------- WEEKLY CHART --------------------
function drawWeeklyChart(data, onlyMeHandle=null){
    const ctx=document.getElementById('weeklyChart').getContext('2d');
    if(weeklyChartInstance) weeklyChartInstance.destroy();

    const labels=Object.keys(data[0]?.weeklySolves||{}).reverse();
    const datasets=[];

    (onlyMeHandle?data.filter(s=>s.handle===onlyMeHandle):data).forEach(s=>{
        datasets.push({
            label:s.handle,
            data:labels.map(d=>s.weeklySolves[d]),
            borderWidth:2,
            fill:false,
            tension:0.3
        });
    });

    weeklyChartInstance=new Chart(ctx,{
        type:'line',
        data:{labels,datasets},
        options:{
            responsive:true,
            plugins:{legend:{labels:{color:'white'}}},
            scales:{y:{beginAtZero:true,ticks:{color:'white',stepSize:1}},x:{ticks:{color:'white'}}}
        }
    });
}

// -------------------- WEEKLY BUTTONS --------------------
function showAllWeekly(){ drawWeeklyChart(studentsData); }
function showMyWeekly(){ const h=prompt("Enter your handle:")?.trim(); if(!h)return; drawWeeklyChart(studentsData,h); }

// -------------------- UPCOMING CF CONTESTS --------------------
// Load upcoming contests
async function loadUpcomingContests() {
    const container = document.getElementById("upcomingContests");
    container.innerHTML = `<p class="text-yellow-300 text-center">Loading contests... ⏳</p>`;

    try {
        const res = await fetch("https://puc-student-tracker.onrender.com/api/contests/upcoming");
        const data = await res.json();
        if (data.status !== "OK") throw new Error("Failed to fetch contests");

        if (!data.contests.length) {
            container.innerHTML = `<p class="text-yellow-300 text-center">No upcoming contests</p>`;
            return;
        }

        container.innerHTML = "";
       data.contests.forEach(c => {
    const div = document.createElement("div");
    div.className = `p-2 rounded hover:bg-gray-600 ${
        c.isLive ? "bg-red-600 text-white font-bold" : 
        c.isSoon ? "bg-yellow-700 text-black font-bold" : 
        "bg-gray-700"
    }`;
    div.innerHTML = `
        <a href="${c.url}" target="_blank" class="hover:underline">${c.name}</a>
        <p class="text-sm">🕒 ${c.startTime} | ⏱ ${c.duration} ${c.isLive ? " (LIVE!)" : ""}</p>
    `;
    container.appendChild(div);
});


    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="text-red-400 text-center">❌ Unable to load contests</p>`;
    }
}



// -------------------- INITIAL LOAD --------------------
loadStudents();
loadUpcomingContests();
