console.log("🚀 SCRIPT LOADED SUCCESSFULLY");

// =============================================
// LOAD KEYS FROM CONFIG.JS
// =============================================

const BACKEND_URL = "https://reps-backend-api.onrender.com"; 

// =============================================
// API CONFIGURATION
// =============================================
const GOOGLE_CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";
const APIFY_ACTOR = "fortuitous_pirate/congress-gov-scraper";

// 🔥 NEW PROXY: cors.bridged.cc (more reliable)
const CORS_PROXY = "https://cors.bridged.cc/";
const APIFY_BASE = `https://api.apify.com`;

// =============================================
// FETCH WRAPPER with CORS fix for Apify
// =============================================
async function fetchJson(url, useProxy = false) {
    const finalUrl = useProxy ? CORS_PROXY + url : url;
    console.log("[fetchJson] GET", finalUrl);
    try {
        const res = await fetch(finalUrl);
        console.log("[fetchJson] Status:", res.status, res.statusText);
        if (!res.ok) {
            // Try to get error details
            let errorText = "";
            try {
                errorText = await res.text();
            } catch (e) {}
            throw new Error(`HTTP ${res.status}: ${res.statusText} - ${errorText.substring(0, 100)}`);
        }
        return await res.json();
    } catch (err) {
        console.error("[fetchJson] Error:", err);
        throw err;
    }
}

// =============================================
// HELPER FUNCTIONS (unchanged)
// =============================================
function partyBadge(party) {
    if (!party) return { label: "?", cls: "badge-unknown" };
    party = party.toLowerCase();
    if (party.includes("dem")) return { label: "D", cls: "badge-dem" };
    if (party.includes("repub")) return { label: "R", cls: "badge-rep" };
    return { label: "I", cls: "badge-ind" };
}

function formatDate(dateString) {
    if (!dateString) return "Unknown date";
    return new Date(dateString).toLocaleDateString();
}

function renderList(container, html) {
    if (!container) return;
    container.innerHTML = html || "<p class='info'>No results.</p>";
}

// =============================================
// ZIP LOOKUP - Google Civic API (works without proxy)
// =============================================
async function handleZipSearch() {
    const input = document.getElementById("zipInput");
    const out = document.getElementById("zipResult");
    const btn = document.getElementById("zipSearchBtn");
    const zip = input?.value?.trim();

    if (!zip) {
        renderList(out, "<p class='error'>Enter a ZIP code.</p>");
        return;
    }

    btn.disabled = true;
    renderList(out, "<p class='info'>Looking up your representatives…</p>");

    try {
        const url = `${GOOGLE_CIVIC_BASE}/representatives?address=${encodeURIComponent(zip)}&key=${GOOGLE_API_KEY}`;
        console.log("Fetching reps from:", url);
        
        const data = await fetchJson(url, false);
        
        const offices = data.offices || [];
        const officials = data.officials || [];
        let html = "<p class='small'>Your federal representatives:</p>";
        
        offices.forEach((office) => {
            if (office.name.includes("U.S. Senate") || office.name.includes("U.S. House")) {
                office.officialIndices.forEach(index => {
                    const rep = officials[index];
                    const badge = partyBadge(rep.party);
                    html += `
                        <p class="rep-line">
                            <span class="rep-name">${rep.name}</span>
                            <span class="badge ${badge.cls}">${badge.label}</span>
                            ${rep.phone ? `<span class="small"> 📞 ${rep.phone}</span>` : ''}
                        </p>
                    `;
                });
            }
        });
        
        renderList(out, html);
    } catch (err) {
        console.error("[handleZipSearch] Error:", err);
        renderList(out, `<p class='error'>Error: ${err.message}</p>`);
    } finally {
        btn.disabled = false;
    }
}

