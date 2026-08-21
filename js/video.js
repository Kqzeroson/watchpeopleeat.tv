// watchpeopleeat.tv — single video/thread logic

const params = new URLSearchParams(window.location.search);
const videoId = params.get("id");

let currentSession = null;
let currentProfile = null;

function greentextify(body) {
  return escapeHtml(body)
    .split("\n")
    .map(line => line.trim().startsWith("&gt;") ? `<span class="greentext">${line}</span>` : line)
    .join("\n");
}

async function getPublicVideoUrl(storagePath) {
  const { data } = supabaseClient.storage.from("videos").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function loadVideo() {
  if (!videoId) {
    document.getElementById("video-stage").innerHTML = `<div class="msg error">no video id in URL.</div>`;
    return;
  }

  const { data: video, error } = await supabaseClient
    .from("videos")
    .select("*, profiles!uploader_id(username)")
    .eq("id", videoId)
    .single();

  if (error || !video) {
    document.getElementById("video-stage").innerHTML = `<div class="msg error">video not found or removed.</div>`;
    return;
  }

  document.title = `${video.title} — watchpeopleeat.tv`;
  const url = await getPublicVideoUrl(video.storage_path);
  document.getElementById("video-stage").innerHTML = `<video src="${url}" controls preload="metadata"></video>`;

  const uploader = video.profiles ? video.profiles.username : "anon";
  document.getElementById("video-header").innerHTML = `
    <h1>${escapeHtml(video.title)}</h1>
    <div class="meta">uploaded by ${escapeHtml(uploader)} · ${timeAgo(video.created_at)}</div>
    ${video.description ? `<div class="desc">${escapeHtml(video.description)}</div>` : ""}
  `;

  await loadTags(video.id);
  await loadReactions(video.id);
  await loadComments(video.id);
}

async function loadTags(vid) {
  const { data } = await supabaseClient
    .from("video_tags")
    .select("tags(id, name)")
    .eq("video_id", vid);
  const el = document.getElementById("tags-row");
  if (!data || data.length === 0) { el.innerHTML = ""; return; }
  el.innerHTML = data.map(row =>
    `<a class="tag-pill" href="index.html">${escapeHtml(row.tags.name)}</a>`
  ).join("");
}

async function loadReactions(vid) {
  const { data: reactions } = await supabaseClient.from("reactions").select("user_id, reaction").eq("video_id", vid);
  const likes = (reactions || []).filter(r => r.reaction === "like").length;
  const dislikes = (reactions || []).filter(r => r.reaction === "dislike").length;
  const mine = currentSession ? (reactions || []).find(r => r.user_id === currentSession.user.id) : null;

  const el = document.getElementById("reactions");
  el.innerHTML = `
    <button id="like-btn" class="${mine?.reaction === "like" ? "active like" : ""}">▲ like (${likes})</button>
    <button id="dislike-btn" class="${mine?.reaction === "dislike" ? "active dislike" : ""}">▼ dislike (${dislikes})</button>
  `;

  document.getElementById("like-btn").addEventListener("click", () => react(vid, "like"));
  document.getElementById("dislike-btn").addEventListener("click", () => react(vid, "dislike"));
}

async function react(vid, type) {
  if (!currentSession) { window.location.href = "login.html"; return; }
  const { data: existing } = await supabaseClient
    .from("reactions").select("*")
    .eq("video_id", vid).eq("user_id", currentSession.user.id).maybeSingle();

  if (existing && existing.reaction === type) {
    await supabaseClient.from("reactions").delete().eq("video_id", vid).eq("user_id", currentSession.user.id);
  } else if (existing) {
    await supabaseClient.from("reactions").update({ reaction: type }).eq("video_id", vid).eq("user_id", currentSession.user.id);
  } else {
    await supabaseClient.from("reactions").insert({ video_id: vid, user_id: currentSession.user.id, reaction: type });
  }
  await loadReactions(vid);
}

async function loadComments(vid) {
  const { data: comments, error } = await supabaseClient
    .from("comments")
    .select("*, profiles!user_id(username, is_admin)")
    .eq("video_id", vid)
    .eq("is_removed", false)
    .order("created_at", { ascending: true });

  const el = document.getElementById("comment-list");
  if (error) { el.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`; return; }
  if (!comments || comments.length === 0) { el.innerHTML = `<div style="font-family:var(--mono); color:var(--dim);">no comments yet.</div>`; return; }

  const canModerate = currentProfile && currentProfile.is_admin;

  el.innerHTML = comments.map((c, i) => {
    const who = c.profiles ? c.profiles.username : "anon";
    const isMine = currentSession && c.user_id === currentSession.user.id;
    const showDelete = isMine || canModerate;
    return `
      <div class="comment" data-comment-id="${c.id}">
        <div class="head">
          <span class="num">No.${i + 1}</span>
          <span class="who">${escapeHtml(who)}</span>
          <span>${timeAgo(c.created_at)}</span>
        </div>
        <div class="body">${greentextify(c.body)}</div>
        ${showDelete ? `<div class="actions"><button class="danger delete-comment-btn">delete</button></div>` : ""}
      </div>`;
  }).join("");

  el.querySelectorAll(".delete-comment-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      const commentEl = e.target.closest(".comment");
      const id = commentEl.dataset.commentId;
      await supabaseClient.from("comments").update({ is_removed: true }).eq("id", id);
      await loadComments(vid);
    });
  });
}

async function initCommentForm() {
  const formArea = document.getElementById("comment-form-area");
  if (!currentSession) {
    formArea.innerHTML = `<p style="font-family:var(--mono); font-size:13px; color:var(--dim);">
      <a href="login.html">log in</a> to comment.</p>`;
    return;
  }
  document.getElementById("comment-submit").addEventListener("click", async () => {
    const input = document.getElementById("comment-input");
    const msg = document.getElementById("comment-msg");
    const body = input.value.trim();
    if (!body) return;
    const { error } = await supabaseClient.from("comments").insert({
      video_id: videoId,
      user_id: currentSession.user.id,
      body,
    });
    if (error) {
      msg.textContent = error.message;
      msg.className = "msg error";
      return;
    }
    input.value = "";
    msg.textContent = "";
    await loadComments(videoId);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  currentSession = await getSession();
  if (currentSession) currentProfile = await getProfile(currentSession.user.id);
  await loadVideo();
  await initCommentForm();
});
