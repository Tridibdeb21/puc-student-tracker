require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

// -------------------- CACHE --------------------
let CACHE = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let CACHE_TIME = 0;

// -------------------- PROBLEMS DATA --------------------
let dailyProblemCache = null;
let dailyProblemDate = null;

// -------------------- HELPERS --------------------
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// Convert UTC timestamp to Bangladesh time (UTC+6)
function getBDDate(tsSeconds) {
    const bdTime = new Date((tsSeconds + 6 * 3600) * 1000);
    const year = bdTime.getUTCFullYear();
    const month = String(bdTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bdTime.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getBDDateString(dayOffset = 0) {
    const now = new Date();
    const utcNow = now.getTime();
    const bdOffset = 6 * 60 * 60 * 1000;
    const bdNow = new Date(utcNow + bdOffset - (dayOffset * 24 * 60 * 60 * 1000));
    
    const year = bdNow.getUTCFullYear();
    const month = String(bdNow.getUTCMonth() + 1).padStart(2, '0');
    const day = String(bdNow.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getFormattedBDDate(dayOffset = 0) {
    const now = new Date();
    const utcNow = now.getTime();
    const bdOffset = 6 * 60 * 60 * 1000;
    const targetDate = new Date(utcNow + bdOffset - (dayOffset * 24 * 60 * 60 * 1000));
    
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    
    const dayOfWeek = days[targetDate.getUTCDay()];
    const month = months[targetDate.getUTCMonth()];
    const day = targetDate.getUTCDate();
    const year = targetDate.getUTCFullYear();
    
    return `${dayOfWeek}, ${month} ${day}, ${year} (BD Time)`;
}

function getCurrentBDTime() {
    const now = new Date();
    const utcNow = now.getTime();
    const bdOffset = 6 * 60 * 60 * 1000;
    const bdNow = new Date(utcNow + bdOffset);
    
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const dayOfWeek = days[bdNow.getUTCDay()];
    const month = months[bdNow.getUTCMonth()];
    const date = bdNow.getUTCDate();
    const year = bdNow.getUTCFullYear();
    const hours = bdNow.getUTCHours().toString().padStart(2, '0');
    const minutes = bdNow.getUTCMinutes().toString().padStart(2, '0');
    const seconds = bdNow.getUTCSeconds().toString().padStart(2, '0');
    
    return `${dayOfWeek}, ${month} ${date}, ${year} ${hours}:${minutes}:${seconds} (BD Time)`;
}

function getStudents() {
    try {
        const raw = fs.readFileSync("students.json", "utf-8");
        const data = JSON.parse(raw);
        return data.students || [];
    } catch (error) {
        console.error("Error reading students.json:", error);
        return [];
    }
}

function getWeeklyWinner(results) {
    const weeklySolvesMap = {};
    for (let s of results) {
        const daysSolved = Object.values(s.weeklySolves || {}).filter(v => v > 0).length;
        weeklySolvesMap[s.handle] = { 
            daysSolved, 
            rating: s.rating || 0 
        };
    }
    
    const candidates = Object.entries(weeklySolvesMap).filter(([h, val]) => val.daysSolved >= 5);
    if (candidates.length === 0) return null;
    
    candidates.sort((a, b) => {
        if (b[1].daysSolved !== a[1].daysSolved) {
            return b[1].daysSolved - a[1].daysSolved;
        }
        return b[1].rating - a[1].rating;
    });
    
    return { handle: candidates[0][0], daysSolved: candidates[0][1].daysSolved };
}

function calculateStreak(solvedSubs, targetDateStr, dayOffset = 0) {
    const firstSolveDates = new Map();
    
    for (let s of solvedSubs) {
        const key = `${s.problem.contestId}-${s.problem.index}`;
        const submissionDate = getBDDate(s.creationTimeSeconds);
        
        if (!firstSolveDates.has(key) || submissionDate < firstSolveDates.get(key)) {
            firstSolveDates.set(key, submissionDate);
        }
    }
    
    const uniqueSolveDates = new Set(Array.from(firstSolveDates.values()));
    
    let streak = 0;
    const utcNow = Date.now();
    const bdOffset = 6 * 60 * 60 * 1000;
    let checkDate = new Date(utcNow + bdOffset - (dayOffset * 24 * 60 * 60 * 1000));
    
    while (true) {
        const year = checkDate.getUTCFullYear();
        const month = String(checkDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getUTCDate()).padStart(2, '0');
        const d = `${year}-${month}-${day}`;
        
        if (uniqueSolveDates.has(d)) {
            streak++;
            checkDate = new Date(checkDate.getTime() - (24 * 60 * 60 * 1000));
        } else break;
    }
    
    return streak;
}

async function getDailyProblem() {
    const today = new Date().toISOString().split('T')[0];
    
    if (dailyProblemCache && dailyProblemDate === today) {
        return dailyProblemCache;
    }
    
    try {
        const response = await fetch('https://codeforces.com/api/problemset.problems');
        const data = await response.json();
        
        if (data.status !== "OK") {
            throw new Error("Failed to fetch problems");
        }
        
        const eligibleProblems = data.result.problems.filter(p => 
            p.rating >= 800 && p.rating <= 1200
        );
        
        if (eligibleProblems.length === 0) {
            const defaultProblem = {
                contestId: 4,
                index: "A",
                name: "Watermelon",
                rating: 800,
                tags: ["brute force", "math"],
                url: "https://codeforces.com/problemset/problem/4/A"
            };
            dailyProblemCache = defaultProblem;
            dailyProblemDate = today;
            return defaultProblem;
        }
        
        const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0);
        const index = seed % eligibleProblems.length;
        
        const problem = eligibleProblems[index];
        const result = {
            contestId: problem.contestId,
            index: problem.index,
            name: problem.name,
            rating: problem.rating,
            tags: problem.tags || [],
            url: `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`
        };
        
        dailyProblemCache = result;
        dailyProblemDate = today;
        return result;
    } catch (error) {
        console.error("Error fetching daily problem:", error);
        const defaultProblem = {
            contestId: 4,
            index: "A",
            name: "Watermelon",
            rating: 800,
            tags: ["brute force", "math"],
            url: "https://codeforces.com/problemset/problem/4/A"
        };
        dailyProblemCache = defaultProblem;
        dailyProblemDate = today;
        return defaultProblem;
    }
}

// FIXED: Improved fetch with better error handling and proper weekly data
async function fetchStudentData(dayOffset = 0) {
    const students = getStudents();
    if (students.length === 0) {
        return {
            result: [],
            weeklyTagWinners: {},
            weeklyWinner: null,
            displayDate: getFormattedBDDate(dayOffset),
            currentBDTime: getCurrentBDTime(),
            targetDate: getBDDateString(dayOffset),
            totalStudents: 0,
            fetchedStudents: 0,
            failedHandles: []
        };
    }

    const results = [];
    const weeklyTagMap = {};
    const targetDateStr = getBDDateString(dayOffset);
    const displayDate = getFormattedBDDate(dayOffset);
    const currentBDTime = getCurrentBDTime();
    
    console.log(`Fetching data for ${students.length} students: ${displayDate}`);

    // Get date range for weekly data (7 days including today)
    const weeklyDates = [];
    for (let i = 0; i < 7; i++) {
        const utcNow = Date.now();
        const bdOffset = 6 * 60 * 60 * 1000;
        const checkDate = new Date(utcNow + bdOffset - ((dayOffset + i) * 24 * 60 * 60 * 1000));
        
        const year = checkDate.getUTCFullYear();
        const month = String(checkDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(checkDate.getUTCDate()).padStart(2, '0');
        const ds = `${year}-${month}-${day}`;
        
        weeklyDates.push(ds);
    }

    let failedHandles = [];
    
    // Process students one by one to avoid rate limiting
    for (let i = 0; i < students.length; i++) {
        const handle = students[i];
        let retries = 3;
        let success = false;
        
        while (retries > 0 && !success) {
            try {
                console.log(`Fetching ${handle} (${i+1}/${students.length}), retries left: ${retries}`);
                
                const [userRes, subRes] = await Promise.all([
                    fetch(`https://codeforces.com/api/user.info?handles=${handle}`, {
                        timeout: 15000
                    }).then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.json();
                    }),
                    fetch(`https://codeforces.com/api/user.status?handle=${handle}&count=1000`, {
                        timeout: 20000
                    }).then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.json();
                    })
                ]);

                if (userRes.status !== "OK") {
                    throw new Error(`User API failed: ${userRes.comment || 'Unknown error'}`);
                }
                
                if (subRes.status !== "OK") {
                    throw new Error(`Submissions API failed: ${subRes.comment || 'Unknown error'}`);
                }

                const u = userRes.result[0];
                const subs = subRes.result || [];

                // Track unique problems solved BEFORE target date
                const solvedProblems = new Set();
                const beforeSubs = subs.filter(s => {
                    if (!s || s.verdict !== "OK") return false;
                    const submissionDate = getBDDate(s.creationTimeSeconds);
                    return submissionDate < targetDateStr;
                });
                
                beforeSubs.forEach(s => {
                    if (s.problem) {
                        const key = `${s.problem.contestId}-${s.problem.index}`;
                        solvedProblems.add(key);
                    }
                });

                // Target day submissions
                const targetSubs = subs.filter(s => {
                    if (!s || s.verdict !== "OK") return false;
                    const submissionDate = getBDDate(s.creationTimeSeconds);
                    return submissionDate === targetDateStr;
                });

                // Keep only first-time solves (unique)
                const todayProblems = [];
                const seenToday = new Set();
                
                for (let s of targetSubs) {
                    if (s.problem) {
                        const key = `${s.problem.contestId}-${s.problem.index}`;
                        if (!seenToday.has(key)) {
                            if (!solvedProblems.has(key)) {
                                todayProblems.push({
                                    name: s.problem.name || "Unknown",
                                    rating: s.problem.rating || "-",
                                    contestId: s.problem.contestId,
                                    index: s.problem.index,
                                    tags: s.problem.tags || []
                                });
                                solvedProblems.add(key);
                            }
                            seenToday.add(key);
                        }
                    }
                }

                const solvedToday = todayProblems.length;

                // Difficulty count
                const difficultyCount = { easy: 0, med1: 0, med2: 0, hard: 0 };
                for (let p of todayProblems) {
                    if (p.rating === "-") continue;
                    const rating = parseInt(p.rating);
                    if (!isNaN(rating)) {
                        if (rating < 1200) difficultyCount.easy++;
                        else if (rating < 1400) difficultyCount.med1++;
                        else if (rating < 1600) difficultyCount.med2++;
                        else difficultyCount.hard++;
                    }
                }

                // Calculate streak with unique problems only
                const solvedSubs = subs.filter(s => s.verdict === "OK");
                const streak = calculateStreak(solvedSubs, targetDateStr, dayOffset);

                // FIXED: Weekly solves with proper initialization
                const weeklySolves = {};
                const weeklyTagCount = {};
                
                // Initialize all weekly dates to 0
                weeklyDates.forEach(date => {
                    weeklySolves[date] = 0;
                });
                
                // Track first solve dates for the entire submission history
                const problemFirstSolve = new Map();
                const sortedSubs = [...solvedSubs].sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);
                
                for (let s of sortedSubs) {
                    if (s.problem) {
                        const submissionDate = getBDDate(s.creationTimeSeconds);
                        const problemKey = `${s.problem.contestId}-${s.problem.index}`;
                        
                        if (!problemFirstSolve.has(problemKey)) {
                            problemFirstSolve.set(problemKey, submissionDate);
                            
                            // Only count if within our weekly range
                            if (weeklyDates.includes(submissionDate)) {
                                weeklySolves[submissionDate] = (weeklySolves[submissionDate] || 0) + 1;
                                
                                // Count tags for weekly tag winners
                                for (let t of s.problem.tags || []) {
                                    weeklyTagCount[t] = (weeklyTagCount[t] || 0) + 1;
                                    if (!weeklyTagMap[t]) weeklyTagMap[t] = {};
                                    weeklyTagMap[t][handle] = (weeklyTagMap[t][handle] || 0) + 1;
                                }
                            }
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
                
                success = true;
                console.log(`✓ Successfully fetched ${handle}`);
                
            } catch (err) {
                retries--;
                console.error(`Error fetching ${handle} (${err.message}), retries left: ${retries}`);
                
                if (retries === 0) {
                    console.error(`Failed to fetch data for ${handle} after 3 retries`);
                    failedHandles.push(handle);
                    
                    // Still add placeholder for graph and standings
                    results.push({
                        handle: handle,
                        rating: 0,
                        maxRating: 0,
                        rank: "-",
                        solvedToday: 0,
                        todayProblems: [],
                        difficultyCount: { easy: 0, med1: 0, med2: 0, hard: 0 },
                        streak: 0,
                        weeklySolves: Object.fromEntries(weeklyDates.map(d => [d, 0])),
                        weeklyTagCount: {}
                    });
                } else {
                    await sleep(2000); // Wait before retry
                }
            }
        }
        
        // Delay between students to avoid rate limiting
        if (i < students.length - 1) {
            await sleep(2000);
        }
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
        if (winner) {
            weeklyTagWinners[tag] = { winner, count: max };
        }
    }

    const weeklyWinner = getWeeklyWinner(results);

    // Sort results: solvedToday DESC, rating ASC
    results.sort((a, b) => b.solvedToday - a.solvedToday || (a.rating - b.rating));
    results.forEach((s, i) => {
        s.position = i + 1;
        s.medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "";
    });

    return { 
        result: results, 
        weeklyTagWinners, 
        weeklyWinner,
        displayDate,
        currentBDTime,
        targetDate: targetDateStr,
        totalStudents: students.length,
        fetchedStudents: results.length,
        failedHandles: failedHandles
    };
}

// FIXED: Contest standings with better error handling
async function fetchContestStandings() {
    try {
        console.log("Fetching contest list...");
        const cfRes = await fetch("https://codeforces.com/api/contest.list?gym=false").then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
        
        if (cfRes.status !== "OK") {
            console.error("CF API failed:", cfRes.comment);
            return { contests: [] };
        }

        const students = getStudents();
        if (students.length === 0) {
            return { contests: [] };
        }

        const last3 = cfRes.result
            .filter(c => c.phase === "FINISHED" && !c.name.toLowerCase().includes("div. 1"))
            .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)
            .slice(0, 3);
        
        if (last3.length === 0) {
            return { contests: [] };
        }

        const standings = [];
        
        for (let contest of last3) {
            console.log(`Fetching standings for contest: ${contest.name} (ID: ${contest.id})`);
            const result = [];
            
            // Process students in smaller batches
            const batchSize = 2;
            for (let i = 0; i < students.length; i += batchSize) {
                const batch = students.slice(i, i + batchSize);
                const batchPromises = batch.map(async (handle) => {
                    try {
                        const ratingRes = await fetch(`https://codeforces.com/api/user.rating?handle=${handle}`, {
                            timeout: 15000
                        }).then(r => {
                            if (!r.ok) throw new Error(`HTTP ${r.status}`);
                            return r.json();
                        });
                        
                        if (ratingRes.status !== "OK") {
                            console.warn(`No rating data for ${handle}: ${ratingRes.comment}`);
                            return { handle, standing: "Did not participate", ratingChange: "—" };
                        }
                        
                        const contestData = ratingRes.result.find(c => c.contestId === contest.id);
                        if (!contestData) {
                            return { handle, standing: "Did not participate", ratingChange: "—" };
                        } else {
                            const change = contestData.newRating - contestData.oldRating;
                            return { handle, standing: contestData.rank, ratingChange: change };
                        }
                    } catch (e) {
                        console.error(`Error fetching contest data for ${handle}:`, e.message);
                        return { handle, standing: "Error fetching data", ratingChange: "—" };
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                result.push(...batchResults);
                
                // Delay between batches
                if (i + batchSize < students.length) {
                    await sleep(1500);
                }
            }

            // Sort by standing
            result.sort((a, b) => {
                if (a.standing === "Did not participate" && b.standing === "Did not participate") return 0;
                if (a.standing === "Did not participate") return 1;
                if (b.standing === "Did not participate") return -1;
                if (a.standing === "Error fetching data" && b.standing === "Error fetching data") return 0;
                if (a.standing === "Error fetching data") return 1;
                if (b.standing === "Error fetching data") return -1;
                return parseInt(a.standing) - parseInt(b.standing);
            });

            standings.push({ 
                contestId: contest.id, 
                name: contest.name, 
                participants: result,
                totalParticipants: result.length
            });
            
            console.log(`✓ Finished contest ${contest.name}: ${result.length} participants`);
        }

        return { contests: standings };
    } catch (err) {
        console.error("Error in fetchContestStandings:", err);
        return { contests: [] };
    }
}

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/api/bd-time", (req, res) => {
    res.json({ 
        status: "OK", 
        bdTime: getCurrentBDTime(),
        timestamp: Date.now()
    });
});

app.get("/api/daily-problem", async (req, res) => {
    try {
        const problem = await getDailyProblem();
        res.json({
            status: "OK",
            problem,
            date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        console.error("Error getting daily problem:", error);
        res.status(500).json({ 
            status: "FAILED", 
            comment: "Failed to fetch daily problem" 
        });
    }
});

app.get("/api/students/today", async (req, res) => {
    try {
        const now = Date.now();
        if (CACHE.today && now - CACHE_TIME < CACHE_TTL) {
            const cachedData = { ...CACHE.today, currentBDTime: getCurrentBDTime() };
            return res.json(cachedData);
        }

        console.log("Fetching fresh data for today...");
        const data = await fetchStudentData(0);
        CACHE.today = { status: "OK", ...data };
        CACHE_TIME = now;
        
        console.log(`Data fetched: ${data.fetchedStudents}/${data.totalStudents} students`);
        res.json({ status: "OK", ...data });
    } catch (err) {
        console.error("Error in /api/students/today:", err);
        res.status(500).json({ 
            status: "FAILED", 
            comment: "Codeforces unavailable or server error",
            error: err.message 
        });
    }
});

app.get("/api/students/day/:dayOffset", async (req, res) => {
    const dayOffset = parseInt(req.params.dayOffset);
    if (isNaN(dayOffset) || dayOffset < 1 || dayOffset > 7) {
        return res.status(400).json({ status: "FAILED", comment: "dayOffset must be 1-7" });
    }
    try {
        const now = Date.now();
        const cacheKey = `day${dayOffset}`;
        if (CACHE[cacheKey] && now - CACHE_TIME < CACHE_TTL) {
            const cachedData = { ...CACHE[cacheKey], currentBDTime: getCurrentBDTime() };
            return res.json(cachedData);
        }

        console.log(`Fetching data for day offset ${dayOffset}...`);
        const data = await fetchStudentData(dayOffset);
        CACHE[cacheKey] = { status: "OK", ...data };
        CACHE_TIME = now;
        res.json({ status: "OK", ...data });
    } catch (err) {
        console.error(`Error in /api/students/day/${dayOffset}:`, err);
        res.status(500).json({ 
            status: "FAILED", 
            comment: "Codeforces unavailable or server error",
            error: err.message 
        });
    }
});

// FIXED: Show ALL upcoming contests
app.get("/api/contests/upcoming", async (req, res) => {
    try {
        console.log("Fetching upcoming contests...");
        const cfRes = await fetch("https://codeforces.com/api/contest.list?gym=false", {
            timeout: 10000
        }).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.json();
        });
        
        if (cfRes.status !== "OK") {
            console.error("CF API failed:", cfRes.comment);
            return res.json({ status: "OK", contests: [] });
        }

        const now = Date.now();
        let contests = cfRes.result
            .filter(c => c.phase === "BEFORE" || c.phase === "CODING")
            .map(c => {
                const startTS = c.startTimeSeconds * 1000;
                const durMS = c.durationSeconds * 1000;
                const endTS = startTS + durMS;
                
                const bdOffset = 6 * 60 * 60 * 1000;
                const bdStartTime = new Date(startTS + bdOffset);
                
                const start = `${bdStartTime.getUTCDate().toString().padStart(2, '0')}/${(bdStartTime.getUTCMonth() + 1).toString().padStart(2, '0')}/${bdStartTime.getUTCFullYear()} ${bdStartTime.getUTCHours().toString().padStart(2, '0')}:${bdStartTime.getUTCMinutes().toString().padStart(2, '0')}`;
                
                const durH = Math.floor(c.durationSeconds / 3600);
                const durM = Math.floor((c.durationSeconds % 3600) / 60);
                const isLive = now >= startTS && now <= endTS;
                const isSoon = !isLive && (startTS - now) <= 24 * 60 * 60 * 1000;
                return { 
                    id: c.id, 
                    name: c.name, 
                    startTime: start,
                    startTimestamp: startTS,
                    duration: `${durH}h ${durM}m`, 
                    url: `https://codeforces.com/contest/${c.id}`, 
                    isLive, 
                    isSoon,
                    timeUntilStart: startTS - now
                };
            });

        contests.sort((a,b) => {
            if (a.isLive && !b.isLive) return -1;
            if (!a.isLive && b.isLive) return 1;
            return a.timeUntilStart - b.timeUntilStart;
        });

        console.log(`Found ${contests.length} upcoming contests`);
        res.json({ status: "OK", contests });
    } catch(err) {
        console.error("Error fetching upcoming contests:", err);
        res.json({ status: "OK", contests: [] });
    }
});

// FIXED: Show ALL students in contest standings with better error handling
app.get("/api/contests/last-3-standings", async (req, res) => {
    try {
        const now = Date.now();
        if (CACHE.contestStandings && now - CACHE_TIME < CACHE_TTL) {
            return res.json({ status: "OK", ...CACHE.contestStandings });
        }

        const data = await fetchContestStandings();
        CACHE.contestStandings = data;
        CACHE_TIME = now;
        
        res.json({ status: "OK", ...data });
    } catch(err){
        console.error("Error in /api/contests/last-3-standings:", err);
        res.json({ status: "OK", contests: [] });
    }
});

// Feedback system
app.post("/api/feedback", async (req, res) => {
    try {
        const { name, email, message } = req.body;
        
        if (!message || message.trim().length < 10) {
            return res.status(400).json({ 
                status: "FAILED", 
                comment: "Message must be at least 10 characters long" 
            });
        }
        
        const feedbackDir = path.join(__dirname, 'feedback');
        if (!fs.existsSync(feedbackDir)) {
            fs.mkdirSync(feedbackDir, { recursive: true });
        }
        
        const timestamp = new Date().toISOString();
        const feedbackId = Date.now();
        const feedbackData = {
            id: feedbackId,
            timestamp,
            name: name || 'Anonymous',
            email: email || 'No email',
            message: message.trim(),
            read: false
        };
        
        const feedbackFile = path.join(feedbackDir, `feedback_${feedbackId}.json`);
        fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2), 'utf8');
        
        const logFile = path.join(feedbackDir, 'all_feedback.log');
        const logEntry = `[${timestamp}] ${name || 'Anonymous'} (${email || 'No email'}): ${message}\n---\n`;
        fs.appendFileSync(logFile, logEntry, 'utf8');
        
        console.log(`✅ Feedback saved: ${feedbackFile}`);
        
        res.json({ 
            status: "OK", 
            comment: "Thank you for your feedback! It has been saved and will be reviewed by the developer.",
            feedbackId
        });
    } catch (err) {
        console.error("Error processing feedback:", err);
        res.status(500).json({ 
            status: "FAILED", 
            comment: "Failed to save feedback. Please try again later." 
        });
    }
});

