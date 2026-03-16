console.log("SCRIPT LOADED SUCCESSFULLY");

const GOVTRACK_BASE = "https://cors-anywhere.herokuapp.com/https://www.govtrack.us/api/v2";

// -----------------------------------------------------------------------------
// FETCH WRAPPER
// -----------------------------------------------------------------------------
async function fetchJson(url) {
  console.log("[fetchJson] GET", url);
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error("[fetchJson] Network error:", err);
    throw new Error("Network error");
  }
  console.log("[fetchJson] Status:", res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------
function partyBadge(party) {
  if (party === "Democrat" || party === "Democratic") return { label: "D", cls: "badge-dem" };
  if (party === "Republican") return { label: "R", cls: "badge-rep" };
  return { label: "I", cls: "badge-ind" };
}

function voteBadge(vote) {
  if (!vote) return { label: "Unknown", cls: "badge-nv" };
  const v = vote.toLowerCase();
  if (v.includes("yea") || v.includes("yes")) return { label: "Yea", cls: "badge-yea" };
  if (v.includes("nay") || v.includes("no")) return { label: "Nay", cls: "badge-nay" };
  if (v.includes("not voting")) return { label: "Not Voting", cls: "badge-nv" };
  return { label: vote, cls: "badge-nv" };
}

function renderList(container, html) {
  if (!container) return;
  container.innerHTML = html || "<p class='info'>No results.</p>";
}

// -----------------------------------------------------------------------------
// BILL SEARCH
// -----------------------------------------------------------------------------
async function handleBillSearch() {
  const input = document.getElementById("billInput");
  const out   = document.getElementById("billResult");
  const btn   = document.getElementById("billSearchBtn");
  const raw   = (input?.value || "").trim();

  if (!raw) {
    renderList(out, "<p class='error'>Please enter a bill number.</p>");
    return;
  }

  btn.disabled = true;
  renderList(out, "<p class='info'>Searching bill…</p>");

  try {
    const billUrl = `${GOVTRACK_BASE}/bill?q=${encodeURIComponent(raw)}&sort=-current_status_date&limit=1`;
    const billData = await fetchJson(billUrl);

    if (!billData.objects?.length) {
      renderList(out, "<p class='error'>No bill found.</p>");
      return;
    }

    const bill = billData.objects[0];
    const billId = bill.id;
    const billDisplay = bill.display_number || raw;
    const billTitle = bill.title || billDisplay;
    const status = bill.current_status_label || "Status unknown";

    const votesUrl = `${GOVTRACK_BASE}/vote?bill=${billId}&sort=-created&limit=1`;
    const votesData = await fetchJson(votesUrl);

    if (!votesData.objects?.length) {
      renderList(out,
        `<p><strong>${billDisplay}</strong> — ${billTitle}</p>
         <p class="small">${status}</p>
         <p class="info">No roll call votes yet.</p>`
      );
      return;
    }

    const vote = votesData.objects[0];
    const voteDetail = await fetchJson(`${GOVTRACK_BASE}/vote/${vote.id}`);
    const breakdownHtml = buildVoteBreakdownHtml(voteDetail);

    renderList(out,
      `<p><strong>${billDisplay}</strong> — ${billTitle}</p>
       <p class="small">${status}</p>
       <p class="small">Latest vote: ${vote.question} (${vote.chamber})</p>
       ${breakdownHtml}`
    );

  } catch (err) {
    console.error("[handleBillSearch]", err);
    renderList(out, `<p class='error'>${err.message}</p>`);
  } finally {
    btn.disabled = false;
  }
}

// -----------------------------------------------------------------------------
// VOTE BREAKDOWN
// -----------------------------------------------------------------------------
function buildVoteBreakdownHtml(voteDetail) {
  if (!voteDetail?.votes) return "<p class='info'>No detailed vote data.</p>";

  const members = [];
  for (const option of Object.keys(voteDetail.votes)) {
    for (const m of voteDetail.votes[option] || []) {
      members.push({
        name: m.display_name || m.person?.name || "Unknown",
        party: m.party || m.person?.party || "Unknown",
        state: m.state || m.person?.state || "",
        option
      });
    }
  }

  if (!members.length) return "<p class='info'>No member votes recorded.</p>";

  const groups = {
    Democrat: { Yea: [], Nay: [], NV: [] },
    Republican: { Yea: [], Nay: [], NV: [] },
    Other: { Yea: [], Nay: [], NV: [] }
  };

  for (const m of members) {
    const partyKey =
      m.party === "Democrat" || m.party === "Democratic"
        ? "Democrat"
        : m.party === "Republican"
        ? "Republican"
        : "Other";

    const opt = m.option.toLowerCase();
    const bucket =
      opt.includes("yea") || opt.includes("yes")
        ? "Yea"
        : opt.includes("nay") || opt.includes("no")
        ? "Nay"
        : "NV";

    groups[partyKey][bucket].push(m);
  }

  function renderMember(m) {
    const pb = partyBadge(m.party);
    const vb = voteBadge(m.option);
    const state = m.state ? ` (${m.state})` : "";
    return `<p class="rep-line">
      <span class="rep-name">${m.name}${state}</span>
      <span class="badge ${pb.cls}">${pb.label}</span>
      <span class="badge ${vb.cls}">${vb.label}</span>
    </p>`;
  }

  function renderGroup(title, data) {
    const total = data.Yea.length + data.Nay.length + data.NV.length;
    if (!total) return "";
    return `
      <div class="group-title">${title} (${total})</div>
      ${data.Yea.length ? `<p class="small"><strong>Yea</strong> (${data.Yea.length})</p>` + data.Yea.map(renderMember).join("") : ""}
      ${data.Nay.length ? `<p class="small"><strong>Nay</strong> (${data.Nay.length})</p>` + data.Nay.map(renderMember).join("") : ""}
      ${data.NV.length ? `<p class="small"><strong>Not Voting</strong> (${data.NV.length})</p>` + data.NV.map(renderMember).join("") : ""}
    `;
  }

  return `
    <div class="group-title">Full Vote Breakdown</div>
    ${renderGroup("Democrats", groups.Democrat)}
    ${renderGroup("Republicans", groups.Republican)}
    ${renderGroup("Independents / Others", groups.Other)}
  `;
}

// -----------------------------------------------------------------------------
// ZIP LOOKUP
// -----------------------------------------------------------------------------
async function handleZipSearch() {
  const input = document.getElementById("zipInput");
  const out   = document.getElementById("zipResult");
  const btn   = document.getElementById("zipSearchBtn");
  const zip   = (input?.value || "").trim();

  if (!zip) {
    renderList(out, "<p class='error'>Enter a ZIP code.</p>");
    return;
  }

  btn.disabled = true;
  renderList(out, "<p class='info'>Looking up your representatives…</p>");

  try {
    const url = `${GOVTRACK_BASE}/role?current=true&zip=${encodeURIComponent(zip)}&limit=20`;
    const data = await fetchJson(url);

    if (!data.objects?.length) {
      renderList(out, "<p class='error'>No representatives found.</p>");
      return;
    }

    const reps = data.objects;
    const house = reps.filter(r => r.role_type === "representative");
    const senate = reps.filter(r => r.role_type === "senator");

    const parts = ["<p class='small'>Your current federal representatives:</p>"];

    if (house.length) {
      parts.push("<div class='group-title'>House</div>");
      house.forEach(r => {
        const pb = partyBadge(r.party);
        parts.push(`
          <p class="rep-line">
            <span class="rep-name">${r.person.name} (District ${r.district || "At-Large"})</span>
            <span class="badge ${pb.cls}">${pb.label}</span>
            <span class="small">${r.state}</span>
          </p>
        `);
      });
    }

    if (senate.length) {
      parts.push("<div class='group-title'>Senate</div>");
      senate.forEach(r => {
        const pb = partyBadge(r.party);
        parts.push(`
          <p class="rep-line">
            <span class="rep-name">${r.person.name}</span>
            <span class="badge ${pb.cls}">${pb.label}</span>
            <span class="small">${r.state}</span>
          </p>
        `);
      });
    }

    renderList(out, parts.join(""));

  } catch (err) {
    console.error("[handleZipSearch]", err);
    renderList(out, `<p class='error'>${err.message}</p>`);
  } finally {
    btn.disabled = false;
  }
}

// -----------------------------------------------------------------------------
// ISSUE BROWSE
// -----------------------------------------------------------------------------
async function handleIssueClick(issue) {
  const out = document.getElementById("issueResult");
  renderList(out, `<p class='info'>Searching bills related to "${issue}"…</p>`);

  try {
    const url = `${GOVTRACK_BASE}/bill?q=${encodeURIComponent(issue)}&sort=-current_status_date&limit=10`;
    const data = await fetchJson(url);

    if (!data.objects?.length) {
      renderList(out, "<p class='error'>No bills found.</p>");
      return;
    }

    const parts = ["<p class='small'>Top recent bills:</p>"];
    data.objects.forEach(b => {
      const num = b.display_number || b.number || "Bill";
      const title = b.title || "No title available";
      const status = b.current_status_label || "Status unknown";
      parts.push(`
        <p class="rep-line">
          <span class="rep-name">${num}</span>
          <span class="small"> — ${title}</span><br/>
          <span class="small">${status}</span>
        </p>
      `);
    });

    renderList(out, parts.join(""));

  } catch (err) {
    console.error("[handleIssueClick]", err);
    renderList(out, `<p class='error'>${err.message}</p>`);
  }
}

// -----------------------------------------------------------------------------
// TRENDING BILLS
// -----------------------------------------------------------------------------
async function loadTrendingBills() {
  const out = document.getElementById("trendingBills");
  renderList(out, "<p class='info'>Loading trending bills…</p>");

  try {
    const url = `${GOVTRACK_BASE}/bill?sort=-current_status_date&limit=10`;
    const data = await fetchJson(url);

    if (!data.objects?.length) {
      renderList(out, "<p class='info'>No trending bills.</p>");
      return;
    }

    const parts = [];
    data.objects.forEach(b => {
      const num = b.display_number || b.number || "Bill";
      const title = b.title || "No title available";
      const status = b.current_status_label || "Status unknown";
      parts.push(`
        <p class="rep-line">
          <span class="rep-name">${num}</span>
          <span class="small"> — ${title}</span><br/>
          <span class="small">${status}</span>
        </p>
      `);
    });

    renderList(out, parts.join(""));

  } catch (err) {
    console.error("[loadTrendingBills]", err);
    renderList(out, `<p class='error'>${err.message}</p>`);
  }
}

// -----------------------------------------------------------------------------
// RECENT VOTES
// -----------------------------------------------------------------------------
async function loadRecentVotes(chamber, containerId) {
  const out = document.getElementById(containerId);
  renderList(out, "<p class='info'>Loading recent votes…</p>");

  try {
    const url = `${GOVTRACK_BASE}/vote?sort=-created&chamber=${chamber}&limit=10`;
    const data = await fetchJson(url);

    if (!data.objects?.length) {
      renderList(out, "<p class='info'>No recent votes.</p>");
      return;
    }

    const parts = [];
    data.objects.forEach(v => {
      const label = v.question || "Vote";
      const when = v.created || "";
      const billNum = v.related_bill?.display_number || "";
      parts.push(`
        <p class="rep-line">
          <span class="rep-name">${billNum || v.chamber.toUpperCase()}</span>
          <span class="small"> — ${label}</span><br/>
          <span class="small">${when}</span>
        </p>
      `);
    });

    renderList(out, parts.join(""));

  } catch (err) {
    console.error("[loadRecentVotes]", err);
    renderList(out, `<p class='error'>${err.message}</p>`);
  }
}

// -----------------------------------------------------------------------------
// INIT
// -----------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("[INIT] DOM ready");

  document.getElementById("billSearchBtn")?.addEventListener("click", handleBillSearch);
  document.getElementById("zipSearchBtn")?.addEventListener("click", handleZipSearch);

  document.querySelectorAll(".issue-btn").forEach(btn => {
    btn.addEventListener("click", () => handleIssueClick(btn.dataset.issue));
  });

  loadTrendingBills();
  loadRecentVotes("house", "recentHouseVotes");
  loadRecentVotes("senate", "recentSenateVotes");
});
