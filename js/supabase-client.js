// watchpeopleeat.tv — Supabase client setup
//
// 1. Create a free project at https://supabase.com
// 2. Project Settings -> API -> copy "Project URL" and "anon public" key
// 3. Paste them below. The anon key is safe to expose in client-side code;
//    it only grants what your Row Level Security policies allow (see supabase/schema.sql).

const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR-ANON-PUBLIC-KEY";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---- shared helpers used across pages ----

async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) return null;
  return data;
}

async function renderTopbarSession() {
  const el = document.getElementById("session-area");
  if (!el) return;
  const session = await getSession();
  if (!session) {
    el.innerHTML = `<a href="login.html">log in</a><a href="register.html">register</a>`;
    return;
  }
  const profile = await getProfile(session.user.id);
  const name = profile ? profile.username : session.user.email;
  let adminLink = "";
  if (profile && profile.is_admin) {
    adminLink = `<a href="admin.html">admin</a>`;
  }
  el.innerHTML = `logged in as <strong style="color:var(--amber)">${escapeHtml(name)}</strong>
    ${adminLink}
    <a href="upload.html">upload</a>
    <a href="#" id="logout-link">log out</a>`;
  const logoutLink = document.getElementById("logout-link");
  if (logoutLink) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      await supabase.auth.signOut();
      window.location.href = "index.html";
    });
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const units = [
    ["y", 31536000], ["mo", 2592000], ["d", 86400],
    ["h", 3600], ["m", 60], ["s", 1]
  ];
  for (const [label, secs] of units) {
    const val = Math.floor(seconds / secs);
    if (val >= 1) return `${val}${label} ago`;
  }
  return "just now";
}

document.addEventListener("DOMContentLoaded", renderTopbarSession);
