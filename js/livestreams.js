// watchpeopleeat.tv — /livestreams.html logic

// Turns a normal YouTube/Twitch URL into something embeddable in an <iframe>.
// Falls back to treating the input as already-embeddable if it doesn't match.
function toEmbedUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    // youtu.be/VIDEOID
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1);
      return `https://www.youtube.com/embed/${id}`;
    }
    // youtube.com/watch?v=VIDEOID  or youtube.com/live/VIDEOID
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v");
      if (id) return `https://www.youtube.com/embed/${id}`;
      if (u.pathname.startsWith("/live/")) {
        return `https://www.youtube.com${u.pathname.replace("/live/", "/embed/")}`;
      }
      if (u.pathname.startsWith("/embed/")) return rawUrl;
    }
    // twitch.tv/CHANNEL
    if (u.hostname.includes("twitch.tv") && !u.hostname.includes("player")) {
      const channel = u.pathname.replace(/^\//, "");
      return `https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`;
    }
    return rawUrl; // assume it's already an embed URL
  } catch {
    return null; // invalid URL
  }
}

async function renderPostForm() {
  const area = document.getElementById("post-stream-area");
  const session = await getSession();
  if (!session) {
    area.innerHTML = `<p style="font-family:var(--mono); font-size:13px; color:var(--dim);">
      <a href="login.html">log in</a> to announce a stream.</p>`;
    return;
  }
  area.innerHTML = `
    <div class="field">
      <label for="stream-title">stream title</label>
      <input type="text" id="stream-title" maxlength="120">
    </div>
    <div class="field">
      <label for="stream-url">YouTube Live or Twitch URL</label>
      <input type="url" id="stream-url" placeholder="https://www.twitch.tv/yourchannel">
    </div>
    <button id="post-stream-btn" class="primary">announce stream</button>
    <div class="msg" id="stream-msg"></div>
  `;

  document.getElementById("post-stream-btn").addEventListener("click", async () => {
    const title = document.getElementById("stream-title").value.trim();
    const rawUrl = document.getElementById("stream-url").value.trim();
    const msg = document.getElementById("stream-msg");
    if (!title || !rawUrl) {
      msg.textContent = "add both a title and a URL.";
      msg.className = "msg error";
      return;
    }
    const embedUrl = toEmbedUrl(rawUrl);
    if (!embedUrl) {
      msg.textContent = "that doesn't look like a valid URL.";
      msg.className = "msg error";
      return;
    }
    const { error } = await supabaseClient.from("livestreams").insert({
      host_id: session.user.id,
      title,
      embed_url: embedUrl,
      is_live: true,
    });
    if (error) {
      msg.textContent = error.message;
      msg.className = "msg error";
      return;
    }
    document.getElementById("stream-title").value = "";
    document.getElementById("stream-url").value = "";
    msg.textContent = "posted.";
    msg.className = "msg ok";
    await loadStreams();
  });
}

async function loadStreams() {
  const el = document.getElementById("livestream-list");
  const { data: streams, error } = await supabaseClient
    .from("livestreams")
    .select("*, profiles(username)")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) { el.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`; return; }
  if (!streams || streams.length === 0) {
    el.innerHTML = `<p style="font-family:var(--mono); font-size:13px; color:var(--dim);">no streams announced yet.</p>`;
    return;
  }

  el.innerHTML = streams.map(s => {
    const host = s.profiles ? s.profiles.username : "anon";
    return `
      <div class="livestream-card">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <strong style="font-family:var(--display);">${escapeHtml(s.title)}</strong>
            <div style="font-size:12px; color:var(--dim);">hosted by ${escapeHtml(host)} · ${timeAgo(s.created_at)}</div>
          </div>
          ${s.is_live ? `<span class="live-badge">● live</span>` : ""}
        </div>
        <iframe src="${s.embed_url}" allowfullscreen></iframe>
      </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await renderPostForm();
  await loadStreams();
});
