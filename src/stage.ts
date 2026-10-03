import type { AssetRecord, PlayState, Work } from "./types.ts";
import type { Theme } from "./theme.ts";

export type StageHandlers = {
  onAdvance: () => void;
  onChoose: (index: number) => void;
  onDismissCg: () => void;
};

export type Stage = {
  render: (state: PlayState) => void;
  typing: () => boolean;
  finishTyping: () => void;
};

type ActorBox = { heightPercent: number; bottomPercent: number };

/**
 * DOM and CSS only. Decisions stay in reduce.
 * Full-page CG is a view overlay: a click hides it without advancing.
 */
export function mountStage(
  parent: HTMLElement,
  theme: Theme,
  work: Work,
  assets: AssetRecord[],
  urls: Map<string, string>,
  handlers: StageHandlers,
): Stage {
  const reduced =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const cps = reduced ? 10_000 : theme.charsPerSecond;

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
  card.append(kicker, endingId);
  ending.append(endingImg, card);
  stage.append(bg, actors, cg, credit, say, choices, ending);
  fit.append(stage);
  viewport.append(fit);
  parent.replaceChildren(viewport);

  const fitStage = () => {
    const scale = Math.min(
      window.innerWidth / theme.stageWidth,
      window.innerHeight / theme.stageHeight,
    );
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    fit.style.width = `${theme.stageWidth * safe}px`;
    fit.style.height = `${theme.stageHeight * safe}px`;
    stage.style.transform = `scale(${safe})`;
  };
  fitStage();
  window.addEventListener("resize", fitStage);

  let lineKey = "";
  let fullText = "";
  let shown = 0;
  let timer = 0;
  let dismissedCg: string | null = null;
  let latest: PlayState | null = null;

  const typing = () => shown < fullText.length;

  const paintLine = () => {
    line.textContent = fullText.slice(0, shown);
  };

  const stopTimer = () => {
    if (timer) window.clearInterval(timer);
    timer = 0;
  };

  const finishTyping = () => {
    shown = fullText.length;
    stopTimer();
    paintLine();
  };

  const startTyping = (text: string) => {
    fullText = text;
    shown = 0;
    stopTimer();
    paintLine();
    if (!text) return;
    const stepMs = Math.max(16, Math.round(1000 / cps));
    timer = window.setInterval(() => {
      shown = Math.min(fullText.length, shown + 1);
      paintLine();
      if (shown >= fullText.length) stopTimer();
    }, stepMs);
  };

  cg.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!latest?.cg) return;
    dismissedCg = latest.cg;
    handlers.onDismissCg();
    render(latest);
  });

  stage.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (target?.closest(".choice, .cg")) return;
    if (typing()) {
      finishTyping();
      return;
    }
    handlers.onAdvance();
  });

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
    latest = state;
    if (dismissedCg && state.cg !== dismissedCg) dismissedCg = null;

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
    const place = (group: typeof state.actors, box: ActorBox, fromLeft: boolean) => {
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
        if (fromLeft) img.style.left = `${6 + span}%`;
        else img.style.right = `${8 + span}%`;
        actors.append(img);
      });
    };
    place(near, theme.actors.near, true);
    place(far, theme.actors.far, false);

    const showCg = Boolean(state.cg) && !state.ending && dismissedCg !== state.cg;
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

  return { render, typing, finishTyping };
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
    .fit { position: relative; }
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
  `;
}
