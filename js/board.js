// watchpeopleeat.tv — board (catalog) logic

let activeTag = null;
let searchTerm = "";
let sortMode = "new";

async function loadTagCloud() {
  const { data: tags } = await supabaseClient.from("tags").select("id, name").order("name");
  const el = document.getElementById("tag-cloud");
  if (!tags || tags.length === 0) {
    el.innerHTML = `<span style="color:var(--dim); font-family:var(--mono); font-size:11px;">no tags yet</span>`;
    return;
  }
  el.innerHTML = tags.map(t =>
    `<span class="tag-pill" data-tag-id="${t.id}">${escapeHtml(t.name)}</span>`
  ).join("");
  el.querySelectorAll(".tag-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const id = pill.dataset.tagId;
      if (activeTag === id) {
        activeTag = null;
        pill.classList.remove("active");
      } else {
        el.querySelectorAll(".tag-pill").forEach(p => p.classList.remove("active"));
        activeTag = id;
        pill.classList.add("active");
      }
      loadVideos();
    });
  });
}

function thumbFallback(title) {
  const initials = title.slice(0, 2).toUpperCase();
  return `<div class="thumb">${escapeHtml(initials)}</div>`;
}

async function loadVideos() {
  const catalog = document.getElementById("catalog");
  catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">loading…</div>`;

  let videoIds = null;
  if (activeTag) {
    const { data: vt } = await supabaseClient.from("video_tags").select("video_id").eq("tag_id", activeTag);
    videoIds = (vt || []).map(r => r.video_id);
    if (videoIds.length === 0) {
      catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">no videos with this tag yet.</div>`;
      document.getElementById("video-count").textContent = "0 videos";
      return;
    }
  }

  let query = supabaseClient
    .from("videos")
    .select("id, title, storage_path, thumbnail_path, created_at, uploader_id, profiles!uploader_id(username)")
    .eq("is_removed", false);

  if (videoIds) query = query.in("id", videoIds);
  if (searchTerm) query = query.ilike("title", `%${searchTerm}%`);

  const { data: videos, error } = await query.order("created_at", { ascending: false });

  if (error) {
    catalog.innerHTML = `<div class="msg error">could not load videos: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!videos || videos.length === 0) {
    catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">no videos yet. <a href="upload.html">be the first to upload one.</a></div>`;
    document.getElementById("video-count").textContent = "0 videos";
    return;
  }

  // pull reaction + comment counts for all visible videos in one shot each
  const ids = videos.map(v => v.id);
  const [{ data: reactions }, { data: comments }] = await Promise.all([
    supabaseClient.from("reactions").select("video_id, reaction").in("video_id", ids),
    supabaseClient.from("comments").select("video_id").in("video_id", ids).eq("is_removed", false),
  ]);

  const counts = {};
  ids.forEach(id => counts[id] = { likes: 0, dislikes: 0, comments: 0 });
  (reactions || []).forEach(r => { if (counts[r.video_id]) counts[r.video_id][r.reaction === "like" ? "likes" : "dislikes"]++; });
  (comments || []).forEach(c => { if (counts[c.video_id]) counts[c.video_id].comments++; });

  let sorted = [...videos];
  if (sortMode === "liked") {
    sorted.sort((a, b) => counts[b.id].likes - counts[a.id].likes);
  } else if (sortMode === "discussed") {
    sorted.sort((a, b) => counts[b.id].comments - counts[a.id].comments);
  }

  document.getElementById("video-count").textContent = `${videos.length} video${videos.length === 1 ? "" : "s"}`;

  catalog.innerHTML = sorted.map(v => {
    const c = counts[v.id];
    const uploader = v.profiles ? v.profiles.username : "anon";
    return `
      <div class="tile">
        ${thumbFallback(v.title)}
        <a class="title-link" href="video.html?id=${v.id}">${escapeHtml(v.title)}</a>
        <div class="stats">
          <span class="likes">▲${c.likes}</span>
          <span class="dislikes">▼${c.dislikes}</span>
          <span>💬${c.comments}</span>
        </div>
        <div style="font-family:var(--mono); font-size:10px; color:var(--dim); margin-top:4px;">
          by ${escapeHtml(uploader)} · ${timeAgo(v.created_at)}
        </div>
      </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadTagCloud();
  loadVideos();

  document.getElementById("sort-select").addEventListener("change", (e) => {
    sortMode = e.target.value;
    loadVideos();
  });

  let searchTimer;
  document.getElementById("search-input").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTerm = e.target.value.trim();
      loadVideos();
    }, 300);
  });
});
