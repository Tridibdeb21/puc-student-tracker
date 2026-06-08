require("dotenv").config();
const express = require("express");
const fetch = require("node-fetch");
const fs = require("fs");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../frontend')));

// -------------------- CACHE --------------------
let CACHE = {};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes (extended for better performance)
const STUDENT_DATA_PROMISES = new Map();

// -------------------- PROBLEMS DATA --------------------
let dailyProblemCache = null;
let dailyProblemDate = null;
let STUDENTS_FILE_MTIME = 0;

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
        const studentsPath = path.join(__dirname, 'students.json');
        const stat = fs.statSync(studentsPath);
        if (stat.mtimeMs !== STUDENTS_FILE_MTIME) {
            STUDENTS_FILE_MTIME = stat.mtimeMs;
            CACHE = {};
            console.log('students.json changed, clearing cached student data');
        }

        const raw = fs.readFileSync(studentsPath, "utf-8");
        const data = JSON.parse(raw);
        return data.students || [];
    } catch (error) {
        console.error("Error reading students.json:", error);
        return [];
    }
}

const USER_CACHE_FILE = path.join(__dirname, 'user_cache.json');

function loadUserCache(map) {
    try {
        if (fs.existsSync(USER_CACHE_FILE)) {
            const raw = fs.readFileSync(USER_CACHE_FILE, 'utf8');
            const obj = JSON.parse(raw || '{}');
            for (const k of Object.keys(obj)) {
                try { map.set(k.toLowerCase(), obj[k]); } catch(e) { map.set(k, obj[k]); }
            }
            console.log(`Loaded ${map.size} users from user_cache.json`);
        }
    } catch (e) {
        console.warn('Failed to load user cache:', e.message);
    }
}

