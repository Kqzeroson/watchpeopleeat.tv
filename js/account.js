// watchpeopleeat.tv — /account.html logic

async function renderLoggedOut() {
  const root = document.getElementById("account-root");
  root.innerHTML = `
    <div class="panel-box" style="margin:20px auto;">
      <h2>My Account</h2>
      <p style="font-size:14px;">Log in or create an account to upload videos, comment, and react.</p>
      <div style="display:flex; gap:10px; margin-top:14px;">
        <a href="login.html" class="btn primary">log in</a>
        <a href="register.html" class="btn">register</a>
      </div>
    </div>`;
}

async function renderLoggedIn(session, profile) {
  const root = document.getElementById("account-root");

  const { data: myVideos } = await supabase
    .from("videos")
    .select("id, title, created_at, is_removed")
    .eq("uploader_id", session.user.id)
    .order("created_at", { ascending: false });

  const videoRows = (myVideos || []).map(v => `
    <div class="tile" style="max-width:none;">
      <a class="title-link" href="video.html?id=${v.id}">${escapeHtml(v.title)}</a>
      <div style="font-size:11px; color:var(--dim); font-family:var(--mono);">
        ${timeAgo(v.created_at)} ${v.is_removed ? "· removed by moderation" : ""}
      </div>
    </div>
  `).join("");

  root.innerHTML = `
    <div class="panel-box" style="margin:20px auto 26px;">
      <h2>My Account</h2>
      <p style="font-family:var(--mono); font-size:13px;">
        username: <strong style="color:var(--orange-dk)">${escapeHtml(profile.username)}</strong><br>
        email: ${escapeHtml(session.user.email)}<br>
        role: ${profile.is_admin ? '<strong style="color:var(--orange-dk)">admin</strong>' : "member"}<br>
        joined: ${new Date(profile.created_at).toLocaleDateString()}
      </p>
      <div style="display:flex; gap:10px; margin-top:16px; flex-wrap:wrap;">
        <a href="upload.html" class="btn primary">upload a video</a>
        ${profile.is_admin ? '<a href="admin.html" class="btn secondary">admin panel</a>' : ""}
        <button id="logout-btn" class="danger">log out</button>
      </div>
    </div>

    <h3 style="font-family:var(--display); color:var(--dim); font-size:15px;">My uploads</h3>
    <div class="catalog" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));">
      ${videoRows || `<p style="font-family:var(--mono); font-size:13px; color:var(--dim);">you haven't uploaded anything yet.</p>`}
    </div>
  `;

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.href = "index.html";
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  if (!session) {
    await renderLoggedOut();
    return;
  }
  const profile = await getProfile(session.user.id);
  if (!profile) {
    await renderLoggedOut();
    return;
  }
  await renderLoggedIn(session, profile);
});
