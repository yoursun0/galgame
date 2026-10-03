import { scenes, flagMeta, nextOf, listEndings } from "./script.js";

const SAVE_KEY = "xingkong-prototype-v1";
const instant = new URLSearchParams(location.search).has("instant");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const figures = {
  lingchen: "assets/lingchen.png",
  suting: "assets/suting.png",
  zhijun: "assets/zhijun.png",
  qishan: "assets/qishan.png",
};

const speakerClass = {
  凌晨: "who-ling",
  素婷: "who-su",
  芷君: "who-zhi",
  綺珊: "who-qi",
  家綸: "who-jia",
  會長: "who-hui",
};

const $ = (id) => document.getElementById(id);

const ui = {
  title: $("title-screen"),
  play: $("play"),
  sky: $("sky"),
  laser: $("laser"),
  figure: $("figure"),
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
  pageNo: $("page-no"),
  ending: $("ending"),
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
};

const emptyFlags = () => ({ qishanHonest: false, sutingWalk: false, zhijunName: false });

let state = freshState();
let typed = "";
let shown = 0;
let typing = false;
let timer = 0;
let page = 1;

function freshState() {
  return {
    sceneId: "open1",
    flags: emptyFlags(),
    backlog: [],
    seen: {},
    checkpoint: null,
  };
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

function showFigure(id) {
  if (!id || !figures[id]) {
    ui.figure.hidden = true;
    ui.figure.removeAttribute("src");
    ui.figure.alt = "";
    return;
  }
  const src = figures[id];
  if (ui.figure.getAttribute("src") !== src) ui.figure.src = src;
  ui.figure.alt = { lingchen: "凌晨", suting: "素婷", zhijun: "芷君", qishan: "綺珊" }[id];
  ui.figure.hidden = false;
}

function applySky(s) {
  if (s.bg) ui.sky.dataset.bg = s.bg;
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
    button.className = "choice";
    button.textContent = choice.label;
    button.addEventListener("click", () => {
      if (choice.set) Object.assign(state.flags, choice.set);
      go(nextOf(choice.next, state.flags));
    });
    ui.choices.append(button);
  }
}

function enter(id) {
  const s = scenes[id];
  if (!s) throw new Error(`missing scene ${id}`);
  state.sceneId = id;
  if (s.checkpoint) {
    state.checkpoint = { sceneId: id, flags: { ...state.flags } };
  }
  page += 1;
  ui.chapter.textContent = s.chapter || ui.chapter.textContent;
  ui.place.textContent = s.place || ui.place.textContent;
  applySky(s);
  if ("figure" in s) showFigure(s.figure);
  setFlagRow();
  ui.ending.hidden = true;
  ui.pageNo.textContent = String(page).padStart(2, "0");

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
}

function pushBacklog() {
  const s = scene();
  if (!s || s.card) return;
  const last = state.backlog[state.backlog.length - 1];
  const entry = { speaker: s.speaker || "團刊", text: s.text || "" };
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

function advance() {
  if (ui.title.hidden === false || ui.ending.hidden === false) return;
  if (ui.log.hidden === false || ui.chart.hidden === false || ui.gallery.hidden === false) return;
  const s = scene();
  if (!s) return;
  if (typing) {
    finishType();
    if (!s.card) renderChoices(s.choices);
    return;
  }
  if (s.choices) return;
  if (s.card) {
    go(s.next);
    return;
  }
  if (s.ending) {
    pushBacklog();
    openEnding();
    return;
  }
  go(nextOf(s.next, state.flags));
}

function openEnding() {
  const ending = scene().ending;
  if (!ending) return;
  state.seen[ending.id] = true;
  ui.booklet.hidden = true;
  ui.ending.hidden = false;
  ui.endingTier.textContent = ending.tier;
  ui.endingTier.dataset.tier = ending.tier;
  ui.endingRoute.textContent = `${ending.route}線`;
  ui.endingTitle.textContent = ending.title;
  ui.endingWhy.textContent = ending.why;
  $("back-to-branch").hidden = !state.checkpoint;
  persist();
  renderGallery();
}

function skipToChoice() {
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

function startNew() {
  state = freshState();
  const seen = loadSave()?.seen || {};
  state.seen = seen;
  page = 0;
  ui.title.hidden = true;
  ui.play.hidden = false;
  ui.log.hidden = true;
  ui.chart.hidden = true;
  ui.gallery.hidden = true;
  enter("open1");
}

function continueGame() {
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
    const who = document.createElement("p");
    who.className = "log-who";
    who.textContent = entry.speaker;
    const body = document.createElement("p");
    body.textContent = entry.text;
    item.append(who, body);
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

function onKey(event) {
  if (event.key === "Escape") {
    ui.log.hidden = true;
    ui.chart.hidden = true;
    ui.gallery.hidden = true;
    return;
  }
  if (event.key !== " " && event.key !== "Enter") return;
  const tag = document.activeElement?.tagName;
  if (tag === "BUTTON") return;
  if (event.key === " ") event.preventDefault();
  if (!ui.title.hidden || !ui.gallery.hidden || !ui.log.hidden || !ui.chart.hidden) return;
  advance();
}

function bind() {
  $("start").addEventListener("click", startNew);
  ui.continueBtn.addEventListener("click", continueGame);
  $("open-gallery").addEventListener("click", () => {
    renderGallery();
    ui.gallery.hidden = false;
  });
  $("close-gallery").addEventListener("click", () => {
    ui.gallery.hidden = true;
  });
  $("booklet").addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    advance();
  });
  $("card-go").addEventListener("click", advance);
  $("btn-log").addEventListener("click", () => {
    renderLog();
    ui.log.hidden = false;
  });
  $("close-log").addEventListener("click", () => {
    ui.log.hidden = true;
  });
  $("btn-chart").addEventListener("click", () => {
    renderChart();
    ui.chart.hidden = !ui.chart.hidden;
  });
  $("close-chart").addEventListener("click", () => {
    ui.chart.hidden = true;
  });
  $("btn-skip").addEventListener("click", skipToChoice);
  $("btn-title").addEventListener("click", () => {
    pushBacklog();
    persist();
    showTitle();
  });
  $("end-title").addEventListener("click", showTitle);
  $("back-to-branch").addEventListener("click", backToBranch);
  $("end-again").addEventListener("click", () => {
    ui.ending.hidden = true;
    ui.booklet.hidden = Boolean(scene().card);
  });
  document.addEventListener("keydown", onKey);
}

bind();
const saved = loadSave();
if (saved?.seen) state.seen = saved.seen;
if (saved?.checkpoint) state.checkpoint = saved.checkpoint;
showTitle();
renderGallery();