function saveUserCache(map) {
    try {
        const obj = {};
        for (const [k, v] of map.entries()) obj[k] = v;
        fs.writeFileSync(USER_CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.warn('Failed to save user cache:', e.message);
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
    const concurrency = parseInt(process.env.STUDENT_FETCH_CONCURRENCY) || 6;
    // Pre-fetch user.info for all students in batches to reduce number of API calls
    const userInfoMap = new Map();
    async function fetchAllUserInfos() {
        // Try loading existing cache first to avoid unnecessary API calls
        loadUserCache(userInfoMap);
        const batchSize = 100; // Codeforces supports multiple handles in one call
        for (let i = 0; i < students.length; i += batchSize) {
            const batch = students.slice(i, i + batchSize);
            try {
                console.log(`Fetching user.info for batch ${i}-${i + batch.length - 1}`);
                const q = batch.join(';');
                const infoRes = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(q)}`, {
                    timeout: 15000
                }).then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                });

                if (infoRes.status === 'OK' && Array.isArray(infoRes.result)) {
                    infoRes.result.forEach(u => {
                        try { userInfoMap.set(String(u.handle).toLowerCase(), u); } catch(e) { userInfoMap.set(u.handle, u); }
                    });
                    // persist updated cache after each successful batch
                    saveUserCache(userInfoMap);
                } else {
                    console.warn('user.info batch returned non-OK status or empty result');
                }
            } catch (e) {
                console.error('Error fetching user.info batch:', e.message || e);
            }
            // small pause to be polite with API
            await sleep(200);
        }
    }

    // start fetching user infos (do not await here, allow overlap with submission fetches)
    const userInfoPromise = fetchAllUserInfos();
    let nextIndex = 0;

    async function processStudent(handle, index) {
        let retries = 3;
        let backoffMs = 500; // Start with 500ms, exponential for rate-limit errors

        while (retries > 0) {
            try {
                console.log(`Fetching submissions for ${handle} (${index + 1}/${students.length}), retries left: ${retries}`);

                // Wait for user info fetch to finish for this handle if not already available
                let u = userInfoMap.get(String(handle).toLowerCase());
                if (!u) {
                    // allow background fetch to proceed a short time
                    try {
                        await Promise.race([userInfoPromise, sleep(200)]);
                        u = userInfoMap.get(String(handle).toLowerCase());
                    } catch (e) {
                        // ignore
                    }
                }

                const subRes = await fetch(`https://codeforces.com/api/user.status?handle=${handle}&count=1000`, {
                    timeout: 20000
                }).then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                });

                if (subRes.status !== "OK") {
                    throw new Error(`Submissions API failed: ${subRes.comment || 'Unknown error'}`);
                }

                if (!u) {
                    // Try a direct per-handle fetch as a fallback (ensures rating is available)
                    try {
                        const directUserRes = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`, { timeout: 10000 }).then(r => {
                            if (!r.ok) throw new Error(`HTTP ${r.status}`);
                            return r.json();
                        });
                        if (directUserRes && directUserRes.status === 'OK' && Array.isArray(directUserRes.result) && directUserRes.result[0]) {
                            u = directUserRes.result[0];
                            try { userInfoMap.set(String(u.handle).toLowerCase(), u); saveUserCache(userInfoMap); } catch(e) { /* ignore */ }
                        }
                    } catch (e) {
                        // ignore direct fetch errors, will fallback to minimal object
                        console.warn(`Direct user.info fetch failed for ${handle}: ${e.message}`);
                    }
                }

                if (!u) {
                    // fallback if user.info still wasn't fetched: create minimal user object
                    u = { handle, rating: 0, maxRating: 0, rank: '-' };
                }

                const subs = subRes.result || [];

                // Determine first-time solves by finding the earliest OK submission per problem
                const solvedSubs = subs.filter(s => s && s.verdict === "OK");
                const problemFirstSolveTs = new Map();

                for (const s of solvedSubs) {
                    if (!s.problem) continue;
                    const key = `${s.problem.contestId}-${s.problem.index}`;
                    const ts = s.creationTimeSeconds;
                    if (!problemFirstSolveTs.has(key) || ts < problemFirstSolveTs.get(key)) {
                        problemFirstSolveTs.set(key, ts);
                    }
                }

                const todayProblems = [];
                for (const [key, ts] of problemFirstSolveTs.entries()) {
                    const firstSolveDate = getBDDate(ts);
                    if (firstSolveDate === targetDateStr) {
                        // find a submission to extract problem metadata
                        const s = solvedSubs.find(x => x.problem && `${x.problem.contestId}-${x.problem.index}` === key && x.creationTimeSeconds === ts) ||
                                  solvedSubs.find(x => x.problem && `${x.problem.contestId}-${x.problem.index}` === key);
                        const p = s && s.problem ? s.problem : { name: 'Unknown', rating: '-', contestId: key.split('-')[0], index: key.split('-')[1], tags: [] };
                        todayProblems.push({
                            name: p.name || 'Unknown',
                            rating: p.rating || '-',
                            contestId: p.contestId,
                            index: p.index,
                            tags: p.tags || []
                        });
                    }
                }

                const solvedToday = todayProblems.length;

                const difficultyCount = { easy: 0, med1: 0, med2: 0, hard: 0 };
                for (const problem of todayProblems) {
                    if (problem.rating === "-") continue;
                    const rating = parseInt(problem.rating);
                    if (Number.isNaN(rating)) continue;
                    if (rating < 1200) difficultyCount.easy++;
                    else if (rating < 1400) difficultyCount.med1++;
                    else if (rating < 1600) difficultyCount.med2++;
                    else difficultyCount.hard++;
                }

                const streak = calculateStreak(solvedSubs, targetDateStr, dayOffset);

                const weeklySolves = Object.fromEntries(weeklyDates.map(date => [date, 0]));
                const weeklyTagCount = {};
                const problemFirstSolve = new Map();
                const sortedSubs = [...solvedSubs].sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);

                for (const s of sortedSubs) {
                    if (!s.problem) continue;
                    const submissionDate = getBDDate(s.creationTimeSeconds);
                    const problemKey = `${s.problem.contestId}-${s.problem.index}`;

                    if (problemFirstSolve.has(problemKey)) continue;
                    problemFirstSolve.set(problemKey, submissionDate);

                    if (!weeklyDates.includes(submissionDate)) continue;

                    weeklySolves[submissionDate] = (weeklySolves[submissionDate] || 0) + 1;
                    for (const tag of s.problem.tags || []) {
                        weeklyTagCount[tag] = (weeklyTagCount[tag] || 0) + 1;
                        if (!weeklyTagMap[tag]) weeklyTagMap[tag] = {};
                        weeklyTagMap[tag][handle] = (weeklyTagMap[tag][handle] || 0) + 1;
                    }
                }

                results.push({
                    handle: u.handle,
                    rating: u.rating || 0,
                    maxRating: u.maxRating || u.rating || 0,
                    rank: u.rank || "-",
                    titlePhoto: u.titlePhoto || u.avatar || null,
                    solvedToday,
                    todayProblems,
                    difficultyCount,
                    streak,
                    weeklySolves,
                    weeklyTagCount
                });

                console.log(`✓ Successfully fetched ${handle}`);
                return;
            } catch (err) {
                retries--;
                console.error(`Error fetching ${handle} (${err.message}), retries left: ${retries}`);

                if (retries === 0) {
                    console.error(`Failed to fetch data for ${handle} after 3 retries`);
                    failedHandles.push(handle);
                    results.push({
                        handle,
                        rating: 0,
                        maxRating: 0,
                        rank: "-",
                        titlePhoto: null,
                        solvedToday: 0,
                        todayProblems: [],
                        difficultyCount: { easy: 0, med1: 0, med2: 0, hard: 0 },
                        streak: 0,
                        weeklySolves: Object.fromEntries(weeklyDates.map(d => [d, 0])),
                        weeklyTagCount: {}
                    });
                    return;
                }

                // Exponential backoff: 500ms, 1s, 2s (starts slower than before)
                await sleep(backoffMs);
                backoffMs = Math.min(backoffMs * 2, 3000); // Cap at 3s
            }
        }
    }

    async function worker() {
        while (true) {
            const index = nextIndex++;
            if (index >= students.length) break;
            await processStudent(students[index], index);
        }
    }

    const workerCount = Math.min(concurrency, students.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));

    // Retry any remaining failed handles once after a short cooldown.
    // This helps previous-day and today views recover from temporary 429/503
    // responses without leaving students marked as failed in the UI.
    if (failedHandles.length > 0) {
        const retryHandles = [...new Set(failedHandles)];
        const retryIndexByHandle = new Map(students.map((h, idx) => [h, idx]));
        failedHandles = [];
        await sleep(2000);

        for (const handle of retryHandles) {
            const index = retryIndexByHandle.get(handle);
            if (index === undefined) {
                failedHandles.push(handle);
                continue;
            }
            await processStudent(handle, index);
        }

        // Keep only the latest record for each handle so a successful retry
        // replaces the earlier failed placeholder row.
        const deduped = new Map();
        for (const item of results) {
            deduped.set(String(item.handle).toLowerCase(), item);
        }
        results.length = 0;
        results.push(...deduped.values());
    }

    results.sort((a, b) => {
        if (b.solvedToday !== a.solvedToday) return b.solvedToday - a.solvedToday;
        return (a.rating || 0) - (b.rating || 0);
    });

    const weeklyTagWinners = {};
    for (const tag of Object.keys(weeklyTagMap)) {
        let winner = null;
        let maxCount = -1;
        let bestRating = -1;

        for (const handle of Object.keys(weeklyTagMap[tag])) {
            const count = weeklyTagMap[tag][handle];
            const rating = results.find(s => s.handle === handle)?.rating || 0;

            if (count > maxCount || (count === maxCount && rating > bestRating)) {
                maxCount = count;
                bestRating = rating;
                winner = handle;
            }
        }

        if (winner) {
            weeklyTagWinners[tag] = { handle: winner, count: maxCount };
        }
    }

    const rawWeeklyWinner = getWeeklyWinner(results);
    let weeklyWinner = null;
    if (rawWeeklyWinner && rawWeeklyWinner.handle) {
        const s = results.find(x => x.handle === rawWeeklyWinner.handle || (x.handle && x.handle.toLowerCase() === rawWeeklyWinner.handle.toLowerCase()));
        weeklyWinner = {
            handle: rawWeeklyWinner.handle,
            daysSolved: rawWeeklyWinner.daysSolved,
            rating: s?.rating || 0,
            maxRating: s?.maxRating || s?.rating || 0,
            rank: s?.rank || "-",
            titlePhoto: s?.titlePhoto || null
        };
    }

    // If any students ended up with rating 0 due to submission fetch failures,
    // overlay cached user info (if available) so the UI shows known ratings.
    for (let s of results) {
        try {
            const cached = userInfoMap.get(String(s.handle).toLowerCase());
            if (cached && cached.rating) {
                s.rating = cached.rating;
                s.maxRating = cached.maxRating || cached.rating;
                s.rank = (s.rank && s.rank !== '-') ? s.rank : (cached.rank || s.rank);
                s.titlePhoto = s.titlePhoto || cached.titlePhoto || cached.avatar || null;
            }
        } catch (e) {
            // ignore any lookup errors
        }
    }

    return {
        result: results,
        weeklyTagWinners,
        weeklyWinner,
        displayDate,
        currentBDTime,
        targetDate: targetDateStr,
        totalStudents: students.length,
        fetchedStudents: results.filter(s => s.rating !== 0 || s.solvedToday > 0 || s.weeklySolves).length,
        failedHandles
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
            
            // Optimized: Process students in batches of 2 with 1000ms delays
            // This maintains ~2 req/sec (within Codeforces limits of 1-2 req/sec)
            // For 20 students: ~10 seconds, for 50 students: ~25 seconds per contest
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
                
                // Stagger batches by 1000ms to maintain ~2 req/sec (respects Codeforces limit)
                if (i + batchSize < students.length) {
                    await sleep(1000);
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

// Retry fetching user.info for given handles and save to cache
app.post('/api/retry-handles', async (req, res) => {
    try {
        const handles = Array.isArray(req.body.handles) ? req.body.handles : [];
        if (handles.length === 0) return res.json({ status: 'OK', comment: 'No handles provided', retried: [] });

        const userInfoMap = new Map();
        loadUserCache(userInfoMap);
        const retried = [];
        const failed = [];

        for (const h of handles) {
            try {
                const r = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(h)}`, { timeout: 10000 });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const j = await r.json();
                if (j && j.status === 'OK' && Array.isArray(j.result) && j.result[0]) {
                    const u = j.result[0];
                    userInfoMap.set(String(u.handle).toLowerCase(), u);
                    retried.push(u.handle);
                } else {
                    failed.push(h);
                }
            } catch (e) {
                console.error(`Retry failed for ${h}:`, e.message || e);
                failed.push(h);
            }
            await sleep(250);
        }

        saveUserCache(userInfoMap);
        return res.json({ status: 'OK', retried, failed });
    } catch (err) {
        console.error('Error in /api/retry-handles:', err);
        return res.status(500).json({ status: 'FAILED', comment: err.message });
    }
});

