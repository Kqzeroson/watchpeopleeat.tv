// watchpeopleeat.tv — admin panel logic
// Access is gated purely on profiles.is_admin (set directly in the Supabase
// dashboard — see the note at the bottom of supabase/schema.sql). There is
// no separate "admin password"; whichever accounts you flag as is_admin
// in the database are the admin accounts.

async function requireAdmin() {
  const session = await getSession();
  const root = document.getElementById("admin-root");
  if (!session) {
    root.innerHTML = `<p style="font-family:var(--mono);">you must <a href="login.html">log in</a> first.</p>`;
    return null;
  }
  const profile = await getProfile(session.user.id);
  if (!profile || !profile.is_admin) {
    root.innerHTML = `<p style="font-family:var(--mono); color:var(--red);">this account does not have admin access.</p>`;
    return null;
  }
  return profile;
}

async function renderUsersTab() {
  const { data: users } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
  const rows = (users || []).map(u => `
    <tr class="${u.is_banned ? "banned" : ""} ${u.is_admin ? "admin-row" : ""}">
      <td>${escapeHtml(u.username)}</td>
      <td>${u.is_admin ? "admin" : "user"}</td>
      <td>${u.is_banned ? "banned" : "active"}</td>
      <td>${timeAgo(u.created_at)}</td>
      <td>
        <button class="ban-toggle" data-id="${u.id}" data-banned="${u.is_banned}">
          ${u.is_banned ? "unban" : "ban"}
        </button>
      </td>
    </tr>
  `).join("");

  return `
    <h3 style="font-family:var(--mono); color:var(--dim);">users</h3>
    <table class="admin-table">
      <thead><tr><th>username</th><th>role</th><th>status</th><th>joined</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function renderVideosTab() {
  const { data: videos } = await supabase
    .from("videos")
    .select("*, profiles(username)")
    .order("created_at", { ascending: false });

  const rows = (videos || []).map(v => `
    <tr class="${v.is_removed ? "banned" : ""}">
      <td><a href="video.html?id=${v.id}">${escapeHtml(v.title)}</a></td>
      <td>${escapeHtml(v.profiles ? v.profiles.username : "anon")}</td>
      <td>${v.is_removed ? "removed" : "live"}</td>
      <td>${timeAgo(v.created_at)}</td>
      <td>
        <button class="video-toggle" data-id="${v.id}" data-removed="${v.is_removed}">
          ${v.is_removed ? "restore" : "remove"}
        </button>
      </td>
    </tr>
  `).join("");

  return `
    <h3 style="font-family:var(--mono); color:var(--dim);">videos</h3>
    <table class="admin-table">
      <thead><tr><th>title</th><th>uploader</th><th>status</th><th>uploaded</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function attachHandlers() {
  document.querySelectorAll(".ban-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const currentlyBanned = btn.dataset.banned === "true";
      await supabase.from("profiles").update({ is_banned: !currentlyBanned }).eq("id", id);
      renderAll();
    });
  });
  document.querySelectorAll(".video-toggle").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const currentlyRemoved = btn.dataset.removed === "true";
      await supabase.from("videos").update({ is_removed: !currentlyRemoved }).eq("id", id);
      renderAll();
    });
  });
}

async function renderAll() {
  const root = document.getElementById("admin-root");
  root.innerHTML = `<p style="font-family:var(--mono); color:var(--dim);">loading…</p>`;
  const [usersHtml, videosHtml] = await Promise.all([renderUsersTab(), renderVideosTab()]);
  root.innerHTML = `
    <div style="margin-bottom:30px;">${usersHtml}</div>
    <div>${videosHtml}</div>
  `;
  attachHandlers();
}

document.addEventListener("DOMContentLoaded", async () => {
  const profile = await requireAdmin();
  if (!profile) return;
  await renderAll();
});
