console.log("🔍 Testing config:", window.APP_CONFIG);
console.log("🔑 Google Key exists:", !!window.APP_CONFIG?.GOOGLE_API_KEY);
console.log("🔑 Apify Token exists:", !!window.APP_CONFIG?.APIFY_TOKEN);
console.log("🚀 SCRIPT LOADED SUCCESSFULLY");

// =============================================
// LOAD KEYS FROM CONFIG.JS (config.js must load first!)
// =============================================
const GOOGLE_API_KEY = window.APP_CONFIG?.GOOGLE_API_KEY || "MISSING_GOOGLE_KEY";
const APIFY_TOKEN = window.APP_CONFIG?.APIFY_TOKEN || "MISSING_APIFY_TOKEN";

// Check if keys loaded properly
if (!window.APP_CONFIG) {
    console.error("❌ CRITICAL: config.js not loaded or missing. Make sure config.js loads before script.js");
    alert("Configuration error: config.js not found. The app will not work properly.");
} else if (GOOGLE_API_KEY === "MISSING_GOOGLE_KEY" || APIFY_TOKEN === "MISSING_APIFY_TOKEN") {
    console.error("❌ CRITICAL: API keys missing from config.js");
    alert("Configuration error: API keys missing. Check your config.js file.");
} else {
    console.log("✅ API keys loaded successfully from config.js");
}

// =============================================
// API CONFIGURATION
// =============================================
const GOOGLE_CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";
const APIFY_ACTOR = "fortuitous_pirate/congress-gov-scraper";

// =============================================
// FETCH WRAPPER
// =============================================
async function fetchJson(url) {
    console.log("[fetchJson] GET", url);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return await res.json();
    } catch (err) {
        console.error("[fetchJson] Error:", err);
        throw err;
    }
}

// =============================================
// HELPER FUNCTIONS
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
// ZIP LOOKUP - Google Civic API
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
        
        const data = await fetchJson(url);
        
        const offices = data.offices || [];
        const officials = data.officials || [];
        let html = "<p class='small'>Your federal representatives:</p>";
        
        // Find federal offices (Senate and House)
        offices.forEach((office, officeIndex) => {
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
// APIFY ACTOR RUNNER
// =============================================
async function runApifyActor(inputData) {
    try {
        // Start the actor
        const startUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`;
        const startRes = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(inputData)
        });
        
        if (!startRes.ok) throw new Error(`Failed to start actor: ${startRes.status}`);
        
        const run = await startRes.json();
        const runId = run.data.id;
        const datasetId = run.data.defaultDatasetId;
        
        // Wait a few seconds for the actor to run
        await new Promise(r => setTimeout(r, 3000));
        
        // Get results
        const dataUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${APIFY_TOKEN}`;
        const data = await fetchJson(dataUrl);
        
        return data;
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
    renderList(out, "<p class='info'>Loading trending bills…</p>");

    try {
        const bills = await runApifyActor({ 
            "endpoint": "bill", 
            "maxItems": 10,
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
                    <span class="rep-name">${billNum}</span>
                    <span class="small"> — ${title.substring(0, 80)}${title.length > 80 ? '…' : ''}</span><br/>
                    <span class="small">📅 ${updateDate}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error("[loadTrendingBills]", err);
        renderList(out, "<p class='error'>Unable to load bills. Check console.</p>");
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
            "maxItems": 10,
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
            const billNum = vote.bill?.number || "";
            
            html += `
                <p class="rep-line">
                    <span class="rep-name">${billNum ? billNum + ' - ' : ''}${question}</span><br/>
                    <span class="small">📅 ${date}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error(`[loadRecentVotes ${chamber}]`, err);
        renderList(out, `<p class='error'>Unable to load votes. Check console.</p>`);
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
            "maxItems": 10,
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
            const updateDate = bill.updateDate ? formatDate(bill.updateDate) : "Unknown";
            
            html += `
                <p class="rep-line">
                    <span class="rep-name">${billNum}</span>
                    <span class="small"> — ${title.substring(0, 80)}${title.length > 80 ? '…' : ''}</span><br/>
                    <span class="small">📅 ${updateDate}</span>
                </p>
            `;
        });

        renderList(out, html);
    } catch (err) {
        console.error("[handleIssueClick]", err);
        renderList(out, `<p class='error'>Error searching bills.</p>`);
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
        const sponsors = bill.sponsors?.map(s => s.name).join(', ') || "Unknown";

        renderList(out, `
            <p><strong>${billNum}</strong> — ${title}</p>
            <p class="small">📅 Latest: ${updateDate}</p>
            <p class="small">📋 Status: ${status}</p>
            <p class="small">👤 Sponsor(s): ${sponsors}</p>
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