// -------------------- ROUTES --------------------
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
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
        const cacheKey = "today";
        const targetDateStr = getBDDateString(0);
        const forceFresh = req.query.fresh === '1' || req.query.fresh === 'true';
        if (!forceFresh && CACHE[cacheKey] && 
            now - CACHE[cacheKey].cachedAt < CACHE_TTL && 
            CACHE[cacheKey].targetDate === targetDateStr) {
            const cachedData = { ...CACHE[cacheKey].data, currentBDTime: getCurrentBDTime() };
            return res.json(cachedData);
        }

        if (STUDENT_DATA_PROMISES.has(cacheKey)) {
            return res.json(await STUDENT_DATA_PROMISES.get(cacheKey));
        }

        console.log("Fetching fresh data for today...");
        const pending = (async () => {
            const data = await fetchStudentData(0);
            CACHE[cacheKey] = {
                data: { status: "OK", ...data },
                cachedAt: Date.now(),
                targetDate: targetDateStr
            };
            return { status: "OK", ...data };
        })();

        STUDENT_DATA_PROMISES.set(cacheKey, pending);

        try {
            const response = await pending;
            console.log(`Data fetched: ${response.fetchedStudents}/${response.totalStudents} students`);
            res.json(response);
        } catch (fetchErr) {
            // If fresh fetch fails, return stale cache if available
            if (CACHE[cacheKey]) {
                console.warn("Fresh fetch failed, returning cached data:", fetchErr.message);
                const cachedData = { ...CACHE[cacheKey].data, currentBDTime: getCurrentBDTime(), cached: true };
                return res.json(cachedData);
            }
            throw fetchErr;
        } finally {
            STUDENT_DATA_PROMISES.delete(cacheKey);
        }
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
        const targetDateStr = getBDDateString(dayOffset);
        if (CACHE[cacheKey] && 
            now - CACHE[cacheKey].cachedAt < CACHE_TTL && 
            CACHE[cacheKey].targetDate === targetDateStr) {
            const cachedData = { ...CACHE[cacheKey].data, currentBDTime: getCurrentBDTime() };
            return res.json(cachedData);
        }

        if (STUDENT_DATA_PROMISES.has(cacheKey)) {
            return res.json(await STUDENT_DATA_PROMISES.get(cacheKey));
        }

        console.log(`Fetching data for day offset ${dayOffset}...`);
        const pending = (async () => {
            const data = await fetchStudentData(dayOffset);
            CACHE[cacheKey] = {
                data: { status: "OK", ...data },
                cachedAt: Date.now(),
                targetDate: targetDateStr
            };
            return { status: "OK", ...data };
        })();

        STUDENT_DATA_PROMISES.set(cacheKey, pending);

        try {
            const response = await pending;
            res.json(response);
        } finally {
            STUDENT_DATA_PROMISES.delete(cacheKey);
        }
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
                    url: `https://codeforces.com/contests/${c.id}`, 
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
        const cacheKey = "contestStandings";
        if (CACHE[cacheKey] && now - CACHE[cacheKey].cachedAt < CACHE_TTL) {
            return res.json({ status: "OK", ...CACHE[cacheKey].data });
        }

        const data = await fetchContestStandings();
        CACHE[cacheKey] = {
            data: data,
            cachedAt: Date.now()
        };
        
        res.json({ status: "OK", ...data });
    } catch(err){
        console.error("Error in /api/contests/last-3-standings:", err);
        res.json({ status: "OK", contests: [] });
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
    const age = CACHE.today ? Date.now() - CACHE.today.cachedAt : null;
    res.json({
        status: "OK",
        serverTime: new Date().toISOString(),
        bdTime: getCurrentBDTime(),
        cacheAge: age,
        cacheValid: CACHE.today ? "Yes" : "No"
    });
});

// Clear server cache (force next /api/students/today to fetch fresh data)
app.post('/api/clear-cache', (req, res) => {
    try {
        CACHE = {};
        console.log('Cache cleared via /api/clear-cache');
        return res.json({ status: 'OK', comment: 'Cache cleared' });
    } catch (err) {
        console.error('Error clearing cache:', err);
        return res.status(500).json({ status: 'FAILED', comment: err.message });
    }
});

// SPA fallback: serve index.html for non-API GET requests without using path-to-regexp patterns
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Backend running at http://localhost:${PORT}`);
});
