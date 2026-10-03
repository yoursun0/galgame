import themeData from "./themes/ui-gameplay2.json";

export type Theme = {
  id: string;
  pageBackground: string;
  stageWidth: number;
  stageHeight: number;
  fontFamily: string;
  color: string;
  charsPerSecond: number;
  textBox: {
    image: string;
    left: number;
    right: number;
    bottom: number;
    height: number;
    fontSize: number;
    lineHeight: number;
    paddingTop: number;
    paddingX: number;
  };
  nameplate: {
    background: string;
    border: string;
    fontSize: number;
    letterSpacing: string;
  };
  choice: {
    image: string;
    imageActive: string;
    color: string;
    fontSize: number;
    minHeight: number;
    gap: number;
  };
  endingCard: {
    background: string;
    border: string;
    maxWidth: number;
  };
  actors: {
    near: { heightPercent: number; bottomPercent: number };
    far: { heightPercent: number; bottomPercent: number };
  };
  creditColor: string;
};

/** Static URLs so Vite can bundle theme frames. The theme file itself stays data. */
const themeFiles: Record<string, string> = {
  "ui-gameplay2/img/text-box.png": new URL("../ui-gameplay2/img/text-box.png", import.meta.url).href,
  "ui-gameplay2/img/btn-plate.png": new URL("../ui-gameplay2/img/btn-plate.png", import.meta.url).href,
  "ui-gameplay2/img/btn-plate-active.png": new URL(
    "../ui-gameplay2/img/btn-plate-active.png",
    import.meta.url,
  ).href,
};

function assetUrl(repoRelativePath: string): string {
  const url = themeFiles[repoRelativePath];
  if (!url) throw new Error(`theme asset is not bundled: ${repoRelativePath}`);
  return url;
}

/** First theme. Colors and frames come from ui-gameplay2. No code in the theme file. */
export function loadTheme(): Theme {
  const data = themeData as Theme;
  return {
    ...data,
    textBox: { ...data.textBox, image: assetUrl(data.textBox.image) },
    choice: {
      ...data.choice,
      image: assetUrl(data.choice.image),
      imageActive: assetUrl(data.choice.imageActive),
    },
  };
}
