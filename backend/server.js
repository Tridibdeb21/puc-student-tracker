require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch"); // node-fetch v2
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

// -------------------- CACHE --------------------
let CACHE = {}; // { today: { result, weeklyTagWinners, weeklyWinner }, dayOffset: {...} }
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
let CACHE_TIME = 0;

// -------------------- HELPERS --------------------
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function getBDDate(tsSeconds) {
    const bdTime = new Date((tsSeconds + 6 * 3600) * 1000);
    return bdTime.toISOString().split("T")[0];
}

function getStudents() {
    const raw = fs.readFileSync("students.json", "utf-8");
    return JSON.parse(raw).students;
}

// Weekly winner based on days solved >=5, pick highest rating if tie
function getWeeklyWinner(results) {
    const weeklySolvesMap = {};
    for (let s of results) {
        const daysSolved = Object.values(s.weeklySolves).filter(v => v > 0).length;
        weeklySolvesMap[s.handle] = { daysSolved, rating: s.rating || 0 };
    }
    const candidates = Object.entries(weeklySolvesMap).filter(([h, val]) => val.daysSolved >= 5);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b[1].rating - a[1].rating);
    return candidates[0][0];
}

// -------------------- STUDENTS DATA FETCH --------------------
async function fetchStudentData(dayOffset = 0) {
    const students = getStudents();
    const results = [];
    const weeklyTagMap = {};

    for (let handle of students) {
        await sleep(300);
        try {
            const [userRes, subRes] = await Promise.all([
                fetch(`https://codeforces.com/api/user.info?handles=${handle}`).then(r => r.json()),
                fetch(`https://codeforces.com/api/user.status?handle=${handle}&count=1000`).then(r => r.json())
            ]);

            if (userRes.status !== "OK" || subRes.status !== "OK") continue;

            const u = userRes.result[0];
            const subs = subRes.result;

            // Determine target date
            const targetDate = new Date();
            targetDate.setHours(targetDate.getHours() + 6);
            targetDate.setDate(targetDate.getDate() - dayOffset);
            const targetStr = targetDate.toISOString().split("T")[0];

            // Today's submissions
            const targetSubs = subs.filter(s => s.verdict === "OK" && getBDDate(s.creationTimeSeconds) === targetStr);

            // Keep only first-time solves ever
            const todayProblems = [];
            const seenToday = new Set();
            for (let s of targetSubs) {
                const key = `${s.problem.contestId}-${s.problem.index}`;
                if (!seenToday.has(key)) {
                    const solvedBefore = subs.filter(sub => sub.verdict === "OK" && getBDDate(sub.creationTimeSeconds) < targetStr)
                                             .some(sub => `${sub.problem.contestId}-${sub.problem.index}` === key);
                    if (!solvedBefore) {
                        todayProblems.push({
                            name: s.problem.name,
                            rating: s.problem.rating || "-",
                            contestId: s.problem.contestId,
                            index: s.problem.index,
                            tags: s.problem.tags || []
                        });
                        seenToday.add(key);
                    }
                }
            }

            const solvedToday = todayProblems.length;

            // Difficulty count
            const difficultyCount = { easy: 0, med1: 0, med2: 0, hard: 0 };
            for (let p of todayProblems) {
                if (p.rating === "-") continue;
                if (p.rating < 1200) difficultyCount.easy++;
                else if (p.rating < 1400) difficultyCount.med1++;
                else if (p.rating < 1600) difficultyCount.med2++;
                else difficultyCount.hard++;
            }

            // streak for target day
            const solvedSubs = subs.filter(s => s.verdict === "OK");
            const solvedDates = new Set(solvedSubs.map(s => getBDDate(s.creationTimeSeconds)));
            let streak = 0;
            let checkDate = new Date(targetDate);
            while (true) {
                const d = checkDate.toISOString().split("T")[0];
                if (solvedDates.has(d)) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else break;
            }

            // weekly solves and weekly tag count
            const weeklySolves = {};
            const weeklyTagCount = {};
            for (let i = 0; i < 7; i++) {
                const d = new Date(targetDate);
                d.setDate(d.getDate() - i);
                const ds = d.toISOString().split("T")[0];
                const daySubs = solvedSubs.filter(s => getBDDate(s.creationTimeSeconds) === ds);
                weeklySolves[ds] = daySubs.length;
                for (let s of daySubs) {
                    for (let t of s.problem.tags || []) {
                        weeklyTagCount[t] = (weeklyTagCount[t] || 0) + 1;
                        if (!weeklyTagMap[t]) weeklyTagMap[t] = {};
                        weeklyTagMap[t][handle] = (weeklyTagMap[t][handle] || 0) + 1;
                    }
                }
            }

            results.push({
                handle: u.handle,
                rating: u.rating || 0,
                maxRating: u.maxRating || u.rating || 0,
                rank: u.rank || "-",
                solvedToday,
                todayProblems,
                difficultyCount,
                streak,
                weeklySolves,
                weeklyTagCount
            });
        } catch (err) {
            console.error(err);
        }
    }

    // weekly tag winners
    const weeklyTagWinners = {};
    for (let tag in weeklyTagMap) {
        let max = 0, winner = null;
        for (let h in weeklyTagMap[tag]) {
            const cnt = weeklyTagMap[tag][h];
            const rating = results.find(s => s.handle === h)?.rating || 0;
            if (cnt > max || (cnt === max && rating > (results.find(s => s.handle === winner)?.rating || 0))) {
                max = cnt;
                winner = h;
            }
        }
        weeklyTagWinners[tag] = { winner, count: max };
    }

    const weeklyWinner = getWeeklyWinner(results);

    // Sort results: solvedToday DESC, rating ASC
    results.sort((a, b) => b.solvedToday - a.solvedToday || (a.rating - b.rating));
    results.forEach((s, i) => {
        s.position = i + 1;
        s.medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
    });

    return { result: results, weeklyTagWinners, weeklyWinner };
}

