// watchpeopleeat.tv — /explore.html logic
// Same building blocks as the board, but shuffled instead of sorted, meant
// for "surprise me" browsing rather than searching for something specific.

let exploreActiveTag = null;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function thumbFallback(title) {
  const initials = title.slice(0, 2).toUpperCase();
  return `<div class="thumb">${escapeHtml(initials)}</div>`;
}

async function loadExploreTags() {
  const { data: tags } = await supabaseClient.from("tags").select("id, name").order("name");
  const el = document.getElementById("tag-cloud");
  if (!tags || tags.length === 0) {
    el.innerHTML = `<span style="color:var(--dim); font-family:var(--mono); font-size:11px;">no tags yet</span>`;
    return;
  }
  el.innerHTML = tags.map(t => `<span class="tag-pill" data-tag-id="${t.id}">${escapeHtml(t.name)}</span>`).join("");
  el.querySelectorAll(".tag-pill").forEach(pill => {
    pill.addEventListener("click", () => {
      const id = pill.dataset.tagId;
      el.querySelectorAll(".tag-pill").forEach(p => p.classList.remove("active"));
      if (exploreActiveTag === id) {
        exploreActiveTag = null;
      } else {
        exploreActiveTag = id;
        pill.classList.add("active");
      }
      loadExploreVideos();
    });
  });
}

async function loadExploreVideos() {
  const catalog = document.getElementById("catalog");
  catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">shuffling…</div>`;

  let videoIds = null;
  if (exploreActiveTag) {
    const { data: vt } = await supabaseClient.from("video_tags").select("video_id").eq("tag_id", exploreActiveTag);
    videoIds = (vt || []).map(r => r.video_id);
    if (videoIds.length === 0) {
      catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">no videos with this tag yet.</div>`;
      document.getElementById("video-count").textContent = "0 videos";
      return;
    }
  }

  let query = supabaseClient
    .from("videos")
    .select("id, title, created_at, profiles!uploader_id(username)")
    .eq("is_removed", false);
  if (videoIds) query = query.in("id", videoIds);

  const { data: videos, error } = await query;

  if (error) {
    catalog.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }
  if (!videos || videos.length === 0) {
    catalog.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">nothing to explore yet.</div>`;
    document.getElementById("video-count").textContent = "0 videos";
    return;
  }

  const shuffled = shuffle(videos);
  document.getElementById("video-count").textContent = `${videos.length} video${videos.length === 1 ? "" : "s"}, shuffled`;

  catalog.innerHTML = shuffled.map(v => {
    const uploader = v.profiles ? v.profiles.username : "anon";
    return `
      <div class="tile">
        ${thumbFallback(v.title)}
        <a class="title-link" href="video.html?id=${v.id}">${escapeHtml(v.title)}</a>
        <div style="font-family:var(--mono); font-size:10px; color:var(--dim); margin-top:4px;">
          by ${escapeHtml(uploader)} · ${timeAgo(v.created_at)}
        </div>
      </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  loadExploreTags();
  loadExploreVideos();
  document.getElementById("shuffle-btn").addEventListener("click", loadExploreVideos);
});
