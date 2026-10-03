import { scenes, flagMeta, nextOf, listEndings } from "./script.js";

const SAVE_KEY = "xingkong-prototype-v1";
const AUDIO_KEY = "xingkong-prototype-audio";
const instant = new URLSearchParams(location.search).has("instant");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const figureDir = {
  lingchen: "../characters/凌晨/",
  suting: "../characters/素婷/",
  qishan: "../characters/綺珊/",
  zhijun: "../characters/芷君/",
};

const defaultExpr = {
  lingchen: "01-shrug.png",
  suting: "01-smile.png",
  qishan: "01-grin.png",
  zhijun: "01-laugh.png",
};

// Expression file for the figure on screen. Omitted scenes use defaultExpr.
const sceneExpr = {
  open3: "05-fire.png",
  st2: "02-sigh.png",
  wall1: "03-worry.png",
  wall2: "03-worry.png",
  wall3: "02-sigh.png",
  wall_slow4: "05-spring.png",
  wall_run1: "03-worry.png",
  wall_run2: "02-sigh.png",
  qi_cool2: "04-loud.png",
  qi_cool4: "04-loud.png",
  qi_honest2: "05-wink.png",
  qi_honest4: "05-wink.png",
  temple2: "04-loud.png",
  temple_choice: "05-wink.png",
  temple_hold1: "05-wink.png",
  temple_name2: "05-tearsmile.png",
  star1: "02-sigh.png",
  star2: "02-hips.png",
  star3: "05-fire.png",
  star4: "04-loud.png",
  star5: "02-blush.png",
  branch: "04-cold.png",
  s1: "03-worry.png",
  s3: "03-angry.png",
  s4: "02-sigh.png",
  s_true1: "05-spring.png",
  s_true2: "05-spring.png",
  s_true3: "05-spring.png",
  s_good1: "02-sigh.png",
  s_good2: "04-tears.png",
  s_bad_rip: "04-tears.png",
  z1: "03-glare.png",
  z3: "05-tearsmile.png",
  z4: "04-puff.png",
  z_choice: "03-glare.png",
  z_true1: "05-tearsmile.png",
  z_good1: "05-tearsmile.png",
  z_bad_shield: "03-glare.png",
  z_bad_bridge: "04-puff.png",
  q1: "02-laugh.png",
  q2: "05-wink.png",
  q_choice: "05-wink.png",
  q_true1: "02-laugh.png",
  q_true2: "02-laugh.png",
  q_good1: "05-wink.png",
  q_bad_setup: "03-angry.png",
  q_bad_cool: "03-angry.png",
};

const figureName = { lingchen: "凌晨", suting: "素婷", zhijun: "芷君", qishan: "綺珊" };

// Far sprite (right, smaller). Files live in that character's folder.
const sceneFarExpr = {
  temple1: "01-laugh.png",
  temple2: "02-hips.png",
  temple_choice: "02-hips.png",
  temple_hold1: "01-laugh.png",
};

const speakerClass = {
  凌晨: "who-ling",
  素婷: "who-su",
  芷君: "who-zhi",
  綺珊: "who-qi",
  家綸: "who-jia",
  會長: "who-hui",
};

const sfxUrl = {
  click: "../sound/01-click.mp3",
  confirm: "../sound/02-confirm.mp3",
  cancel: "../sound/03-cancel.mp3",
  select: "../sound/04-select.mp3",
  save: "../sound/05-save.mp3",
  load: "../sound/06-load.mp3",
  open: "../sound/07-open.mp3",
  close: "../sound/08-close.mp3",
  notify: "../sound/09-notify.mp3",
  page: "../sound/10-page.mp3",
};

const $ = (id) => document.getElementById(id);

