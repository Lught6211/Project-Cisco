/** Grab one still frame from a live camera or screen-share stream, small enough to send with a chat message. */
export async function captureFrame(stream: MediaStream, maxWidth = 1280): Promise<{ mime: "image/jpeg"; data: string } | null> {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== "live") return null;
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await Promise.race([
      video.play().then(() => new Promise<void>((resolve) => {
        if (video.videoWidth > 0) resolve();
        else video.addEventListener("loadeddata", () => resolve(), { once: true });
      })),
      new Promise<void>((_, reject) => window.setTimeout(() => reject(new Error("camera timeout")), 3500)),
    ]);
    // Let the first real frame arrive (a camera that just opened can deliver a black frame).
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    const scale = Math.min(1, maxWidth / width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL("image/jpeg", 0.72);
    const data = url.slice(url.indexOf(",") + 1);
    return data.length > 100 ? { mime: "image/jpeg", data } : null;
  } catch {
    return null;
  } finally {
    video.pause();
    video.srcObject = null;
  }
}
