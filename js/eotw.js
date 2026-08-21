// watchpeopleeat.tv — small shared widget: the "Eater of the Week" banner
// injected at the top of the homepage. See js/eotw-page.js for the full
// /eotw.html page (current pick + history).

async function renderEotwBanner() {
  const slot = document.getElementById("eotw-banner-slot");
  if (!slot) return;

  const { data: video } = await supabase
    .from("videos")
    .select("id, title, profiles(username)")
    .eq("is_featured", true)
    .eq("is_removed", false)
    .maybeSingle();

  if (!video) { slot.innerHTML = ""; return; }

  const uploader = video.profiles ? video.profiles.username : "anon";
  slot.innerHTML = `
    <div class="eotw-banner">
      <span class="badge">🏆 Eater of the Week</span>
      <a class="title-link" href="video.html?id=${video.id}">${escapeHtml(video.title)}</a>
      <span class="sub">by ${escapeHtml(uploader)} · <a href="eotw.html">see past winners →</a></span>
    </div>`;
}

document.addEventListener("DOMContentLoaded", renderEotwBanner);