const ui = {
  title: $("title-screen"),
  play: $("play"),
  sky: $("sky"),
  laser: $("laser"),
  figureSlot: $("figure-slot"),
  figure: $("figure"),
  figureFar: $("figure-far"),
  cg: $("cg"),
  cgImg: $("cg-img"),
  chapter: $("chapter"),
  place: $("place"),
  flagrow: $("flagrow"),
  card: $("card"),
  cardKicker: $("card-kicker"),
  cardTitle: $("card-title"),
  cardText: $("card-text"),
  booklet: $("booklet"),
  speaker: $("speaker"),
  line: $("line"),
  choices: $("choices"),
  hint: $("hint"),
  ending: $("ending"),
  endingCg: $("ending-cg"),
  endingTier: $("ending-tier"),
  endingTitle: $("ending-title"),
  endingWhy: $("ending-why"),
  endingRoute: $("ending-route"),
  log: $("log"),
  logList: $("log-list"),
  chart: $("chart"),
  chartBody: $("chart-body"),
  continueBtn: $("continue"),
  gallery: $("gallery"),
  galleryList: $("gallery-list"),
  settings: $("settings"),
  bgmVolume: $("bgm-volume"),
  sfxToggle: $("sfx-toggle"),
  saveNote: $("save-note"),
  bgmCredit: $("bgm-credit"),
};

const emptyFlags = () => ({ qishanHonest: false, sutingWalk: false, zhijunName: false });

let state = freshState();
let typed = "";
let shown = 0;
let typing = false;
let timer = 0;
let page = 1;

const audioPref = loadAudioPref();
const sfx = {};
for (const [name, url] of Object.entries(sfxUrl)) {
  const audio = new Audio(url);
  audio.preload = "auto";
  sfx[name] = audio;
}
// CC0 tracks only (01–16). 17–20 are CC-BY; credit text shows if one is ever selected.
const bgmByPlace = {
  soc: "13-peaceful-tune-2.mp3",
  day: "16-town-theme-rpg.mp3",
  bus: "12-village-2018.mp3",
  wall: "05-sunset-plains.mp3",
  temple: "10-i-swear-i-saw-it.mp3",
  stars: "01-starfield-romance.mp3",
  beach: "15-bird-in-hand-night.mp3",
  roof: "09-nighttime-solitude.mp3",
  canteen: "08-dream-ambience.mp3",
  coffee: "07-emotional-piano-loop.mp3",
  dawn: "02-first-light-particles.mp3",
};

const endingBgm = {
  TRUE: "02-first-light-particles.mp3",
  GOOD: "04-yoiyami-core-theme.mp3",
  BAD: "11-at-the-end-of-hope.mp3",
};

const bgmCreditText = {
  "17-love-theme.mp3": "Love Theme — peastman · CC BY 3.0",
  "18-lullaby-kly.mp3": "Lullaby — Kim Lightyear · CC BY 3.0",
  "19-memories-kly.mp3": "Memories — Kim Lightyear · CC BY 3.0",
  "20-piano-theme.mp3": "Piano Theme — tcarisland · CC BY 4.0",
};

let currentBgm = "";
const bgm = new Audio();
bgm.id = "bgm";
bgm.loop = true;
bgm.preload = "auto";
bgm.volume = audioPref.bgm;
document.body.append(bgm);

for (const id of Object.keys(figureDir)) {
  const img = new Image();
  img.src = figureDir[id] + defaultExpr[id];
}

function freshState() {
  return {
    sceneId: "open1",
    flags: emptyFlags(),
    backlog: [],
    seen: {},
    checkpoint: null,
  };
}

function loadAudioPref() {
  try {
    const raw = sessionStorage.getItem(AUDIO_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      bgm: typeof parsed.bgm === "number" ? parsed.bgm : 0.32,
      sfx: parsed.sfx !== false,
    };
  } catch {
    return { bgm: 0.32, sfx: true };
  }
}

function storeAudioPref() {
  sessionStorage.setItem(AUDIO_KEY, JSON.stringify(audioPref));
}

function playSfx(name) {
  if (!audioPref.sfx || !sfxUrl[name]) return;
  const node = new Audio(sfxUrl[name]);
  node.volume = name === "page" || name === "select" ? 0.38 : 0.5;
  node.play().catch(() => {});
}

function ensureBgm() {
  bgm.volume = audioPref.bgm;
  if (audioPref.bgm <= 0) {
    bgm.pause();
    return;
  }
  if (!currentBgm) setBgm(bgmByPlace.stars);
  else bgm.play().catch(() => {});
}

