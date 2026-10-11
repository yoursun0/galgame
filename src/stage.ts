import type { AssetRecord, PlayState, Work } from "./types.ts";
import type { Theme } from "./theme.ts";

export type StageHandlers = {
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onTypingComplete?: () => void;
  /** Puppy #63: ending card 「回標題」. */
  onReturnToTitle?: () => void;
};

export type Stage = {
  render: (state: PlayState) => void;
  typing: () => boolean;
  finishTyping: () => void;
  /** Drop in-flight typing so a load can redraw without the old timer. */
  cancel: () => void;
  setTextSpeed: (charsPerSecond: number) => void;
  setInstant: (instant: boolean) => void;
};

/** Placed sprite box. `edgePercent` is the left inset (near) or right inset (far). */
export type ActorSlot = {
  heightPercent: number;
  bottomPercent: number;
  edgePercent: number;
  /** Dual only. Caps a 16:9 canvas so the body cannot cross the midline. */
  maxWidthPercent?: number;
};

/**
 * Puppy #93: dual near+far. Theme near is height 108% on a full-stage 16:9
 * sprite, which paints across the far half and hides it. These boxes keep
 * each body in its own half. Single-slot scenes keep the theme sizes.
 */
export const DUAL_ACTOR = {
  nearHeightPercent: 90,
  farHeightPercent: 84,
  nearBottomPercent: 0,
  farBottomPercent: 5,
  edgePercent: 3,
  maxWidthPercent: 47,
  /** Far matches the old near layer; near stays one step above. */
  nearZ: 3,
  farZ: 2,
} as const;

const SINGLE_NEAR_EDGE = 6;
const SINGLE_FAR_EDGE = 8;

export function slotsForActors(
  actors: {
    near: { heightPercent: number; bottomPercent: number };
    far: { heightPercent: number; bottomPercent: number };
  },
  nearCount: number,
  farCount: number,
): { dual: boolean; near: ActorSlot; far: ActorSlot } {
  // Puppy #93: only when both groups are on stage. Two nears (no far) stay put.
  const dual = nearCount > 0 && farCount > 0;
  if (!dual) {
    return {
      dual: false,
      near: { ...actors.near, edgePercent: SINGLE_NEAR_EDGE },
      far: { ...actors.far, edgePercent: SINGLE_FAR_EDGE },
    };
  }
  return {
    dual: true,
    near: {
      heightPercent: DUAL_ACTOR.nearHeightPercent,
      bottomPercent: DUAL_ACTOR.nearBottomPercent,
      edgePercent: DUAL_ACTOR.edgePercent,
      maxWidthPercent: DUAL_ACTOR.maxWidthPercent,
    },
    far: {
      heightPercent: DUAL_ACTOR.farHeightPercent,
      bottomPercent: DUAL_ACTOR.farBottomPercent,
      edgePercent: DUAL_ACTOR.edgePercent,
      maxWidthPercent: DUAL_ACTOR.maxWidthPercent,
    },
  };
}

/**
 * DOM and CSS only. Decisions stay in reduce.
 * Narrative CG stays until the script hides it or the CG asset changes;
 * a click advances the line the same way the rest of the stage does.
 */