app.get("/api/feedback/view", (req, res) => {
    try {
        const feedbackDir = path.join(__dirname, 'feedback');
        if (!fs.existsSync(feedbackDir)) {
            return res.json({ status: "OK", feedback: [] });
        }
        
        const files = fs.readdirSync(feedbackDir);
        const feedbackList = [];
        
        files.forEach(file => {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(feedbackDir, file), 'utf8');
                    const feedback = JSON.parse(content);
                    feedbackList.push(feedback);
                } catch (e) {
                    console.error(`Error reading feedback file ${file}:`, e);
                }
            }
        });
        
        feedbackList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        res.json({ status: "OK", feedback: feedbackList });
    } catch (err) {
        console.error("Error viewing feedback:", err);
        res.status(500).json({ status: "FAILED", comment: "Failed to load feedback" });
    }
});

app.get("/api/students/count", (req, res) => {
    try {
        const students = getStudents();
        res.json({ 
            status: "OK", 
            count: students.length,
            students: students 
        });
    } catch (error) {
        res.status(500).json({ status: "FAILED", count: 0 });
    }
});

app.get("/api/status", (req, res) => {
    res.json({
        status: "OK",
        serverTime: new Date().toISOString(),
        bdTime: getCurrentBDTime(),
        cacheAge: Date.now() - CACHE_TIME,
        cacheValid: CACHE.today ? "Yes" : "No"
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});