function setBgm(file) {
  if (!file) return;
  const credit = bgmCreditText[file] || "";
  if (ui.bgmCredit) {
    ui.bgmCredit.hidden = !credit;
    ui.bgmCredit.textContent = credit;
  }
  if (file === currentBgm) {
    bgm.volume = audioPref.bgm;
    if (audioPref.bgm > 0) bgm.play().catch(() => {});
    else bgm.pause();
    return;
  }
  currentBgm = file;
  bgm.src = `../bgm/${file}`;
  bgm.loop = true;
  bgm.volume = audioPref.bgm;
  if (audioPref.bgm > 0) bgm.play().catch(() => {});
  else bgm.pause();
}

function bgmForScene(s) {
  if (s.bgm) return s.bgm;
  const plate = scenePlate[state.sceneId] || s.bg;
  if (plate && bgmByPlace[plate]) return bgmByPlace[plate];
  return currentBgm || bgmByPlace.soc;
}

function loadSave() {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persist() {
  const data = {
    sceneId: state.sceneId,
    flags: state.flags,
    backlog: state.backlog.slice(-80),
    seen: state.seen,
    checkpoint: state.checkpoint,
    page,
    atTitle: !ui.title.hidden,
  };
  sessionStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function scene() {
  return scenes[state.sceneId];
}

function setFlagRow() {
  for (const item of ui.flagrow.querySelectorAll("[data-flag]")) {
    item.classList.toggle("on", Boolean(state.flags[item.dataset.flag]));
  }
}

function paintFigure(img, id, file) {
  if (!img) return;
  if (!id || !figureDir[id] || !file) {
    img.classList.remove("show");
    img.hidden = true;
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  const src = figureDir[id] + file;
  const same = img.getAttribute("src") === src && !img.hidden;
  img.alt = figureName[id] || "";
  img.hidden = false;
  if (!same) {
    img.classList.remove("show");
    img.src = src;
    const reveal = () => img.classList.add("show");
    if (img.complete && img.naturalWidth) reveal();
    else img.addEventListener("load", reveal, { once: true });
  } else {
    img.classList.add("show");
  }
}

function showFigure(id) {
  paintFigure(ui.figure, id, id ? (sceneExpr[state.sceneId] || defaultExpr[id]) : "");
}

function showFarFigure(id) {
  const file = id ? (sceneFarExpr[state.sceneId] || defaultExpr[id]) : "";
  paintFigure(ui.figureFar, id, file);
  ui.figureSlot?.classList.toggle("dual", Boolean(id && figureDir[id]));
}

// script.js reuses one bg token for two rooms. Coffee-corner beats stay on
// the coffee plate; 眾志堂 stays on the canteen plate, including the true
// ending that only flips the token to "dawn" without leaving the room.
const scenePlate = {
  s3: "coffee",
  q3: "coffee",
  q_true2: "coffee",
  z4: "canteen",
  z_true2: "canteen",
};

function applySky(s) {
  const plate = scenePlate[state.sceneId] || s.bg;
  if (plate) ui.sky.dataset.bg = plate;
  if (!("laser" in s)) return;
  ui.laser.hidden = !s.laser;
  if (s.laser) {
    ui.laser.classList.remove("sweep");
    void ui.laser.offsetWidth;
    ui.laser.classList.add("sweep");
  }
}

function stopType() {
  window.clearInterval(timer);
  typing = false;
}

function typeInto(el, text, done) {
  stopType();
  typed = text;
  shown = 0;
  if (instant || reduceMotion) {
    el.textContent = text;
    shown = text.length;
    typing = false;
    done?.();
    return;
  }
  typing = true;
  el.textContent = "";
  timer = window.setInterval(() => {
    shown += 1;
    el.textContent = typed.slice(0, shown);
    if (shown >= typed.length) {
      stopType();
      done?.();
    }
  }, 16);
}

function finishType() {
  stopType();
  const target = scene().card ? ui.cardText : ui.line;
  target.textContent = typed;
  shown = typed.length;
}

function renderChoices(list) {
  ui.choices.replaceChildren();
  if (!list) {
    ui.hint.hidden = false;
    return;
  }
  ui.hint.hidden = true;
  for (const choice of list) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice plate";
    button.textContent = choice.label;
    button.addEventListener("pointerenter", () => playSfx("select"));
    button.addEventListener("click", () => {
      playSfx("confirm");
      if (choice.set) Object.assign(state.flags, choice.set);
      go(nextOf(choice.next, state.flags));
    });
    ui.choices.append(button);
  }
}

function enter(id) {
  const s = scenes[id];
  if (!s) throw new Error(`missing scene ${id}`);
  const firstCheckpoint = Boolean(s.checkpoint && !state.checkpoint);
  state.sceneId = id;
  if (s.checkpoint) {
    state.checkpoint = { sceneId: id, flags: { ...state.flags } };
  }
  page += 1;
  ui.chapter.textContent = s.chapter || ui.chapter.textContent;
  ui.place.textContent = s.place || ui.place.textContent;
  applySky(s);
  setBgm(bgmForScene(s));
  if ("figure" in s) showFigure(s.figure);
  if ("figureFar" in s && s.figureFar) showFarFigure(s.figureFar);
  else showFarFigure(null);
  if (s.cg) {
    ui.cgImg.src = s.cg;
    ui.cgImg.alt = "";
    ui.cg.hidden = false;
  } else {
    ui.cg.hidden = true;
    ui.cgImg.removeAttribute("src");
  }
  setFlagRow();
  ui.ending.hidden = true;

  if (s.card) {
    ui.booklet.hidden = true;
    ui.card.hidden = false;
    ui.cardKicker.textContent = s.kicker || "";
    ui.cardTitle.textContent = s.title || "";
    typeInto(ui.cardText, s.text || "");
  } else {
    ui.card.hidden = true;
    ui.booklet.hidden = false;
    ui.speaker.hidden = !s.speaker;
    ui.speaker.textContent = s.speaker || "";
    ui.speaker.className = `speaker ${speakerClass[s.speaker] || ""}`;
    ui.choices.replaceChildren();
    ui.hint.hidden = true;
    typeInto(ui.line, s.text || "", () => renderChoices(s.choices));
  }
  persist();
  renderChart();
  if (firstCheckpoint) playSfx("save");
}

function pushBacklog() {
  const s = scene();
  if (!s || s.card) return;
  const last = state.backlog[state.backlog.length - 1];
  const entry = { speaker: s.speaker || "", text: s.text || "" };
  if (!last || last.text !== entry.text) state.backlog.push(entry);
}

function go(id) {
  pushBacklog();
  if (!id) {
    openEnding();
    return;
  }
  enter(id);
}

function panelsOpen() {
  return ui.log.hidden === false || ui.chart.hidden === false || ui.gallery.hidden === false || ui.settings.hidden === false;
}

function advance() {
  if (ui.title.hidden === false || ui.ending.hidden === false) return;
  if (panelsOpen()) return;
  const s = scene();
  if (!s) return;
  if (typing) {
    finishType();
    if (!s.card) renderChoices(s.choices);
    return;
  }
  if (s.choices) return;
  if (s.ending) {
    pushBacklog();
    openEnding();
    return;
  }
  if (s.card) {
    go(s.next);
    return;
  }
  go(nextOf(s.next, state.flags));
}

function openEnding() {
  const ending = scene().ending;
  if (!ending) return;
  state.seen[ending.id] = true;
  ui.booklet.hidden = true;
  ui.cg.hidden = true;
  ui.ending.hidden = false;
  ui.endingTier.textContent = ending.tier;
  ui.endingTier.dataset.tier = ending.tier;
  ui.endingRoute.textContent = `${ending.route}線`;
  ui.endingTitle.textContent = ending.title;
  ui.endingWhy.textContent = ending.why;
  const cg = ending.cg || null;
  ui.ending.classList.toggle("has-cg", Boolean(cg));
  ui.ending.classList.toggle("no-cg", !cg);
  if (cg) {
    ui.endingCg.hidden = false;
    ui.endingCg.src = cg;
    ui.endingCg.alt = ending.title || "";
  } else {
    ui.endingCg.hidden = true;
    ui.endingCg.removeAttribute("src");
  }
  if (endingBgm[ending.tier]) setBgm(endingBgm[ending.tier]);
  $("back-to-branch").hidden = !state.checkpoint;
  playSfx("notify");
  persist();
  renderGallery();
}

function skipToChoice() {
  playSfx("click");
  let guard = 0;
  while (guard < 40) {
    const s = scene();
    if (!s) return;
    if (s.choices || s.ending) {
      finishType();
      if (!s.card) renderChoices(s.choices);
      return;
    }
    const id = s.card || s.next ? nextOf(s.next, state.flags) : null;
    if (!id) return;
    pushBacklog();
    enter(id);
    guard += 1;
  }
}

function showTitle() {
  ui.title.hidden = false;
  ui.play.hidden = true;
  ui.ending.hidden = true;
  const save = loadSave();
  const canContinue = Boolean(save && save.sceneId && scenes[save.sceneId] && !save.atTitle);
  ui.continueBtn.hidden = !canContinue;
  renderGallery();
  persistTitleMarker();
}

function persistTitleMarker() {
  const save = loadSave() || {};
  save.atTitle = true;
  save.seen = state.seen;
  save.checkpoint = state.checkpoint;
  sessionStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

function hidePanels() {
  ui.log.hidden = true;
  ui.chart.hidden = true;
  ui.gallery.hidden = true;
  ui.settings.hidden = true;
}

function startNew() {
  playSfx("confirm");
  ensureBgm();
  state = freshState();
  const seen = loadSave()?.seen || {};
  state.seen = seen;
  page = 0;
  ui.title.hidden = true;
  ui.play.hidden = false;
  hidePanels();
  enter("open1");
}

function continueGame() {
  playSfx("load");
  ensureBgm();
  const save = loadSave();
  if (!save || !scenes[save.sceneId]) {
    startNew();
    return;
  }
  state = {
    sceneId: save.sceneId,
    flags: { ...emptyFlags(), ...save.flags },
    backlog: save.backlog || [],
    seen: save.seen || {},
    checkpoint: save.checkpoint || null,
  };
  page = save.page || 1;
  ui.title.hidden = true;
  ui.play.hidden = false;
  enter(state.sceneId);
}

function backToBranch() {
  if (!state.checkpoint) return;
  playSfx("confirm");
  state.flags = { ...state.checkpoint.flags };
  state.sceneId = state.checkpoint.sceneId;
  ui.ending.hidden = true;
  ui.title.hidden = true;
  ui.play.hidden = false;
  enter(state.checkpoint.sceneId);
}

function renderLog() {
  ui.logList.replaceChildren();
  if (!state.backlog.length) {
    const p = document.createElement("p");
    p.textContent = "還沒有翻過的頁。";
    ui.logList.append(p);
    return;
  }
  for (const entry of state.backlog) {
    const item = document.createElement("article");
    const body = document.createElement("p");
    body.textContent = entry.text;
    if (entry.speaker) {
      const who = document.createElement("p");
      who.className = "log-who";
      who.textContent = entry.speaker;
      item.append(who);
    }
    item.append(body);
    ui.logList.append(item);
  }
  ui.logList.scrollTop = ui.logList.scrollHeight;
}

function renderChart() {
  const s = scenes[state.sceneId];
  const rows = [
    ["地方", s?.place || ""],
    ["話", s?.chapter || ""],
    ["路線", s?.chapter?.endsWith("線") ? s.chapter : "共通"],
  ];
  ui.chartBody.replaceChildren();
  for (const [term, value] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    ui.chartBody.append(dt, dd);
  }
  for (const flag of flagMeta) {
    const dt = document.createElement("dt");
    dt.textContent = flag.label;
    const dd = document.createElement("dd");
    dd.textContent = `${state.flags[flag.id] ? "已記下" : "未記下"} · ${flag.hint}`;
    ui.chartBody.append(dt, dd);
  }
}

function renderGallery() {
  ui.galleryList.replaceChildren();
  for (const ending of listEndings()) {
    const item = document.createElement("li");
    item.dataset.tier = ending.tier;
    const seen = Boolean(state.seen[ending.id]);
    item.className = seen ? "seen" : "unseen";
    const tier = document.createElement("span");
    tier.textContent = ending.tier;
    const name = document.createElement("span");
    name.textContent = `${ending.route} · ${ending.title}`;
    const mark = document.createElement("span");
    mark.textContent = seen ? "已讀" : "未讀";
    item.append(tier, name, mark);
    ui.galleryList.append(item);
  }
}

function closePanels(sound) {
  if (!panelsOpen()) return;
  hidePanels();
  if (sound) playSfx("close");
}

function openPanel(name) {
  const map = { log: ui.log, gallery: ui.gallery, chart: ui.chart, settings: ui.settings };
  const panel = map[name];
  const already = panel.hidden === false;
  hidePanels();
  if (already) {
    playSfx("close");
    return;
  }
  if (name === "log") renderLog();
  if (name === "gallery") renderGallery();
  if (name === "chart") renderChart();
  panel.hidden = false;
  playSfx("open");
}

function saveNow() {
  if (ui.play.hidden) persistTitleMarker();
  else persist();
  playSfx("save");
  ui.saveNote.textContent = "已存進這個分頁。";
}

function onKey(event) {
  if (event.key === "Escape") {
    closePanels(true);
    return;
  }
  if (event.key !== " " && event.key !== "Enter") return;
  const tag = document.activeElement?.tagName;
  if (tag === "BUTTON" || tag === "INPUT") return;
  if (event.key === " ") event.preventDefault();
  if (!ui.title.hidden || panelsOpen()) return;
  advance();
}

function bind() {
  ui.bgmVolume.value = String(Math.round(audioPref.bgm * 100));
  ui.sfxToggle.checked = audioPref.sfx;

  $("start").addEventListener("click", startNew);
  ui.continueBtn.addEventListener("click", continueGame);
  $("open-gallery").addEventListener("click", () => {
    ensureBgm();
    openPanel("gallery");
  });
  $("close-gallery").addEventListener("click", () => closePanels(true));
  $("booklet").addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    advance();
  });
  $("cg").addEventListener("click", () => {
    ui.cg.hidden = true;
  });
  $("card-go").addEventListener("click", advance);
  $("btn-log").addEventListener("click", () => openPanel("log"));
  $("close-log").addEventListener("click", () => closePanels(true));
  $("btn-chart").addEventListener("click", () => openPanel("chart"));
  $("close-chart").addEventListener("click", () => closePanels(true));
  $("btn-skip").addEventListener("click", skipToChoice);
  $("btn-title").addEventListener("click", () => {
    playSfx("cancel");
    pushBacklog();
    persist();
    showTitle();
  });
  $("end-title").addEventListener("click", () => {
    playSfx("cancel");
    showTitle();
  });
  $("back-to-branch").addEventListener("click", backToBranch);
  $("end-again").addEventListener("click", () => {
    playSfx("click");
    ui.ending.hidden = true;
    ui.booklet.hidden = Boolean(scene().card);
  });
  $("btn-gear").addEventListener("click", () => {
    ensureBgm();
    ui.saveNote.textContent = "";
    openPanel("settings");
  });
  $("close-settings").addEventListener("click", () => closePanels(true));
  $("btn-save").addEventListener("click", saveNow);
  ui.bgmVolume.addEventListener("input", () => {
    audioPref.bgm = Number(ui.bgmVolume.value) / 100;
    storeAudioPref();
    ensureBgm();
  });
  ui.sfxToggle.addEventListener("change", () => {
    audioPref.sfx = ui.sfxToggle.checked;
    storeAudioPref();
    playSfx("click");
  });
  document.addEventListener("keydown", onKey);
}

bind();
const saved = loadSave();
if (saved?.seen) state.seen = saved.seen;
if (saved?.checkpoint) state.checkpoint = saved.checkpoint;
showTitle();
renderGallery();