// -------------------- ROUTES --------------------
app.get("/api/students/today", async (req, res) => {
    try {
        const now = Date.now();
        if (CACHE.today && now - CACHE_TIME < CACHE_TTL) return res.json(CACHE.today);

        const data = await fetchStudentData(0);
        CACHE.today = { status: "OK", ...data };
        CACHE_TIME = now;
        res.json({ status: "OK", ...data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "FAILED", comment: "Codeforces unavailable" });
    }
});

app.get("/api/students/day/:dayOffset", async (req, res) => {
    const dayOffset = parseInt(req.params.dayOffset);
    if (isNaN(dayOffset) || dayOffset < 1 || dayOffset > 7) {
        return res.status(400).json({ status: "FAILED", comment: "dayOffset must be 1-7" });
    }
    try {
        const now = Date.now();
        if (CACHE[dayOffset] && now - CACHE_TIME < CACHE_TTL) return res.json(CACHE[dayOffset]);

        const data = await fetchStudentData(dayOffset);
        CACHE[dayOffset] = { status: "OK", ...data };
        CACHE_TIME = now;
        res.json({ status: "OK", ...data });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "FAILED", comment: "Codeforces unavailable" });
    }
});

// Upcoming contests
app.get("/api/contests/upcoming", async (req, res) => {
    try {
        const cfRes = await fetch("https://codeforces.com/api/contest.list?gym=false").then(r => r.json());
        if (cfRes.status !== "OK") throw new Error("CF API failed");

        const now = Date.now();
        let contests = cfRes.result
            .filter(c => c.phase === "BEFORE" || c.phase === "CODING")
            .map(c => {
                const startTS = c.startTimeSeconds * 1000;
                const durMS = c.durationSeconds * 1000;
                const endTS = startTS + durMS;
                const start = new Date(startTS).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
                const durH = Math.floor(c.durationSeconds / 3600);
                const durM = Math.floor((c.durationSeconds % 3600) / 60);
                const isLive = now >= startTS && now <= endTS;
                const isSoon = !isLive && (startTS - now) <= 24 * 60 * 60 * 1000;
                return { id: c.id, name: c.name, startTime: start, duration: `${durH}h ${durM}m`, url: `https://codeforces.com/contest/${c.id}`, isLive, isSoon };
            });

        contests.sort((a,b)=>{
            if(a.isLive && !b.isLive) return -1;
            if(!a.isLive && b.isLive) return 1;
            if(a.isSoon && !b.isSoon) return -1;
            if(!a.isSoon && b.isSoon) return 1;
            return new Date(a.startTime) - new Date(b.startTime);
        });

        res.json({ status: "OK", contests });
    } catch(err) {
        console.error(err);
        res.status(500).json({ status: "FAILED", contests: [] });
    }
});

// Last 3 contest standings
app.get("/api/contests/last-3-standings", async (req, res) => {
    try {
        const cfRes = await fetch("https://codeforces.com/api/contest.list?gym=false").then(r => r.json());
        if(cfRes.status !== "OK") throw new Error("CF API failed");

        const last3 = cfRes.result.filter(c => c.phase==="FINISHED").sort((a,b)=>b.startTimeSeconds - a.startTimeSeconds).slice(0,3);
        const students = getStudents();
        const standings = [];

        for(let contest of last3){
            const result=[];
            for(let handle of students){
                try{
                    const ratingRes = await fetch(`https://codeforces.com/api/user.rating?handle=${handle}`).then(r=>r.json());
                    if(ratingRes.status!=="OK") continue;
                    const contestData = ratingRes.result.find(c=>c.contestId===contest.id);
                    if(!contestData){
                        result.push({ handle, standing: "boro vai contest den nai kno?", ratingChange: "—" });
                    } else {
                        const change = contestData.newRating - contestData.oldRating;
                        result.push({ handle, standing: contestData.rank, ratingChange: change });
                    }
                } catch(e){
                    result.push({ handle, standing: "boro vai contest den nai kno?", ratingChange: "—" });
                }
            }

            result.sort((a,b)=>{
                if(a.standing==="boro vai contest den nai kno?") return 1;
                if(b.standing==="boro vai contest den nai kno?") return -1;
                return a.standing - b.standing;
            });

            standings.push({ contestId: contest.id, name: contest.name, participants: result });
        }

        res.json({ status: "OK", contests: standings });
    } catch(err){
        console.error(err);
        res.status(500).json({ status: "FAILED", contests: [] });
    }
});

// -------------------- SERVER --------------------
app.listen(3000, () => {
    console.log("✅ Backend running at http://localhost:3000");
});

