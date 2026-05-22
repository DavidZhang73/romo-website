/* RoMo project page — gallery, taxonomy, charts, nav. No build step. */
(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => n.toLocaleString("en-US");

  // Soft palette shared with CSS
  const C = {
    brand: "#6d7cff", brand600: "#5560f0", brand700: "#454ccf",
    accent: "#ff8a7a", ink: "#15151a", muted: "#6b6b76", line: "#e7e8ee", band: "#f5f6f9",
  };
  const plotlyFont = { family: "Inter, system-ui, sans-serif", color: C.ink };
  const baseLayout = {
    font: plotlyFont, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    margin: { l: 56, r: 16, t: 10, b: 80 }, hoverlabel: { font: { family: "Inter" } },
  };
  const cfg = { displayModeBar: false, responsive: true };

  // ── data ───────────────────────────────────────────────
  // Read inline <script type="application/json" id="X-data"> if present
  // (single-file build), else fall back to fetching the JSON file.
  const load = (p) => {
    const id = p.replace(/^.*\//, "").replace(".json", "") + "-data";
    const el = document.getElementById(id);
    if (el && el.textContent.trim()) {
      try { return Promise.resolve(JSON.parse(el.textContent)); }
      catch (e) { return Promise.reject(e); }
    }
    return fetch(p).then((r) => (r.ok ? r.json() : Promise.reject(p)));
  };

  // ── Nav: shadow on scroll, scroll-spy, to-top ──────────
  function initNav() {
    const nav = $("#nav"), toTop = $("#to-top");
    const links = $$(".nav-link");
    const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle("scrolled", y > 24);
      toTop.classList.toggle("show", y > 600);
      let cur = sections[0];
      for (const s of sections) if (s.offsetTop - 90 <= y) cur = s;
      links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + (cur && cur.id)));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  // ── Scroll reveal + counters ───────────────────────────
  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        $$(".stat-num", e.target).forEach(animateCount);
        io.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => io.observe(el));
  }
  function animateCount(el) {
    if (!el || el.dataset.done) return;
    el.dataset.done = "1";
    const target = +el.dataset.count, suffix = el.dataset.suffix || "";
    const dur = 1100, t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
      el.textContent = fmt(v) + suffix;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ── Motion gallery ─────────────────────────────────────
  const PAGE_SIZE = 9;
  let allMotions = [], mObserver, curList = [], curPage = 0;
  function initGallery() {
    load("static/data/motions.json").then((motions) => {
      allMotions = motions;
      const cats = ["All", ...[...new Set(motions.map((m) => m.category))].sort()];
      const filters = $("#gallery-filters");
      cats.forEach((c, i) => {
        const b = document.createElement("button");
        b.className = "chip" + (i === 0 ? " active" : "");
        b.textContent = c;
        b.onclick = () => { $$(".chip", filters).forEach((x) => x.classList.remove("active")); b.classList.add("active"); select(c); };
        filters.appendChild(b);
      });
      // lazy-load model-viewers when near viewport
      mObserver = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { const mv = e.target; mv.setAttribute("src", mv.dataset.src); mObserver.unobserve(mv); } });
      }, { rootMargin: "200px" });
      select("All");
    }).catch(() => { $("#gallery-grid").innerHTML = errBox("motions.json not found — run scripts/extract_motions.py"); });
  }
  function select(cat) {
    curList = cat === "All" ? allMotions.slice() : allMotions.filter((m) => m.category === cat);
    curPage = 0;
    renderPage();
  }
  function renderPage() {
    const grid = $("#gallery-grid"), empty = $("#gallery-empty");
    grid.innerHTML = "";
    empty.classList.toggle("hidden", curList.length > 0);
    const start = curPage * PAGE_SIZE;
    curList.slice(start, start + PAGE_SIZE).forEach((m) => grid.appendChild(card(m)));
    renderPager();
  }
  function renderPager() {
    const pager = $("#gallery-pager");
    const pages = Math.ceil(curList.length / PAGE_SIZE);
    pager.innerHTML = "";
    if (pages <= 1) return;
    const go = (p) => { curPage = Math.max(0, Math.min(pages - 1, p)); renderPage();
      $("#gallery").scrollIntoView({ behavior: "smooth" }); };
    const btn = (html, p, disabled, active) => {
      const b = document.createElement("button");
      b.className = "page-btn" + (active ? " page-active" : "");
      b.innerHTML = html; b.disabled = !!disabled;
      if (!disabled && !active) b.onclick = () => go(p);
      return b;
    };
    pager.appendChild(btn('<i class="fas fa-chevron-left"></i>', curPage - 1, curPage === 0));
    // windowed page numbers
    const win = [];
    for (let i = 0; i < pages; i++) {
      if (i === 0 || i === pages - 1 || Math.abs(i - curPage) <= 1) win.push(i);
      else if (win[win.length - 1] !== "…") win.push("…");
    }
    win.forEach((i) => pager.appendChild(i === "…"
      ? Object.assign(document.createElement("span"), { className: "page-dots", textContent: "…" })
      : btn(String(i + 1), i, false, i === curPage)));
    pager.appendChild(btn('<i class="fas fa-chevron-right"></i>', curPage + 1, curPage === pages - 1));
  }
  function card(m) {
    const el = document.createElement("div");
    el.className = "motion-card";
    el.innerHTML = `
      <model-viewer data-src="${m.file}" camera-controls touch-action="pan-y"
        autoplay shadow-intensity="0.6" exposure="1.05"
        camera-orbit="0deg 80deg 3.4m" camera-target="0m 0.9m 0m" field-of-view="32deg"
        min-camera-orbit="auto auto 2m" max-camera-orbit="auto auto 8m"
        environment-image="neutral" interaction-prompt="none" loading="lazy"></model-viewer>
      <div class="motion-meta">
        <div class="motion-tags">
          <span class="motion-tag">${esc(m.category)}</span>
          ${m.subcategory ? `<span class="motion-tag sub">${esc(m.subcategory)}</span>` : ""}
        </div>
        <p class="motion-cap">${esc(m.caption || "")}</p>
      </div>`;
    mObserver.observe($("model-viewer", el));
    return el;
  }

  // ── Taxonomy: markmap + sunburst ───────────────────────
  function initTaxonomy() {
    load("static/data/taxonomy.json").then((tax) => {
      const map = $("#markmap"), sun = $("#sunburst");
      // Sunburst is the default view → build it now (visible, measurable).
      buildSunburst(tax);
      let mapBuilt = false;
      $("#tax-tab-sun").onclick = (e) => {
        tab(e.target); sun.classList.remove("hidden"); map.classList.add("hidden");
        Plotly.Plots.resize(sun);
      };
      $("#tax-tab-map").onclick = (e) => {
        tab(e.target); map.classList.remove("hidden"); sun.classList.add("hidden");
        // Build only once it's visible so markmap can measure the SVG.
        if (!mapBuilt) { buildMarkmap(tax); mapBuilt = true; }
      };
    }).catch(() => { $("#sunburst").outerHTML = errBox("taxonomy.json not found — run scripts/build_taxonomy.py"); });
  }
  function tab(btn) { $$(".seg-btn").forEach((b) => b.classList.remove("seg-active")); btn.classList.add("seg-active"); }

  function buildMarkmap(tax) {
    // 2 levels by default (category → subcategory); markmap collapses deeper nodes.
    const root = {
      content: `<strong>RoMo</strong> · 54 categories · 2,065 subcategories`,
      children: tax.categories.map((c) => ({
        content: `${c.name} <span style="opacity:.5">(${fmt(c.count)})</span>`,
        children: (c.subcategories || []).slice(0, 12).map((s) => ({
          content: `${s.name} <span style="opacity:.5">(${fmt(s.count)})</span>`,
        })),
        payload: { fold: 1 }, // subcategories start folded; click to expand
      })),
    };
    const { Markmap } = window.markmap;
    Markmap.create("#markmap", { initialExpandLevel: 2, duration: 350, spacingVertical: 6, paddingX: 12, fitRatio: 0.92 }, root);
  }

  function buildSunburst(tax) {
    const ids = [], labels = [], parents = [], values = [];
    tax.categories.forEach((c) => {
      const cid = "c:" + c.name;
      const subs = (c.subcategories || []).slice(0, 15);
      const subSum = subs.reduce((a, s) => a + s.count, 0);
      // branchvalues:"total" requires parent >= sum(children); guarantee it.
      ids.push(cid); labels.push(c.name); parents.push(""); values.push(Math.max(c.count, subSum));
      subs.forEach((s) => {
        ids.push(cid + "/" + s.name); labels.push(s.name); parents.push(cid); values.push(s.count);
      });
    });
    Plotly.newPlot("sunburst", [{
      type: "sunburst", ids, labels, parents, values, branchvalues: "total",
      maxdepth: 2, insidetextorientation: "radial",
      marker: { line: { color: "#fff", width: 1 } },
      hovertemplate: "<b>%{label}</b><br>%{value:,} sequences<extra></extra>",
    }], { ...baseLayout, margin: { l: 0, r: 0, t: 0, b: 0 },
      colorway: ["#6d7cff", "#9aa6ff", "#ff8a7a", "#ffd7cf", "#454ccf", "#a3b1ff"] }, cfg);
  }

  // ── Charts ─────────────────────────────────────────────
  function initCharts() {
    load("static/data/taxonomy.json").then((tax) => {
      const cats = tax.categories.slice().sort((a, b) => b.count - a.count);
      Plotly.newPlot("chart-categories", [{
        type: "bar", x: cats.map((c) => c.name), y: cats.map((c) => c.count),
        marker: { color: cats.map((_, i) => i % 2 ? C.brand : C.brand700), line: { width: 0 } },
        hovertemplate: "<b>%{x}</b><br>%{y:,} sequences<extra></extra>",
      }], { ...baseLayout, yaxis: { type: "log", gridcolor: C.line, zeroline: false, title: { text: "sequences (log)" } },
        xaxis: { tickangle: -45, automargin: true } }, cfg);
    }).catch(() => { $("#chart-categories").innerHTML = errBox("taxonomy.json missing"); });

    load("static/data/stats.json").then((s) => {
      const d = s.comparison.slice().sort((a, b) => a.sequences - b.sequences);
      Plotly.newPlot("chart-comparison", [{
        type: "bar", orientation: "h", x: d.map((x) => x.sequences), y: d.map((x) => x.dataset),
        customdata: d.map((x) => [x.hours, x.textDiv]),
        marker: { color: d.map((x) => x.ours ? C.accent : C.brand) },
        hovertemplate: "<b>%{y}</b><br>%{x:,} sequences · %{customdata[0]:,} h · text div %{customdata[1]}<extra></extra>",
      }], { ...baseLayout, margin: { l: 110, r: 16, t: 10, b: 44 },
        xaxis: { type: "log", gridcolor: C.line, title: { text: "sequences (log)" } } }, cfg);

      // Data-source pie
      const src = s.dataSources;
      Plotly.newPlot("chart-sources", [{
        type: "pie", labels: src.map((x) => x.name), values: src.map((x) => x.pct),
        hole: 0.55, sort: false, direction: "clockwise",
        textinfo: "label+percent", textposition: "outside",
        marker: { colors: ["#6d7cff", "#9aa6ff", "#ff8a7a", "#ffd7cf", "#c6cfff"], line: { color: "#fff", width: 2 } },
        hovertemplate: "<b>%{label}</b><br>%{percent}<extra></extra>",
      }], { ...baseLayout, margin: { l: 10, r: 10, t: 20, b: 20 }, showlegend: false }, cfg);
    }).catch(() => { $("#chart-comparison").innerHTML = errBox("stats.json missing"); });
  }

  // ── helpers ────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const errBox = (msg) => `<div style="padding:2rem;text-align:center;color:#9aa0ad">${esc(msg)}</div>`;

  window.copyBibTeX = function () {
    const code = $("#bibtex-code").innerText;
    navigator.clipboard.writeText(code).then(() => {
      const t = $("#copy-text"); t.textContent = "Copied!"; setTimeout(() => (t.textContent = "Copy"), 1600);
    });
  };

  // ── Filtering pipeline (scrollytelling funnel) ─────────
  function initPipeline() {
    const steps = $$(".pstep");
    if (!steps.length) return;
    const barsEl = $("#funnel-bars"), numEl = $("#funnel-hours"), dropEl = $("#funnel-drop"), nameEl = $("#funnel-name");
    const palette = ["#a3b1ff", "#8e9bff", "#7e90ff", "#6d7cff", "#7d77ec", "#ff9f8f", "#ff8a7a"];
    const data = steps.map((s) => ({ hours: +s.dataset.hours, drop: s.dataset.drop || "", name: s.dataset.name }));
    const lmax = Math.log(Math.max(...data.map((d) => d.hours)));
    const lmin = Math.log(Math.min(...data.map((d) => d.hours)));

    const bars = data.map((d, i) => {
      const b = document.createElement("div");
      b.className = "funnel-bar";
      const t = (Math.log(d.hours) - lmin) / (lmax - lmin || 1);
      b.style.width = (26 + t * 74) + "%";
      b.style.background = palette[i % palette.length];
      b.textContent = d.name;
      barsEl.appendChild(b);
      return b;
    });

    let cur = -1;
    const tweenNum = (() => {
      let raf, from = data[0].hours;
      return (to) => {
        cancelAnimationFrame(raf);
        const t0 = performance.now(), start = from, dur = 500;
        const tick = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const v = Math.round(start + (to - start) * (1 - Math.pow(1 - k, 3)));
          numEl.innerHTML = fmt(v) + '<span class="fr-unit">h</span>';
          if (k < 1) raf = requestAnimationFrame(tick); else from = to;
        };
        raf = requestAnimationFrame(tick);
      };
    })();

    const setActive = (i) => {
      if (i === cur) return;
      cur = i;
      bars.forEach((b, j) => b.classList.toggle("active", j === i));
      steps.forEach((s, j) => s.classList.toggle("pstep-active", j === i));
      tweenNum(data[i].hours);
      dropEl.innerHTML = data[i].drop || "&nbsp;";
      nameEl.textContent = data[i].name;
    };

    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) setActive(+e.target.dataset.i); });
    }, { rootMargin: "-45% 0px -45% 0px", threshold: 0 });
    steps.forEach((s) => io.observe(s));
    setActive(0);
  }

  // ── Dropdown (HuggingFace) ─────────────────────────────
  function initDropdown() {
    const dd = $("#hf-btn") && $("#hf-btn").closest(".dropdown");
    if (!dd) return;
    const btn = $("#hf-btn");
    btn.onclick = (e) => { e.stopPropagation(); const open = dd.classList.toggle("open"); btn.setAttribute("aria-expanded", open); };
    document.addEventListener("click", () => { dd.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); });
  }

  // ── boot ───────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    initNav(); initReveal(); initGallery(); initTaxonomy(); initCharts(); initPipeline(); initDropdown();
  });
})();
