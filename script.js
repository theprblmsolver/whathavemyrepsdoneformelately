console.log("🚀 SCRIPT LOADED SUCCESSFULLY");

// =============================================
// STEP 1: PASTE YOUR KEYS HERE (replace the text inside quotes)
// =============================================

// =============================================
// API CONFIGURATION (do not change)
// =============================================
const GOOGLE_CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";
const APIFY_ACTOR = "fortuitous_pirate/congress-gov-scraper";

// =============================================
// HELPER FUNCTIONS
// =============================================
async function fetchJson(url) {
    console.log("Fetching:", url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
}

function partyBadge(party) {
    if (!party) return { label: "?", cls: "badge-unknown" };
    party = party.toLowerCase();
    if (party.includes("dem")) return { label: "D", cls: "badge-dem" };
    if (party.includes("repub")) return { label: "R", cls: "badge-rep" };
    return { label: "I", cls: "badge-ind" };
}

function formatDate(date) {
    return date ? new Date(date).toLocaleDateString() : "Unknown";
}

function renderList(container, html) {
    if (container) container.innerHTML = html;
}

// =============================================
// ZIP LOOKUP - THIS WILL WORK IMMEDIATELY
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
        // Call Google Civic API
        const url = `${GOOGLE_CIVIC_BASE}/representatives?address=${encodeURIComponent(zip)}&key=${GOOGLE_API_KEY}`;
        const data = await fetchJson(url);
        
        // Find federal offices (Senate and House)
        const offices = data.offices || [];
        const officials = data.officials || [];
        let html = "<p class='small'>Your federal representatives:</p>";
        
        offices.forEach((office, idx) => {
            // Check if it's a federal office
            if (office.name.includes("U.S. Senate") || office.name.includes("U.S. House")) {
                office.officialIndices.forEach(i => {
                    const rep = officials[i];
                    const badge = partyBadge(rep.party);
                    html += `
                        <p class="rep-line">
                            <span class="rep-name">${rep.name}</span>
                            <span class="badge ${badge.cls}">${badge.label}</span>
                            ${rep.phone ? ` 📞 ${rep.phone}` : ''}
                        </p>`;
                });
            }
        });
        
        renderList(out, html);
    } catch (err) {
        renderList(out, `<p class='error'>Error: ${err.message}</p>`);
    } finally {
        btn.disabled = false;
    }
}

// =============================================
// TRENDING BILLS - via Apify
// =============================================
async function loadTrendingBills() {
    const out = document.getElementById("trendingBills");
    renderList(out, "<p class='info'>Loading bills…</p>");

    try {
        // Start Apify actor
        const startUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`;
        const startRes = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "endpoint": "bill", "maxItems": 5 })
        });
        
        const run = await startRes.json();
        const runId = run.data.id;
        
        // Wait a few seconds for it to complete
        await new Promise(r => setTimeout(r, 3000));
        
        // Get results
        const dataUrl = `https://api.apify.com/v2/datasets/${run.data.defaultDatasetId}/items?token=${APIFY_TOKEN}`;
        const bills = await fetchJson(dataUrl);
        
        let html = "<p class='small'>Recent bills:</p>";
        bills.forEach(b => {
            html += `
                <p class="rep-line">
                    <span class="rep-name">${b.number || 'Bill'}</span><br>
                    <span class="small">${b.title?.substring(0, 60)}...</span>
                </p>`;
        });
        
        renderList(out, html);
    } catch (err) {
        renderList(out, "<p class='error'>Could not load bills</p>");
    }
}

// =============================================
// RECENT VOTES - via Apify
// =============================================
async function loadRecentVotes(chamber, containerId) {
    const out = document.getElementById(containerId);
    renderList(out, `<p class='info'>Loading votes…</p>`);

    try {
        const startUrl = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/runs?token=${APIFY_TOKEN}`;
        const startRes = await fetch(startUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ "endpoint": "vote", "maxItems": 5 })
        });
        
        const run = await startRes.json();
        await new Promise(r => setTimeout(r, 3000));
        
        const dataUrl = `https://api.apify.com/v2/datasets/${run.data.defaultDatasetId}/items?token=${APIFY_TOKEN}`;
        const votes = await fetchJson(dataUrl);
        
        let html = `<p class='small'>Recent ${chamber} votes:</p>`;
        votes.filter(v => v.chamber?.toLowerCase() === chamber).forEach(v => {
            html += `
                <p class="rep-line">
                    <span class="rep-name">${v.question || 'Vote'}</span><br>
                    <span class="small">${formatDate(v.date)}</span>
                </p>`;
        });
        
        renderList(out, html);
    } catch (err) {
        renderList(out, "<p class='error'>Could not load votes</p>");
    }
}

// =============================================
// START THE APP
// =============================================
document.addEventListener("DOMContentLoaded", () => {
    // Connect buttons
    document.getElementById("zipSearchBtn")?.addEventListener("click", handleZipSearch);
    
    // Load initial data
    loadTrendingBills();
    loadRecentVotes("house", "recentHouseVotes");
    loadRecentVotes("senate", "recentSenateVotes");
});
