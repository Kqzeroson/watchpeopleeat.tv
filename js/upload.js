// watchpeopleeat.tv — upload logic

const MAX_FILE_BYTES = 500 * 1024 * 1024; // 500MB, matches storage bucket limit suggested in schema.sql

function formatBytes(bytes) {
  if (!bytes) return "0MB";
  return (bytes / (1024 * 1024)).toFixed(1) + "MB";
}

// Extract the project ref from SUPABASE_URL (e.g. "https://abcxyz.supabase.co" -> "abcxyz")
// and use Supabase's direct storage hostname, which is faster/more reliable for large
// chunked uploads than going through the general API host.
function getResumableUploadEndpoint() {
  const projectId = new URL(SUPABASE_URL).hostname.split(".")[0];
  return `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;
}

// Uploads a file to Supabase Storage in chunks using the TUS resumable-upload
// protocol, instead of one single request. This avoids hitting request-body size
// limits on big files, and can retry/resume a chunk instead of failing the whole
// upload if the connection drops partway through.
function chunkedUpload({ file, bucketName, objectName, accessToken, onProgress }) {
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: getResumableUploadEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      chunkSize: 45 * 1024 * 1024, // 45MB per chunk
      headers: {
        authorization: `Bearer ${accessToken}`,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName,
        objectName,
        contentType: file.type || "video/mp4",
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) onProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => resolve(),
    });

    // resume a previous upload of this exact file if one was interrupted
    upload.findPreviousUploads().then((previousUploads) => {
      if (previousUploads.length) {
        upload.resumeFromPreviousUpload(previousUploads[0]);
      }
      upload.start();
    });
  });
}

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

  const fileInput = document.getElementById("video-file");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const submitBtn = document.getElementById("submit-btn");
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const tagInput = document.getElementById("tags").value.trim();
    const file = fileInput.files[0];

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

    const progressWrap = document.getElementById("upload-progress-wrap");
    const progressBar = document.getElementById("upload-progress-bar");
    const progressLabel = document.getElementById("upload-progress-label");
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    progressLabel.textContent = "";

    const ext = file.name.split(".").pop();
    const storagePath = `${session.user.id}/${crypto.randomUUID()}.${ext}`;

    try {
      await chunkedUpload({
        file,
        bucketName: "videos",
        objectName: storagePath,
        accessToken: session.access_token,
        onProgress: (uploaded, total) => {
          const pct = total ? Math.round((uploaded / total) * 100) : 0;
          progressBar.style.width = pct + "%";
          progressLabel.textContent = `${pct}% (${formatBytes(uploaded)} / ${formatBytes(total)})`;
        },
      });
    } catch (uploadError) {
      msg.textContent = "upload failed: " + (uploadError.message || uploadError);
      msg.className = "msg error";
      submitBtn.disabled = false;
      return;
    }

    progressLabel.textContent = "upload complete.";
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