export function mountStage(
  parent: HTMLElement,
  theme: Theme,
  work: Work,
  assets: AssetRecord[],
  urls: Map<string, string>,
  handlers: StageHandlers,
): Stage {
  const reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  let instant = reducedMotion;
  let cps = reducedMotion ? 10_000 : theme.charsPerSecond;

  const style = document.createElement("style");
  style.textContent = css(theme);
  document.head.append(style);

  const viewport = el("div", "viewport");
  const fit = el("div", "fit");
  const stage = el("div", "stage");
  const bg = document.createElement("img");
  bg.className = "bg";
  bg.alt = "";
  const actors = el("div", "actors");
  const cg = el("button", "cg");
  (cg as HTMLButtonElement).type = "button";
  cg.hidden = true;
  const cgImg = document.createElement("img");
  cgImg.alt = "";
  cg.append(cgImg);
  const credit = el("p", "credit");
  credit.hidden = true;
  const say = el("div", "say");
  const name = el("p", "name");
  const line = el("p", "line");
  say.append(name, line);
  const choices = el("div", "choices");
  const ending = el("div", "ending");
  ending.hidden = true;
  const endingImg = document.createElement("img");
  endingImg.className = "ending-cg";
  endingImg.alt = "";
  const card = el("div", "ending-card");
  const kicker = el("p", "ending-kicker");
  kicker.textContent = "結局";
  const endingId = el("p", "ending-id");
  const endingHome = document.createElement("button");
  endingHome.type = "button";
  endingHome.className = "ending-home";
  endingHome.textContent = "回標題";
  endingHome.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onReturnToTitle?.();
  });
  card.append(kicker, endingId, endingHome);
  ending.append(endingImg, card);
  stage.append(bg, actors, cg, credit, say, choices, ending);
  fit.append(stage);
  const ui = el("div", "stage-ui");
  viewport.append(fit);
  parent.replaceChildren(viewport);

  const mobilePortrait = () =>
    window.matchMedia("(max-width: 720px) and (orientation: portrait)").matches;

  const syncUiParent = (mobile: boolean) => {
    if (mobile) {
      if (choices.parentElement !== ui || say.parentElement !== ui) {
        ui.append(choices, say);
      }
      if (ui.parentElement !== viewport) viewport.append(ui);
      // fixed overlays must leave the transformed stage
      if (cg.parentElement !== viewport) viewport.append(cg);
      if (ending.parentElement !== viewport) viewport.append(ending);
    } else {
      if (say.parentElement !== stage || choices.parentElement !== stage) {
        stage.append(bg, actors, cg, credit, say, choices, ending);
        ui.remove();
      } else if (cg.parentElement !== stage || ending.parentElement !== stage) {
        stage.append(bg, actors, cg, credit, say, choices, ending);
      }
    }
  };

  const fitStage = () => {
    const mobile = mobilePortrait();
    viewport.classList.toggle("mobile-portrait", mobile);
    syncUiParent(mobile);

    const width = window.innerWidth;
    const height = window.innerHeight;
    let safe: number;
    if (mobile) {
      // Tall readable dialogue band; art cover-fills remaining height, centered crop.
      const uiH = Math.round(Math.min(320, Math.max(210, height * 0.36)));
      ui.style.minHeight = `${uiH}px`;
      const artH = Math.max(160, height - uiH);
      const scale = Math.max(width / theme.stageWidth, artH / theme.stageHeight);
      safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
      fit.style.width = `${width}px`;
      fit.style.height = `${artH}px`;
      // top-left origin + offset so mid-stage sprites stay in the phone crop
      // (left-biased origin from #31 hid characters on narrow portrait).
      stage.style.transformOrigin = "top left";
      stage.style.transform = `scale(${safe})`;
      stage.style.left = `${(width - theme.stageWidth * safe) / 2}px`;
      stage.style.top = `${(artH - theme.stageHeight * safe) / 2}px`;
    } else {
      ui.style.minHeight = "";
      const scale = Math.min(width / theme.stageWidth, height / theme.stageHeight);
      safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
      fit.style.width = `${theme.stageWidth * safe}px`;
      fit.style.height = `${theme.stageHeight * safe}px`;
      stage.style.transformOrigin = "top left";
      stage.style.transform = `scale(${safe})`;
      stage.style.left = "0";
      stage.style.top = "0";
    }
  };
  fitStage();
  window.addEventListener("resize", fitStage);
  window.addEventListener("orientationchange", fitStage);

  let lineKey = "";
  let fullText = "";
  let shown = 0;
  let timer = 0;
  let epoch = 0;

  const typing = () => shown < fullText.length;

  const paintLine = () => {
    line.textContent = fullText.slice(0, shown);
  };

  const stopTimer = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };

  const finishTyping = () => {
    if (!typing()) return;
    shown = fullText.length;
    stopTimer();
    paintLine();
    handlers.onTypingComplete?.();
  };

  const cancel = () => {
    epoch += 1;
    stopTimer();
    lineKey = "";
    fullText = "";
    shown = 0;
    line.textContent = "";
  };

  const setTextSpeed = (charsPerSecond: number) => {
    if (!Number.isFinite(charsPerSecond) || charsPerSecond <= 0) return;
    cps = charsPerSecond;
  };

  const setInstant = (next: boolean) => {
    instant = next;
    if (next && typing()) finishTyping();
  };

  const startTyping = (text: string) => {
    const token = ++epoch;
    fullText = text;
    shown = 0;
    stopTimer();
    paintLine();
    if (!text || instant) {
      shown = fullText.length;
      paintLine();
      if (text) handlers.onTypingComplete?.();
      return;
    }
    const stepMs = Math.max(16, Math.round(1000 / cps));
    timer = window.setInterval(() => {
      if (token !== epoch) return;
      shown = Math.min(fullText.length, shown + 1);
      paintLine();
      if (shown >= fullText.length) {
        stopTimer();
        handlers.onTypingComplete?.();
      }
    }, stepMs);
  };

  cg.addEventListener("click", (event) => {
    event.stopPropagation();
    handlers.onAdvance();
  });

  const advanceFrom = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target?.closest(".choice, .cg")) return;
    handlers.onAdvance();
  };
  stage.addEventListener("click", advanceFrom);
  ui.addEventListener("click", advanceFrom);

  const urlOf = (id: string | null | undefined) => (id ? urls.get(id) ?? "" : "");

  const assetOf = (id: string | null | undefined) =>
    id ? assets.find((item) => item.id === id) : undefined;

  const spriteId = (id: string, position: string | null, expr: string | null): string | null => {
    const character = work.manifest.characters.find((item) => item.id === id);
    const sprites = character?.sprites;
    if (expr && sprites?.[expr]) return sprites[expr];
    if (position && sprites?.[position]) return sprites[position];
    const match = assets.find((item) => {
      if (item.type !== "actor" && item.character !== id) return false;
      if (item.character && item.character !== id) return false;
      if (expr && (item.expr === expr || item.id === expr)) return true;
      if (position && (item.position === position || item.id.endsWith(`-${position}`))) return true;
      return false;
    });
    return match?.id ?? null;
  };

  const creditText = (bgmId: string | null): string => {
    const asset = assetOf(bgmId);
    if (!asset) return "";
    const license = asset.license ?? "";
    const by = /CC-?BY/i.test(license);
    if (asset.credit && asset.credit.trim()) return asset.credit.trim();
    if (by) return `${asset.id} · ${license}`;
    return "";
  };

  const render = (state: PlayState) => {
    const bgUrl = urlOf(state.background);
    if (bgUrl) {
      bg.src = bgUrl;
      bg.hidden = false;
    } else {
      bg.removeAttribute("src");
      bg.hidden = true;
    }

    actors.replaceChildren();
    const near = state.actors.filter((actor) => actor.position !== "far");
    const far = state.actors.filter((actor) => actor.position === "far");
    const slots = slotsForActors(theme.actors, near.length, far.length);
    actors.classList.toggle("actors-dual", slots.dual);
    const place = (group: typeof state.actors, box: ActorSlot, fromLeft: boolean) => {
      group.forEach((actor, index) => {
        const id = spriteId(actor.id, actor.position, actor.expr);
        const src = urlOf(id);
        if (!src) return;
        const img = document.createElement("img");
        img.className = actor.position === "far" ? "actor far" : "actor near";
        img.alt = "";
        img.src = src;
        const span = group.length <= 1 ? 0 : index * 16;
        img.style.height = `${box.heightPercent}%`;
        img.style.bottom = `${box.bottomPercent}%`;
        const edge = box.edgePercent + span;
        if (fromLeft) img.style.left = `${edge}%`;
        else img.style.right = `${edge}%`;
        if (box.maxWidthPercent != null) {
          // Puppy #93: width cap is what stops the 16:9 canvas crossing the midline.
          img.style.width = `${box.maxWidthPercent}%`;
          img.style.maxWidth = `${box.maxWidthPercent}%`;
        }
        actors.append(img);
      });
    };
    place(near, slots.near, true);
    place(far, slots.far, false);

    const showCg = Boolean(state.cg) && !state.ending;
    cg.hidden = !showCg;
    if (showCg && state.cg) {
      cgImg.src = urlOf(state.cg);
    }

    const creditLine = creditText(state.audio.bgm);
    credit.hidden = !creditLine || Boolean(state.ending);
    credit.textContent = creditLine;

    const atEnd = Boolean(state.ending);
    ending.hidden = !atEnd;
    say.hidden = atEnd || !state.line;
    choices.hidden = atEnd || !state.choices;
    if (atEnd && state.ending) {
      endingId.textContent = state.ending.id;
      const cgUrl = urlOf(state.cg);
      if (cgUrl) {
        endingImg.hidden = false;
        endingImg.src = cgUrl;
      } else {
        endingImg.hidden = true;
        endingImg.removeAttribute("src");
      }
    }

    if (!atEnd && state.line) {
      if (state.line.kind === "narration") {
        name.hidden = true;
        name.textContent = "";
      } else {
        const speaker = state.line.speaker ?? "";
        const named = work.manifest.characters.find((item) => item.id === speaker);
        name.hidden = false;
        name.textContent = named?.name ?? speaker;
      }
      const key = `${state.sceneId}:${state.index}:${state.line.text}`;
      if (key !== lineKey) {
        lineKey = key;
        startTyping(state.line.text);
      }
    } else if (!state.line) {
      lineKey = "";
      fullText = "";
      shown = 0;
      stopTimer();
      line.textContent = "";
      name.hidden = true;
    }

    choices.replaceChildren();
    if (!atEnd && state.choices) {
      state.choices.forEach((option, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "choice";
        button.textContent = option.text;
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          handlers.onChoose(index);
        });
        choices.append(button);
      });
    }
  };

  return { render, typing, finishTyping, cancel, setTextSpeed, setInstant };
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function css(theme: Theme): string {
  const box = theme.textBox;
  const plate = theme.choice;
  const name = theme.nameplate;
  return `
    html, body { margin: 0; background: ${theme.pageBackground}; height: 100%; }
    button { font-family: inherit; cursor: pointer; }
    .viewport {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: ${theme.pageBackground};
      overflow: hidden;
    }
    .viewport.mobile-portrait {
      min-height: 100dvh;
      height: 100dvh;
      display: flex;
      flex-direction: column;
      place-items: stretch;
      align-content: stretch;
    }
    .fit { position: relative; overflow: hidden; }
    .viewport.mobile-portrait .fit {
      width: 100%;
      min-height: 0;
    }
    .stage-ui {
      display: none;
    }
    .viewport.mobile-portrait .stage-ui {
      display: block;
      position: relative;
      z-index: 5;
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px calc(12px + env(safe-area-inset-bottom, 0px));
      background: linear-gradient(180deg, rgba(7, 11, 20, 0.2), rgba(7, 11, 20, 0.92) 28%);
      font-family: ${theme.fontFamily};
      color: ${theme.color};
    }
    .stage {
      position: absolute;
      left: 0;
      top: 0;
      width: ${theme.stageWidth}px;
      height: ${theme.stageHeight}px;
      overflow: hidden;
      transform-origin: top left;
      font-family: ${theme.fontFamily};
      color: ${theme.color};
      background: ${theme.pageBackground};
    }
    .bg, .ending-cg, .cg img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .bg { z-index: 0; }
    .actors { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
    .actor {
      position: absolute;
      width: auto;
      max-width: none;
      object-fit: contain;
      object-position: center bottom;
    }
    .actor.near { z-index: 2; }
    .actor.far { z-index: 1; }
    /* Puppy #93: dual — crop each full-canvas sprite into its half and lift far. */
    .actors.actors-dual .actor {
      width: ${DUAL_ACTOR.maxWidthPercent}%;
      max-width: ${DUAL_ACTOR.maxWidthPercent}%;
      min-width: 0;
      object-fit: cover;
      object-position: center bottom;
    }
    .actors.actors-dual .actor.near { z-index: ${DUAL_ACTOR.nearZ}; }
    .actors.actors-dual .actor.far { z-index: ${DUAL_ACTOR.farZ}; }
    .cg {
      position: absolute;
      inset: 0;
      z-index: 4;
      padding: 0;
      border: 0;
      background: #07090f;
      cursor: pointer;
    }
    .say {
      position: absolute;
      left: ${box.left}px;
      right: ${box.right}px;
      bottom: ${box.bottom}px;
      height: ${box.height}px;
      z-index: 5;
      background: url("${box.image}") center / 100% 100% no-repeat;
    }
    .name {
      position: absolute;
      top: -28px;
      left: 18px;
      margin: 0;
      padding: 3px 14px 4px;
      background: ${name.background};
      border: 1px solid ${name.border};
      font-size: ${name.fontSize}px;
      letter-spacing: ${name.letterSpacing};
      font-weight: 600;
    }
    .line {
      margin: 0;
      padding: ${box.paddingTop}px ${box.paddingX}px 0;
      font-size: ${box.fontSize}px;
      line-height: ${box.lineHeight};
      font-weight: 500;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
      white-space: pre-wrap;
    }
    .choices {
      position: absolute;
      left: 180px;
      right: 180px;
      bottom: ${box.bottom + box.height + 28}px;
      z-index: 6;
      display: flex;
      flex-direction: column;
      gap: ${plate.gap}px;
    }
    .choice {
      color: ${plate.color};
      background: url("${plate.image}") center / 100% 100% no-repeat;
      border: 0;
      min-height: ${plate.minHeight}px;
      font-size: ${plate.fontSize}px;
      letter-spacing: 0.08em;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    }
    .choice:hover, .choice:focus-visible {
      background-image: url("${plate.imageActive}");
    }
    .credit {
      position: absolute;
      z-index: 6;
      left: 28px;
      top: 20px;
      margin: 0;
      max-width: 28rem;
      font-size: 13px;
      letter-spacing: 0.04em;
      color: ${theme.creditColor};
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
      pointer-events: none;
    }
    .ending { position: absolute; inset: 0; z-index: 7; }
    .ending-card {
      position: absolute;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(${theme.endingCard.maxWidth}px, calc(100% - 80px));
      padding: 28px 32px 32px;
      background: ${theme.endingCard.background};
      border: 1px solid ${theme.endingCard.border};
      text-align: center;
    }
    .ending-kicker {
      margin: 0;
      letter-spacing: 0.28em;
      font-size: 14px;
      opacity: 0.8;
    }
    .ending-id {
      margin: 12px 0 0;
      font-size: 36px;
      letter-spacing: 0.14em;
    }
    .ending-home {
      display: block;
      margin: 22px auto 0;
      min-width: 160px;
      min-height: 48px;
      padding: 10px 28px;
      border: 1px solid rgba(255, 255, 255, 0.55);
      border-radius: 999px;
      background: rgba(20, 20, 28, 0.78);
      color: #fff;
      font: inherit;
      font-size: 18px;
      letter-spacing: 0.12em;
      cursor: pointer;
      pointer-events: auto;
    }
    .ending-home:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 3px;
    }
    .viewport.mobile-portrait .say[hidden],
    .viewport.mobile-portrait .choices[hidden] {
      display: none !important;
    }
    .viewport.mobile-portrait .say {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      height: auto;
      min-height: 148px;
      background: url("${box.image}") center / 100% 100% no-repeat;
    }
    .viewport.mobile-portrait .name {
      top: -26px;
      left: 12px;
      font-size: clamp(15px, 3.8vw, 18px);
    }
    .viewport.mobile-portrait .line {
      padding: 36px 18px 18px;
      font-size: clamp(17px, 4.6vw, 21px);
      line-height: 1.65;
    }
    .viewport.mobile-portrait .choices {
      position: relative;
      left: auto;
      right: auto;
      bottom: auto;
      margin: 0 0 12px;
      gap: 8px;
    }
    .viewport.mobile-portrait .choice {
      min-height: 48px;
      font-size: clamp(15px, 4vw, 18px);
    }
    .viewport.mobile-portrait .credit {
      left: 12px;
      top: 10px;
      font-size: 11px;
      max-width: 90%;
    }
    .viewport.mobile-portrait .ending {
      position: fixed;
      inset: 0;
      z-index: 25;
      display: block;
    }
    .viewport.mobile-portrait .ending[hidden] {
      display: none !important;
    }
    .viewport.mobile-portrait .ending-card {
      width: min(440px, calc(100% - 32px));
      padding: 22px 18px 24px;
    }
    .viewport.mobile-portrait .ending-id {
      font-size: clamp(24px, 7vw, 36px);
    }
    .viewport.mobile-portrait .ending-home {
      min-height: 52px;
      font-size: clamp(16px, 4.5vw, 20px);
      margin-top: 18px;
    }
    .viewport.mobile-portrait .cg {
      position: fixed;
      inset: 0;
      z-index: 24;
    }
    .viewport.mobile-portrait .cg[hidden] {
      display: none !important;
    }
  `;
}
