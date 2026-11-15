const evidence = {
  annualDetections: [
    { year: 2011, value: 10375 },
    { year: 2012, value: 92807 },
  ],
  overlap: [
    { label: "0–20 min", value: 80.03014318010551 },
    { label: "20–40 min", value: 57.63319899021214 },
  ],
  validation: [
    { label: "Peru", value: 3.525 },
    { label: "Amazon", value: 11.329 },
    { label: "Andes", value: 6.977 },
    { label: "Coast", value: 32.04 },
  ],
};

const fmt = new Intl.NumberFormat("en-US");
const annualChart = () => {
  const max = Math.max(...evidence.annualDetections.map((d) => d.value));
  const bars = evidence.annualDetections.map((d, i) => {
    const x = 70 + i * 210;
    const height = (d.value / max) * 148;
    const y = 184 - height;
    return `<rect class="bar-raw" x="${x}" y="${y}" width="100" height="${height}" rx="3"></rect><text class="value" x="${x + 50}" y="${Math.max(25, y - 10)}" text-anchor="middle">${fmt.format(d.value)}</text><text class="axis" x="${x + 50}" y="214" text-anchor="middle">${d.year}</text>`;
  }).join("");
  return `<svg viewBox="0 0 440 238" role="presentation" aria-hidden="true"><line class="grid-line" x1="36" y1="184" x2="410" y2="184"></line>${bars}<text class="axis" x="220" y="236" text-anchor="middle">Raw detections by year</text></svg>`;
};

const overlapChart = () => {
  const baseline = 230;
  const bars = evidence.overlap.map((d, i) => {
    const x = 76 + i * 210;
    const height = d.value * 1.65;
    const y = baseline - height;
    return `<rect class="bar-est" x="${x}" y="${y}" width="96" height="${height}" rx="3"></rect><text class="value" x="${x + 48}" y="${y - 12}" text-anchor="middle">${d.value.toFixed(1)}%</text><text class="axis" x="${x + 48}" y="258" text-anchor="middle">${d.label}</text>`;
  }).join("");
  return `<svg viewBox="0 0 440 276" role="presentation" aria-hidden="true"><line class="grid-line" x1="40" y1="230" x2="414" y2="230"></line>${bars}<text class="axis" x="220" y="274" text-anchor="middle">Aqua cell-days also seen by S-NPP</text></svg>`;
};

const validationChart = () => {
  const max = 35;
  const rows = evidence.validation.map((d, i) => {
    const y = 15 + i * 51;
    const width = d.value / max * 245;
    return `<text class="axis" x="0" y="${y + 23}">${d.label}</text><rect x="86" y="${y}" width="245" height="30" rx="3" fill="var(--surface-2)"></rect><rect class="${d.label === "Coast" ? "bar-raw" : "bar-est"}" x="86" y="${y}" width="${width}" height="30" rx="3"></rect><text class="value" x="${Math.min(341, 94 + width)}" y="${y + 22}">${d.value.toFixed(1)}%</text>`;
  }).join("");
  return `<svg viewBox="0 0 420 228" role="presentation" aria-hidden="true">${rows}<text class="axis" x="86" y="226">Mean annual relative difference</text></svg>`;
};

document.querySelector("#annual-chart").innerHTML = annualChart();
document.querySelector("#overlap-chart").innerHTML = overlapChart();
document.querySelector("#validation-chart").innerHTML = validationChart();

const themeButton = document.querySelector(".theme-toggle");
const themeLabel = document.querySelector(".theme-label");
const themeMeta = document.querySelector('meta[name="theme-color"]');
let savedTheme;
try {
  savedTheme = localStorage.getItem("firechronos-theme");
} catch {
  savedTheme = null;
}
if (savedTheme === "dark" || savedTheme === "light") document.documentElement.dataset.theme = savedTheme;

const prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

function resolvedTheme() {
  if (document.documentElement.dataset.theme === "auto") return prefersDark.matches ? "dark" : "light";
  return document.documentElement.dataset.theme;
}

function syncThemeControl() {
  const dark = resolvedTheme() === "dark";
  themeLabel.textContent = dark ? "Light mode" : "Dark mode";
  themeButton.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
  themeMeta.content = dark ? "#0f1b16" : "#f4f6f9";
}

syncThemeControl();
themeButton.addEventListener("click", () => {
  const nextTheme = resolvedTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = nextTheme;
  try {
    localStorage.setItem("firechronos-theme", nextTheme);
  } catch {
    document.documentElement.dataset.theme = nextTheme;
  }
  syncThemeControl();
});

prefersDark.addEventListener("change", () => {
  if (document.documentElement.dataset.theme === "auto") syncThemeControl();
});

let progressFrame = 0;
function updateProgress() {
  if (progressFrame) return;
  progressFrame = requestAnimationFrame(() => {
    progressFrame = 0;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const progress = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
    document.documentElement.style.setProperty("--reading-progress", progress);
  });
}

window.addEventListener("scroll", updateProgress, { passive: true });
window.addEventListener("resize", updateProgress, { passive: true });
updateProgress();

const navLinks = [...document.querySelectorAll('.site-header nav a[href^="#"]')];
const navTargets = new Map(navLinks.map((link) => [link.hash.slice(1), link]));
const activeSections = new Map();

function setActiveLink() {
  const active = [...activeSections.entries()].filter(([, ratio]) => ratio > 0).sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const [id, link] of navTargets) {
    if (id === active) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "location");
    } else {
      link.classList.remove("is-active");
      link.removeAttribute("aria-current");
    }
  }
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
if (!reducedMotion.matches && "IntersectionObserver" in window) {
  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  const grouped = new Map();
  for (const item of revealItems) {
    const section = item.closest("section") ?? item.parentElement;
    const group = grouped.get(section) ?? [];
    group.push(item);
    grouped.set(section, group);
  }
  for (const group of grouped.values()) {
    group.slice(0, 6).forEach((item, index) => item.style.setProperty("--reveal-delay", `${index * 70}ms`));
  }

  const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

  for (const item of revealItems) revealObserver.observe(item);

  const navObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) activeSections.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
    setActiveLink();
  }, { threshold: [0, 0.12, 0.28, 0.55], rootMargin: "-18% 0px -62% 0px" });

  for (const id of navTargets.keys()) {
    const section = document.getElementById(id);
    if (section) navObserver.observe(section);
  }
  document.documentElement.classList.add("has-motion");
}
