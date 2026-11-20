const panel = document.getElementById("weatherPanel");
const video = document.getElementById("weatherVideo");
const motion = matchMedia("(prefers-reduced-motion: reduce)");

function syncVideo() {
  if (panel.hidden || document.hidden || motion.matches) {
    video.pause();
    video.hidden = motion.matches;
    return;
  }
  video.hidden = false;
  if (!video.hasAttribute("src")) video.src = video.dataset.src;
  video.play().catch(() => { /* The field poster stays visible. */ });
}

if (video && panel) {
  new MutationObserver(syncVideo).observe(panel, {attributes: true, attributeFilter: ["hidden"]});
  document.addEventListener("visibilitychange", syncVideo);
  motion.addEventListener("change", syncVideo);
  syncVideo();
}