// =============================================
// APIFY ACTOR RUNNER - Now with new proxy
// =============================================
async function runApifyActor(inputData) {
    try {
        // Start the actor via your backend
        const startUrl = `${BACKEND_URL}/api/apify?endpoint=acts/fortuitous_pirate/congress-gov-scraper/runs`;
        const startRes = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });
        const run = await startRes.json();
        const runId = run.data.id;
        const datasetId = run.data.defaultDatasetId;

        // Wait a few seconds for the actor to run
        await new Promise(r => setTimeout(r, 4000));

        // Get results
        const dataUrl = `${BACKEND_URL}/api/apify?endpoint=datasets/${datasetId}/items`;
        const dataRes = await fetch(dataUrl);
        return await dataRes.json();
    } catch (err) {
        console.error("[runApifyActor] Error:", err);
        throw err;
    }
}
// =============================================
// TRENDING BILLS
// =============================================
async function loadTrendingBills() {
    const out = document.getElementById("trendingBills");
    renderList(out, "<p class='info'>Loading trending bills (may take a moment)…</p>");

    try {
        const bills = await runApifyActor({ 
            "endpoint": "bill", 
            "maxItems": 5,
            "format": "json"
        });
        
        if (!bills || bills.length === 0) {
            renderList(out, "<p class='info'>No trending bills found.</p>");
            return;
        }

        let html = "<p class='small'>Recent bills in Congress:</p>";
        
        bills.forEach(bill => {
            const billNum = bill.number || "Unknown";
            const title = bill.title || "No title available";
            const updateDate = bill.updateDate ? formatDate(bill.updateDate) : "Unknown";
            
            html += `
                <p class="rep-line">
                    <span class="rep-name">${billNum}</span><br>
                    <span class="small">${title.substring(0, 60)}${title.length > 60 ? '…' : ''}</span><br>
                    <span class="small">📅 ${updateDate}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error("[loadTrendingBills]", err);
        renderList(out, "<p class='error'>Unable to load bills. Error: " + err.message + "</p>");
    }
}

// =============================================
// RECENT VOTES
// =============================================
async function loadRecentVotes(chamber, containerId) {
    const out = document.getElementById(containerId);
    renderList(out, `<p class='info'>Loading recent ${chamber} votes…</p>`);

    try {
        const votes = await runApifyActor({ 
            "endpoint": "vote", 
            "maxItems": 5,
            "format": "json"
        });
        
        if (!votes || votes.length === 0) {
            renderList(out, `<p class='info'>No recent ${chamber} votes found.</p>`);
            return;
        }

        // Filter by chamber
        const chamberVotes = votes.filter(v => 
            v.chamber?.toLowerCase() === chamber.toLowerCase()
        );

        if (chamberVotes.length === 0) {
            renderList(out, `<p class='info'>No recent ${chamber} votes found.</p>`);
            return;
        }

        let html = `<p class='small'>Recent ${chamber} votes:</p>`;
        
        chamberVotes.forEach(vote => {
            const question = vote.question || "Vote";
            const date = vote.date ? formatDate(vote.date) : "Unknown";
            
            html += `
                <p class="rep-line">
                    <span class="rep-name">${question.substring(0, 50)}${question.length > 50 ? '…' : ''}</span><br>
                    <span class="small">📅 ${date}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error(`[loadRecentVotes ${chamber}]`, err);
        renderList(out, `<p class='error'>Unable to load votes: ${err.message}</p>`);
    }
}

// =============================================
// ISSUE BROWSE
// =============================================
async function handleIssueClick(issue) {
    const out = document.getElementById("issueResult");
    renderList(out, `<p class='info'>Searching bills related to "${issue}"…</p>`);

    try {
        const bills = await runApifyActor({ 
            "endpoint": "bill", 
            "searchTerm": issue,
            "maxItems": 5,
            "format": "json"
        });
        
        if (!bills || bills.length === 0) {
            renderList(out, `<p class='error'>No bills found for "${issue}".</p>`);
            return;
        }

        let html = `<p class='small'>Bills related to "${issue}":</p>`;
        
        bills.forEach(bill => {
            const billNum = bill.number || "Unknown";
            const title = bill.title || "No title available";
            
            html += `
                <p class="rep-line">
                    <span class="rep-name">${billNum}</span><br>
                    <span class="small">${title.substring(0, 60)}${title.length > 60 ? '…' : ''}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error("[handleIssueClick]", err);
        renderList(out, `<p class='error'>Error searching bills: ${err.message}</p>`);
    }
}

// =============================================
// BILL SEARCH
// =============================================
async function handleBillSearch() {
    const input = document.getElementById("billInput");
    const out = document.getElementById("billResult");
    const btn = document.getElementById("billSearchBtn");
    const raw = input?.value?.trim();

    if (!raw) {
        renderList(out, "<p class='error'>Please enter a bill number.</p>");
        return;
    }

    btn.disabled = true;
    renderList(out, "<p class='info'>Searching bill…</p>");

    try {
        const bills = await runApifyActor({ 
            "endpoint": "bill", 
            "searchTerm": raw,
            "maxItems": 1,
            "format": "json"
        });
        
        if (!bills || bills.length === 0) {
            renderList(out, "<p class='error'>No bill found.</p>");
            return;
        }

        const bill = bills[0];
        const billNum = bill.number || raw;
        const title = bill.title || "No title available";
        const updateDate = bill.updateDate ? formatDate(bill.updateDate) : "Unknown";
        const status = bill.latestAction?.text || "Status unknown";

        renderList(out, `
            <p><strong>${billNum}</strong></p>
            <p class="small">${title}</p>
            <p class="small">📅 ${updateDate}</p>
            <p class="small">📋 ${status}</p>
        `);
    } catch (err) {
        console.error("[handleBillSearch]", err);
        renderList(out, `<p class='error'>${err.message}</p>`);
    } finally {
        btn.disabled = false;
    }
}

// =============================================
// INITIALIZATION
// =============================================
document.addEventListener("DOMContentLoaded", () => {
    console.log("[INIT] DOM ready");

    // Connect buttons
    document.getElementById("billSearchBtn")?.addEventListener("click", handleBillSearch);
    document.getElementById("zipSearchBtn")?.addEventListener("click", handleZipSearch);

    // Connect issue buttons
    document.querySelectorAll(".issue-btn").forEach(btn => {
        btn.addEventListener("click", () => handleIssueClick(btn.dataset.issue));
    });

    // Load initial data
    loadTrendingBills();
    loadRecentVotes("house", "recentHouseVotes");
    loadRecentVotes("senate", "recentSenateVotes");
});
