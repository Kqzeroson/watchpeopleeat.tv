// watchpeopleeat.tv — upload logic

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB, matches storage bucket limit suggested in schema.sql

document.addEventListener("DOMContentLoaded", async () => {
  const session = await getSession();
  const form = document.getElementById("upload-form");
  const needLogin = document.getElementById("need-login");

  if (!session) {
    form.style.display = "none";
    needLogin.style.display = "block";
    return;
  }

  const profile = await getProfile(session.user.id);
  if (profile && profile.is_banned) {
    form.style.display = "none";
    needLogin.innerHTML = "<p>this account is banned and can't upload.</p>";
    needLogin.style.display = "block";
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const submitBtn = document.getElementById("submit-btn");
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const tagInput = document.getElementById("tags").value.trim();
    const file = document.getElementById("video-file").files[0];

    if (!file) {
      msg.textContent = "choose a video file first.";
      msg.className = "msg error";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      msg.textContent = "file is too large (max 500MB).";
      msg.className = "msg error";
      return;
    }

    submitBtn.disabled = true;
    msg.textContent = "uploading video file…";
    msg.className = "msg";

    const ext = file.name.split(".").pop();
    const storagePath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("videos")
      .upload(storagePath, file, { cacheControl: "3600", upsert: false });

    if (uploadError) {
      msg.textContent = "upload failed: " + uploadError.message;
      msg.className = "msg error";
      submitBtn.disabled = false;
      return;
    }

    msg.textContent = "saving post…";

    const { data: videoRow, error: insertError } = await supabaseClient
      .from("videos")
      .insert({
        uploader_id: session.user.id,
        title,
        description,
        storage_path: storagePath,
      })
      .select()
      .single();

    if (insertError) {
      msg.textContent = "could not save video row: " + insertError.message;
      msg.className = "msg error";
      submitBtn.disabled = false;
      return;
    }

    // handle tags: find-or-create each, then link
    const tagNames = tagInput
      .split(",")
      .map(t => t.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10);

    for (const name of tagNames) {
      let { data: existingTag } = await supabaseClient.from("tags").select("id").eq("name", name).maybeSingle();
      let tagId = existingTag?.id;
      if (!tagId) {
        const { data: newTag, error: tagErr } = await supabaseClient.from("tags").insert({ name }).select().single();
        if (tagErr) continue;
        tagId = newTag.id;
      }
      await supabaseClient.from("video_tags").insert({ video_id: videoRow.id, tag_id: tagId });
    }

    msg.textContent = "uploaded! redirecting…";
    msg.className = "msg ok";
    window.location.href = `video.html?id=${videoRow.id}`;
  });
});
