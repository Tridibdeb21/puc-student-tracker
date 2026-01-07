require("dotenv").config();
const express = require("express");
const axios = require("axios");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

/* ================= CACHE ================= */
let CACHE = null;
let CACHE_TIME = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/* ================= HELPERS ================= */
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

/* ================= WEEKLY WINNER ================= */
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

/* ================= MAIN API ================= */
app.get("/api/students/today", async (req, res) => {
    if (CACHE && Date.now() - CACHE_TIME < CACHE_TTL) {
        return res.json(CACHE);
    }

    try {
        const students = getStudents();
        const results = [];
        const weeklyTagMap = {};

        for (let handle of students) {
            await sleep(300);

            const [userRes, subRes] = await Promise.all([
                axios.get(`https://codeforces.com/api/user.info?handles=${handle}`),
                axios.get(`https://codeforces.com/api/user.status?handle=${handle}&count=500`)
            ]);

            if (userRes.data.status !== "OK" || subRes.data.status !== "OK") continue;

            const u = userRes.data.result[0];
            const subs = subRes.data.result;

            // Today
            const today = new Date();
            today.setHours(today.getHours() + 6);
            const todayStr = today.toISOString().split("T")[0];

            const todaySubs = subs.filter(
                s => s.verdict === "OK" && getBDDate(s.creationTimeSeconds) === todayStr
            );

            const todayProblems = todaySubs.map(s => ({
                name: s.problem.name,
                rating: s.problem.rating || "-",
                contestId: s.problem.contestId,
                index: s.problem.index,
                tags: s.problem.tags || []
            }));

            const solvedToday = todayProblems.length;

            let difficultyCount = { easy: 0, med1: 0, med2: 0, hard: 0 };
            for (let p of todayProblems) {
                if (p.rating === "-") continue;
                if (p.rating < 1200) difficultyCount.easy++;
                else if (p.rating < 1400) difficultyCount.med1++;
                else if (p.rating < 1600) difficultyCount.med2++;
                else difficultyCount.hard++;
            }

            // Streak
            const solvedSubs = subs.filter(s => s.verdict === "OK");
            const solvedDates = new Set(solvedSubs.map(s => getBDDate(s.creationTimeSeconds)));
            let streak = 0;
            let checkDate = new Date();
            checkDate.setHours(checkDate.getHours() + 6);
            while (true) {
                const d = checkDate.toISOString().split("T")[0];
                if (solvedDates.has(d)) {
                    streak++;
                    checkDate.setDate(checkDate.getDate() - 1);
                } else break;
            }

            // Weekly
            const weeklySolves = {};
            const weeklyTagCount = {};
            for (let i = 0; i < 7; i++) {
                const d = new Date();
                d.setHours(d.getHours() + 6);
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
                rating: u.rating || "-",
                maxRating: u.maxRating || u.rating || "-",
                rank: u.rank || "-",
                solvedToday,
                todayProblems,
                difficultyCount,
                streak,
                weeklySolves,
                weeklyTagCount
            });
        }

        // Weekly tag winners
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
        const payload = { status: "OK", result: results, weeklyTagWinners, weeklyWinner };
        CACHE = payload;
        CACHE_TIME = Date.now();
        res.json(payload);
    } catch (err) {
        console.error("CF ERROR → serving cache if exists");
        if (CACHE) return res.json(CACHE);
        res.status(500).json({ status: "FAILED", comment: "Codeforces unavailable" });
    }
});

// -------------------- UPCOMING CONTESTS --------------------
app.get("/api/contests/upcoming", async (req, res) => {
    try {
        const cfRes = await axios.get("https://codeforces.com/api/contest.list?gym=false");
        if (cfRes.data.status !== "OK") throw new Error("CF API failed");

        const now = Date.now();

        let contests = cfRes.data.result
            .filter(c => c.phase === "BEFORE" || c.phase === "CODING")
            .map(c => {
                const startTS = c.startTimeSeconds * 1000;
                const durMS = c.durationSeconds * 1000;
                const endTS = startTS + durMS;

                const start = new Date(startTS).toLocaleString("en-GB", {
                    timeZone: "Asia/Dhaka",
                    hour12: false,
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit"
                });

                const durH = Math.floor(c.durationSeconds / 3600);
                const durM = Math.floor((c.durationSeconds % 3600) / 60);
                const duration = `${durH}h ${durM}m`;
                const isLive = now >= startTS && now <= endTS;
                const isSoon = !isLive && (startTS - now) <= 24 * 60 * 60 * 1000;

                return { id: c.id, name: c.name, startTime: start, duration, url: `https://codeforces.com/contests/${c.id}`, isLive, isSoon };
            });

        contests.sort((a, b) => {
            if (a.isLive && !b.isLive) return -1;
            if (!a.isLive && b.isLive) return 1;
            if (a.isSoon && !b.isSoon) return -1;
            if (!a.isSoon && b.isSoon) return 1;
            return new Date(a.startTime) - new Date(b.startTime);
        });

        res.json({ status: "OK", contests });
    } catch (err) {
        console.error("CF Contest Error:", err.message);
        res.status(500).json({ status: "FAILED", contests: [] });
    }
});

// -------------------- LAST 3 CONTESTS STANDINGS --------------------
app.get("/api/contests/last-3-standings", async (req, res) => {
    try {
        const cfRes = await axios.get("https://codeforces.com/api/contest.list?gym=false");
        if (cfRes.data.status !== "OK") throw new Error("CF API failed");

        const last3 = cfRes.data.result
            .filter(c => c.phase === "FINISHED")
            .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)
            .slice(0, 3);

        const students = getStudents();
        const standings = [];

        for (let contest of last3) {
            const result = [];
            for (let handle of students) {
                try {
                    const ratingRes = await axios.get(`https://codeforces.com/api/user.rating?handle=${handle}`);
                    if (ratingRes.data.status !== "OK") continue;

                    const contestData = ratingRes.data.result.find(c => c.contestId === contest.id);
                    if (!contestData) {
                        result.push({ handle, standing: "Did not participate", ratingChange: "—" });
                    } else {
                        result.push({
                            handle,
                            standing: contestData.rank,
                            ratingChange: contestData.newRating - contestData.oldRating
                        });
                    }
                } catch (e) {
                    result.push({ handle, standing: "Did not participate", ratingChange: "—" });
                }
            }

            result.sort((a, b) => {
                if (a.standing === "Did not participate") return 1;
                if (b.standing === "Did not participate") return -1;
                return a.standing - b.standing;
            });

            standings.push({ contestId: contest.id, name: contest.name, participants: result });
        }

        res.json({ status: "OK", contests: standings });
    } catch (err) {
        console.error(err);
        res.status(500).json({ status: "FAILED", contests: [] });
    }
});

// -------------------- SERVER --------------------
app.listen(3000, () => {
    console.log("✅ Backend running at http://localhost:3000");
});
