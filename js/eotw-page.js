// watchpeopleeat.tv — /eotw.html logic

async function loadCurrentEotw() {
  const el = document.getElementById("eotw-current");
  const { data: video } = await supabaseClient
    .from("videos")
    .select("id, title, description, storage_path, profiles!uploader_id(username)")
    .eq("is_featured", true)
    .eq("is_removed", false)
    .maybeSingle();

  if (!video) {
    el.innerHTML = `<p style="color:var(--dim); font-family:var(--mono); font-size:13px;">no one's been crowned yet. an admin can pick a winner from the admin panel.</p>`;
    return;
  }

  const { data: urlData } = supabaseClient.storage.from("videos").getPublicUrl(video.storage_path);
  const uploader = video.profiles ? video.profiles.username : "anon";

  el.innerHTML = `
    <div class="eotw-winner" style="flex-direction:column; align-items:stretch;">
      <video src="${urlData.publicUrl}" controls style="width:100%; border-radius:8px; background:#000;"></video>
      <div>
        <a class="title-link" style="font-size:18px;" href="video.html?id=${video.id}">${escapeHtml(video.title)}</a>
        <div style="color:var(--dim); font-size:13px; margin-top:4px;">by ${escapeHtml(uploader)}</div>
      </div>
    </div>`;
}

async function loadHistory() {
  const el = document.getElementById("eotw-history");
  const { data: videos } = await supabaseClient
    .from("videos")
    .select("id, title, featured_at, profiles!uploader_id(username)")
    .not("featured_at", "is", null)
    .eq("is_removed", false)
    .order("featured_at", { ascending: false });

  if (!videos || videos.length === 0) {
    el.innerHTML = `<p style="color:var(--dim); font-family:var(--mono); font-size:13px;">no history yet.</p>`;
    return;
  }

  el.innerHTML = videos.map(v => {
    const uploader = v.profiles ? v.profiles.username : "anon";
    const weekOf = v.featured_at ? new Date(v.featured_at).toLocaleDateString() : "";
    return `
      <div class="eotw-winner">
        <span class="week-label">${weekOf}</span>
        <a class="title-link" href="video.html?id=${v.id}">${escapeHtml(v.title)}</a>
        <span class="sub" style="font-size:12px; color:var(--dim);">by ${escapeHtml(uploader)}</span>
      </div>`;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadCurrentEotw();
  await loadHistory();
});
