// watchpeopleeat.tv — upload logic

const MAX_FILE_BYTES = 500 * 1024 * 1024; // hard client-side ceiling before we even try to process

// quality presets for the ffmpeg pass: [height, crf] — lower crf = higher quality/bigger file
const QUALITY_PRESETS = {
  high:   { height: 720, crf: 23 },
  medium: { height: 720, crf: 30 },
  low:    { height: 480, crf: 34 },
};

let ffmpeg = null;
let ffmpegLoading = null;

function getFFmpeg() {
  if (!ffmpegLoading) {
    const { createFFmpeg } = FFmpeg;
    ffmpeg = createFFmpeg({ log: false });
    ffmpegLoading = ffmpeg.load().then(() => ffmpeg);
  }
  return ffmpegLoading;
}

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

// Uploads a file to Supabase Storage in ~6MB chunks using the TUS resumable-upload
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
  const processPanel = document.getElementById("process-panel");
  const previewVideo = document.getElementById("preview-video");
  const trimStart = document.getElementById("trim-start");
  const trimEnd = document.getElementById("trim-end");
  const trimDurationLabel = document.getElementById("trim-duration");
  const qualitySelect = document.getElementById("compress-quality");
  const estimateMsg = document.getElementById("estimate-msg");

  let sourceDuration = 0;

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    estimateMsg.textContent = "";
    if (!file) {
      processPanel.style.display = "none";
      return;
    }
    const url = URL.createObjectURL(file);
    previewVideo.src = url;
    previewVideo.onloadedmetadata = () => {
      sourceDuration = previewVideo.duration || 0;
      trimStart.value = "0";
      trimEnd.value = sourceDuration.toFixed(1);
      trimDurationLabel.textContent = `/ full length: ${sourceDuration.toFixed(1)}s`;
      estimateMsg.textContent = `original file: ${formatBytes(file.size)}`;
    };
    processPanel.style.display = "block";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("form-msg");
    const submitBtn = document.getElementById("submit-btn");
    const title = document.getElementById("title").value.trim();
    const description = document.getElementById("description").value.trim();
    const tagInput = document.getElementById("tags").value.trim();
    const originalFile = fileInput.files[0];

    if (!originalFile) {
      msg.textContent = "choose a video file first.";
      msg.className = "msg error";
      return;
    }
    if (originalFile.size > MAX_FILE_BYTES) {
      msg.textContent = "file is too large (max 500MB, even before trimming/compression).";
      msg.className = "msg error";
      return;
    }

    submitBtn.disabled = true;

    const start = Math.max(0, parseFloat(trimStart.value) || 0);
    const end = sourceDuration ? Math.min(sourceDuration, parseFloat(trimEnd.value) || sourceDuration) : null;
    const quality = qualitySelect.value;
    const isTrimmed = sourceDuration && (start > 0.05 || end < sourceDuration - 0.05);
    const needsProcessing = isTrimmed || quality !== "original";

    let fileToUpload = originalFile;
    let uploadExt = originalFile.name.split(".").pop();

    if (needsProcessing) {
      try {
        msg.textContent = "loading video processor (first time only, ~25MB)…";
        msg.className = "msg";
        const ff = await getFFmpeg();

        msg.textContent = "trimming/compressing your video…";
        const { fetchFile } = FFmpeg;
        const inName = "input." + uploadExt;
        ff.FS("writeFile", inName, await fetchFile(originalFile));

        const args = ["-i", inName];
        if (isTrimmed) {
          args.push("-ss", String(start), "-to", String(end));
        }
        if (quality !== "original") {
          const preset = QUALITY_PRESETS[quality];
          args.push(
            "-vf", `scale=-2:${preset.height}`,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", String(preset.crf),
            "-c:a", "aac", "-b:a", "128k"
          );
        } else {
          // trimmed only, no re-encode requested — but -ss/-to on some codecs needs a re-encode
          // to cut on an exact boundary, so re-encode at a safe default quality.
          args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac", "-b:a", "160k");
        }
        args.push("out.mp4");

        await ff.run(...args);
        const data = ff.FS("readFile", "out.mp4");
        fileToUpload = new File([data.buffer], "processed.mp4", { type: "video/mp4" });
        uploadExt = "mp4";

        // clean up ffmpeg's virtual filesystem
        try { ff.FS("unlink", inName); ff.FS("unlink", "out.mp4"); } catch (_) {}

        estimateMsg.textContent = `processed size: ${formatBytes(fileToUpload.size)} (was ${formatBytes(originalFile.size)})`;
      } catch (procErr) {
        msg.textContent = "could not process video: " + (procErr.message || procErr) + " — try uploading the original, or a shorter/smaller file.";
        msg.className = "msg error";
        submitBtn.disabled = false;
        return;
      }
    }

    if (fileToUpload.size > MAX_FILE_BYTES) {
      msg.textContent = `file is still ${formatBytes(fileToUpload.size)} after processing — try a shorter trim or a lower quality setting.`;
      msg.className = "msg error";
      submitBtn.disabled = false;
      return;
    }

    msg.textContent = "uploading video file…";
    msg.className = "msg";

    const progressWrap = document.getElementById("upload-progress-wrap");
    const progressBar = document.getElementById("upload-progress-bar");
    const progressLabel = document.getElementById("upload-progress-label");
    progressWrap.style.display = "block";
    progressBar.style.width = "0%";
    progressLabel.textContent = "";

    const storagePath = `${session.user.id}/${crypto.randomUUID()}.${uploadExt}`;

    try {
      await chunkedUpload({
        file: fileToUpload,
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
