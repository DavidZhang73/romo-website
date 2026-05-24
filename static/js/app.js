/* RoMo project page — gallery, taxonomy, charts, nav. No build step. */

(() => {
  "use strict";

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const fmt = (n) => n.toLocaleString("en-US");
  // Coarse "k hours" — the funnel figures are approximate (125k, 3.8k, 1.3k).
  const kfmt = (n) => (n >= 10000 ? Math.round(n / 1000) : +(n / 1000).toFixed(1)) + "K";

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

  // ── lazy assets + data ─────────────────────────────────
  const load = (p) => fetch(p).then((r) => (r.ok ? r.json() : Promise.reject(p)));
  const scriptPromises = new Map();
  const loadScript = (src, ready) => {
    if (ready?.()) return Promise.resolve();
    if (scriptPromises.has(src)) return scriptPromises.get(src);
    const promise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    scriptPromises.set(src, promise);
    return promise;
  };
  const onIdle = (fn) => ("requestIdleCallback" in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 250));
  const whenVisible = (selector, fn, rootMargin = "600px 0px") => {
    const el = $(selector);
    if (!el) return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      fn();
    };
    if (!("IntersectionObserver" in window)) { start(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      io.disconnect();
      start();
    }, { rootMargin });
    io.observe(el);
  };
  const loadPlotly = () => loadScript(
    "https://cdn.jsdelivr.net/npm/plotly.js-dist-min@2.35.2/plotly.min.js",
    () => window.Plotly
  );
  const loadMarkmap = () => loadScript("https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js", () => window.d3)
    .then(() => loadScript(
      "https://cdn.jsdelivr.net/npm/markmap-view@0.18/dist/browser/index.js",
      () => window.markmap?.Markmap
    ));
  const loadLucide = () => loadScript(
    "https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js",
    () => window.lucide
  ).then(() => window.lucide.createIcons());
  const injectStructuredData = () => load("static/data/structured-data.json").then((data) => {
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }).catch(() => {});

  let taxonomyPromise = null;
  const loadTaxonomy = () => {
    if (!taxonomyPromise) {
      taxonomyPromise = fetch("static/data/taxonomy.json")
        .then((r) => (r.ok ? r.json() : Promise.reject("static/data/taxonomy.json")));
    }
    return taxonomyPromise;
  };

  let THREE = null, GLTFLoader = null, OrbitControls = null, threePromise = null;
  const loadThree = () => {
    if (!threePromise) {
      threePromise = Promise.all([
        import("three"),
        import("three/addons/loaders/GLTFLoader.js"),
        import("three/addons/controls/OrbitControls.js"),
      ]).then(([three, gltf, orbit]) => {
        THREE = three;
        GLTFLoader = gltf.GLTFLoader;
        OrbitControls = orbit.OrbitControls;
        clock = new THREE.Clock();
      });
    }
    return threePromise;
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

  // ── Motion gallery (custom three.js viewer) ────────────
  // 2 rows × 3 cols on desktop, fewer on mobile (#9).
  const pageSize = () => (window.matchMedia("(min-width:1024px)").matches ? 6 : 4);
  let allMotions = [], vObserver, curList = [], curPage = 0;
  const activeViewers = new Set();   // mounted viewers; disposed on every page change
  const capTimers = new Set();       // caption-carousel intervals; cleared on page change
  let rafId = null;

  // One shared render loop ticks every mounted viewer (only visible ones draw).
  let clock = null;
  function renderLoop() {
    if (!clock) return;
    const dt = clock.getDelta();
    activeViewers.forEach((v) => v.tick(dt));
    rafId = requestAnimationFrame(renderLoop);
  }
  function ensureLoop() { if (rafId == null) renderLoop(); }

  // Cornflower blue — matches the reference visualization (#4, #1).
  const CHAR_COLOR = 0x6495ed;

  // Shared checkerboard texture (1m squares) — three uploads per-renderer, so reuse is safe.
  let _checker = null;
  function checkerTexture() {
    if (_checker) return _checker;
    const N = 50, c = document.createElement("canvas");
    c.width = c.height = N * 2;
    const g = c.getContext("2d");
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++) {
        g.fillStyle = (i + j) % 2 === 0 ? "#f5f5f5" : "#d0d0d0";
        g.fillRect(i * 2, j * 2, 2, 2);
      }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    _checker = t;
    return t;
  }

  // One three.js viewer per card: checkerboard floor + recolored character.
  function makeViewer(m) {
    const wrap = document.createElement("div");
    wrap.className = "motion-stage";
    const canvas = document.createElement("canvas");
    wrap.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 100);
    camera.position.set(2.8, 1.7, 3.6);

    // Natural orbit: pivot at body height, drag = pure orbit, never under floor (#2).
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.target.set(0, 1.0, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 1.8;
    controls.maxDistance = 9;

    // Lighting mirrors the reference visualization.
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 10, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 40;
    key.shadow.bias = -0.0001; key.shadow.radius = 2;
    Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.5);
    fill.position.set(-5, 8, -5);
    scene.add(fill);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.3));

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(50, 50),
      new THREE.MeshPhongMaterial({ map: checkerTexture(), shininess: 10 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    let mixer = null, visible = false, disposed = false;

    function resize() {
      const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    new GLTFLoader().load(m.file, (gltf) => {
      if (disposed) return;
      const root = gltf.scene;
      root.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry) o.geometry.computeVertexNormals();   // smooth vertex normals
        o.material = new THREE.MeshPhysicalMaterial({         // solid cornflower blue (#4)
          color: CHAR_COLOR, roughness: 0.7, metalness: 0.0, clearcoat: 0.0,
          side: THREE.DoubleSide,
        });
        o.castShadow = true; o.receiveShadow = true;
      });
      // GLBs are authored with feet at y=0 — add as-is so they stand on the floor (#1).
      scene.add(root);
      controls.update();

      if (gltf.animations && gltf.animations.length) {
        mixer = new THREE.AnimationMixer(root);
        gltf.animations.forEach((clip) => mixer.clipAction(clip).play());  // autoplay (#5)
      }
      wrap.classList.add("ready");
    }, undefined, () => { wrap.classList.add("error"); });

    return {
      el: wrap,
      setVisible(v) { visible = v; },
      tick(dt) {
        if (!visible || disposed) return;
        if (mixer) mixer.update(dt);
        controls.update();
        renderer.render(scene, camera);
      },
      dispose() {
        disposed = true;
        ro.disconnect();
        controls.dispose();
        scene.traverse((o) => { if (o.isMesh) o.geometry?.dispose(); });
        renderer.dispose();
        renderer.forceContextLoss();
      },
    };
  }

  function initGallery() {
    Promise.all([load("static/data/motions.json"), loadThree()]).then(([motions]) => {
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
      // Expand/collapse the single-row filter strip (#2).
      const toggle = $("#filter-toggle");
      if (toggle) toggle.onclick = () => {
        const exp = filters.classList.toggle("expanded");
        toggle.classList.toggle("open", exp);
        toggle.setAttribute("aria-expanded", exp);
      };
      // Start/stop rendering as cards enter/leave the viewport.
      vObserver = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.target._viewer) e.target._viewer.setVisible(e.isIntersecting); });
      }, { rootMargin: "100px" });
      select("All");
    }).catch(() => { $("#gallery-grid").innerHTML = errBox("motions.json not found"); });
  }

  // "All" lands first: interleave categories (round-robin), each sorted by motion
  // intensity, so the opening page is diverse and lively (#10).
  function diversifiedAll() {
    const score = (m) => (m.dynamicScore == null ? -1 : parseFloat(m.dynamicScore));
    const byCat = new Map();
    allMotions.forEach((m) => { (byCat.get(m.category) || byCat.set(m.category, []).get(m.category)).push(m); });
    byCat.forEach((arr) => arr.sort((a, b) => score(b) - score(a)));
    const cats = [...byCat.keys()].sort((a, b) => score(byCat.get(b)[0]) - score(byCat.get(a)[0]));
    const out = [], idx = new Map(cats.map((c) => [c, 0]));
    for (let added = true; added;) {
      added = false;
      for (const c of cats) {
        const i = idx.get(c), arr = byCat.get(c);
        if (i < arr.length) { out.push(arr[i]); idx.set(c, i + 1); added = true; }
      }
    }
    return out;
  }

  function select(cat) {
    curList = cat === "All" ? diversifiedAll() : allMotions.filter((m) => m.category === cat);
    curPage = 0;
    renderPage();
  }
  function disposeViewers() {
    activeViewers.forEach((v) => { vObserver.unobserve(v.el); v.dispose(); });
    activeViewers.clear();
    capTimers.forEach(clearInterval); capTimers.clear();
  }
  function renderPage() {
    const grid = $("#gallery-grid"), empty = $("#gallery-empty");
    disposeViewers();
    grid.innerHTML = "";
    empty.classList.toggle("hidden", curList.length > 0);
    const size = pageSize(), start = curPage * size;
    curList.slice(start, start + size).forEach((m) => grid.appendChild(card(m)));
    renderPager();
    ensureLoop();
  }
  function renderPager() {
    const pager = $("#gallery-pager");
    const pages = Math.ceil(curList.length / pageSize());
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
    const viewer = makeViewer(m);
    el.appendChild(viewer.el);
    const caps = (m.captions && m.captions.length) ? m.captions : [m.caption].filter(Boolean);
    const meta = document.createElement("div");
    meta.className = "motion-meta";
    meta.innerHTML = `
      <div class="motion-tags">
        <span class="motion-tag">${esc(m.category)}</span>
        ${m.subcategory ? `<span class="motion-tag sub">${esc(m.subcategory)}</span>` : ""}
        ${m.atomicAction ? `<span class="motion-tag act">${esc(m.atomicAction)}</span>` : ""}
      </div>
      <p class="motion-cap">${esc(caps[0] || "")}</p>
      ${caps.length > 1 ? `<div class="cap-dots">${caps.map((_, i) =>
        `<button class="cap-dot${i === 0 ? " active" : ""}" data-i="${i}" aria-label="Caption ${i + 1}"></button>`).join("")}</div>` : ""}`;
    el.appendChild(meta);

    // 5-caption carousel: clickable dots + gentle auto-rotate (#3).
    if (caps.length > 1) {
      const capEl = $(".motion-cap", meta), dots = $$(".cap-dot", meta);
      let ci = 0, timer;
      const show = (i) => { ci = (i + caps.length) % caps.length; capEl.textContent = caps[ci];
        dots.forEach((d, j) => d.classList.toggle("active", j === ci)); };
      const reset = () => { clearInterval(timer); timer = setInterval(() => show(ci + 1), 4500); capTimers.add(timer); };
      dots.forEach((d) => d.onclick = () => { show(+d.dataset.i); reset(); });
      meta.addEventListener("mouseenter", () => clearInterval(timer));
      meta.addEventListener("mouseleave", reset);
      reset();
    }
    viewer.el._viewer = viewer;
    activeViewers.add(viewer);
    vObserver.observe(viewer.el);
    return el;
  }

  // ── Taxonomy: markmap + sunburst ───────────────────────
  function initTaxonomy() {
    Promise.all([loadTaxonomy(), loadPlotly()]).then(([tax]) => {
      const map = $("#markmap"), sun = $("#sunburst");
      updateTaxonomySummary(tax);
      // Sunburst is the default view → build it now (visible, measurable).
      buildSunburst(tax);
      let mapBuilt = false;
      $("#tax-tab-sun").onclick = (e) => {
        tab(e.target); sun.classList.remove("hidden"); map.classList.add("hidden");
        window.Plotly.Plots.resize(sun);
      };
      $("#tax-tab-map").onclick = (e) => {
        tab(e.target); map.classList.remove("hidden"); sun.classList.add("hidden");
        // Build only once it's visible so markmap can measure the SVG.
        if (!mapBuilt) buildMarkmap(tax)
          .then(() => { mapBuilt = true; })
          .catch(() => { map.outerHTML = errBox("markmap failed to load"); });
      };
    }).catch(() => { $("#sunburst").outerHTML = errBox("taxonomy.json not found — run scripts/build_taxonomy.py"); });
  }
  function tab(btn) { $$(".seg-btn").forEach((b) => b.classList.remove("seg-active")); btn.classList.add("seg-active"); }

  function updateTaxonomySummary(tax) {
    const totals = tax.totals || {};
    const set = (id, value) => { const el = $(id); if (el && value != null) el.textContent = fmt(value); };
    set("#tax-summary-categories", totals.categories || tax.categories.length);
    set("#tax-summary-subcategories", totals.subcategories);
  }

  function buildMarkmap(tax) {
    const totals = tax.totals || {};
    const root = {
      content: `<strong>RoMo</strong> · ${fmt(totals.categories || tax.categories.length)} categories · ${fmt(totals.subcategories || 0)} subcategories`,
      children: tax.categories.map((c) => ({
        content: `${c.name} <span style="opacity:.5">(${fmt(c.count)})</span>`,
        children: (c.subcategories || []).map((s) => ({
          content: `${s.name} <span style="opacity:.5">(${fmt(s.count)})</span>`,
          payload: { fold: 1 },
        })),
      })),
    };
    return loadMarkmap().then(() => {
      const { Markmap } = window.markmap;
      Markmap.create("#markmap", { initialExpandLevel: 2, duration: 350, spacingVertical: 6, paddingX: 12, fitRatio: 0.92 }, root);
    });
  }

  function buildSunburst(tax) {
    const ids = [], labels = [], parents = [], values = [];
    tax.categories.forEach((c) => {
      const cid = "c:" + c.name;
      const subs = c.subcategories || [];
      const subSum = subs.reduce((a, s) => a + s.count, 0);
      // branchvalues:"total" requires parent >= sum(children); guarantee it.
      ids.push(cid); labels.push(c.name); parents.push(""); values.push(Math.max(c.count, subSum));
      subs.forEach((s) => {
        const sid = cid + "/s:" + s.name;
        ids.push(sid); labels.push(s.name); parents.push(cid); values.push(s.count);
      });
    });
    window.Plotly.newPlot("sunburst", [{
      type: "sunburst", ids, labels, parents, values, branchvalues: "total",
      rotation: 90, maxdepth: 2, insidetextorientation: "radial",
      marker: { line: { color: "#fff", width: 1 } },
      hovertemplate: "<b>%{label}</b><br>%{value:,} sequences<extra></extra>",
    }], { ...baseLayout, margin: { l: 0, r: 0, t: 0, b: 0 },
      colorway: ["#6d7cff", "#9aa6ff", "#ff8a7a", "#ffd7cf", "#454ccf", "#a3b1ff"] }, cfg);
  }

  // ── Charts ─────────────────────────────────────────────
  function initCharts() {
    Promise.all([loadTaxonomy(), loadPlotly()]).then(([tax]) => {
      const cats = tax.categories.slice().sort((a, b) => b.count - a.count);
      window.Plotly.newPlot("chart-categories", [{
        type: "bar", x: cats.map((c) => c.name), y: cats.map((c) => c.count),
        marker: { color: cats.map((_, i) => i % 2 ? C.brand : C.brand700), line: { width: 0 } },
        hovertemplate: "<b>%{x}</b><br>%{y:,} sequences<extra></extra>",
      }], { ...baseLayout, yaxis: { gridcolor: C.line, zeroline: false, title: { text: "sequences" } },
        xaxis: { tickangle: -45, automargin: true } }, cfg);
    }).catch(() => { $("#chart-categories").innerHTML = errBox("taxonomy.json missing"); });

    Promise.all([load("static/data/stats.json"), loadPlotly()]).then(([s]) => {
      const comparisonButtons = {
        sequences: $("#comparison-seq"),
        hours: $("#comparison-hours"),
      };
      const renderComparison = (metric = "sequences") => {
        const isHours = metric === "hours";
        const d = s.comparison.slice().sort((a, b) => a[metric] - b[metric]);
        const valueLabel = isHours ? "hours" : "core clips";
        const valueSuffix = isHours ? " h" : " core clips";
        window.Plotly.react("chart-comparison", [{
          type: "bar", orientation: "h", x: d.map((x) => x[metric]), y: d.map((x) => x.dataset),
          customdata: d.map((x) => [x.sequences, x.hours, x.textDiv]),
          marker: { color: d.map((x) => x.ours ? C.accent : C.brand) },
          hovertemplate: `<b>%{y}</b><br>%{x:,}${valueSuffix}<br>%{customdata[0]:,} core clips · %{customdata[1]:,} h · text div %{customdata[2]}<extra></extra>`,
        }], { ...baseLayout, margin: { l: 110, r: 16, t: 10, b: 44 },
          xaxis: { gridcolor: C.line, title: { text: valueLabel } } }, cfg);
        Object.entries(comparisonButtons).forEach(([key, btn]) => {
          if (!btn) return;
          const active = key === metric;
          btn.classList.toggle("active", active);
          btn.setAttribute("aria-pressed", String(active));
        });
      };
      renderComparison("sequences");
      comparisonButtons.sequences?.addEventListener("click", () => renderComparison("sequences"));
      comparisonButtons.hours?.addEventListener("click", () => renderComparison("hours"));

      // Data-source pie
      const src = s.dataSources;
      const sourceCount = (n) => (n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : fmt(n));
      const sourceLabel = (x) => `${x.pct.toFixed(1)}% (${x.display || sourceCount(x.sequences)})`;
      const sourceHover = (x) => `<b>${esc(x.name)}</b><br>${sourceLabel(x)}`;
      window.Plotly.newPlot("chart-sources", [{
        type: "pie", labels: src.map((x) => x.name), values: src.map((x) => x.sequences),
        text: src.map(sourceLabel),
        hovertext: src.map(sourceHover),
        hole: 0.55, sort: false, direction: "clockwise",
        texttemplate: "%{label}<br>%{text}", textposition: "outside",
        marker: { colors: ["#6d7cff", "#9aa6ff", "#ff8a7a", "#ffd7cf", "#c6cfff", "#8ddfd1"], line: { color: "#fff", width: 2 } },
        hovertemplate: "%{hovertext}<extra></extra>",
      }], { ...baseLayout, margin: { l: 10, r: 10, t: 20, b: 20 }, showlegend: false }, cfg);
    }).catch(() => { $("#chart-comparison").innerHTML = errBox("stats data missing"); });
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
          numEl.textContent = kfmt(v);
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
      // Show how much of the raw footage remains, not the per-step drop (#4).
      const pct = data[i].hours / data[0].hours * 100;
      dropEl.textContent = (pct >= 10 ? Math.round(pct) : pct.toFixed(1).replace(/\.0$/, "")) + "% of raw footage";
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
    initNav(); initReveal(); initPipeline(); initDropdown();
    whenVisible("#gallery", initGallery);
    whenVisible("#taxonomy", initTaxonomy);
    whenVisible("#stats", initCharts);
    onIdle(loadLucide);
    onIdle(injectStructuredData);
  });
})();
