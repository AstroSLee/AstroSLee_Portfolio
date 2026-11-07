// Mobile menu toggle + click-to-open "Work" submenu (hover handles desktop).
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("site-nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}
document.querySelectorAll(".has-sub > button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const li = btn.parentElement;
    const open = li.classList.toggle("open");
    btn.setAttribute("aria-expanded", String(open));
  });
});
document.addEventListener("click", (e) => {
  document.querySelectorAll(".has-sub.open").forEach((li) => {
    if (!li.contains(e.target)) { li.classList.remove("open"); li.querySelector("button").setAttribute("aria-expanded", "false"); }
  });
});

// Ambient (autoplaying) videos: only play while visible, and respect reduced-motion.
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ambient = document.querySelectorAll("video[autoplay]");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !reduce) target.play().catch(() => {});
      else target.pause();
    }
  }, { rootMargin: "200px" });
  ambient.forEach((v) => io.observe(v));
}
