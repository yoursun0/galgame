import { lstatSync, readFileSync, readlinkSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const MAX_LINK_BYTES = 1024;

export type StoredLink =
  | { kind: "file" }
  | { kind: "link"; target: string }
  | { kind: "broken" };

/**
 * Git mode 120000. With core.symlinks=false the working tree file is the
 * link text (a relative path), not the image. A real symlink is handled too.
 * Targets must stay inside `root`.
 */
export function inspectAssetFile(filePath: string, root: string): StoredLink {
  let stat;
  try {
    stat = lstatSync(filePath);
  } catch {
    return { kind: "file" };
  }

  let linkText: string | null = null;
  if (stat.isSymbolicLink()) {
    try {
      linkText = readlinkSync(filePath);
    } catch {
      return { kind: "broken" };
    }
  } else if (stat.isFile() && stat.size > 0 && stat.size <= MAX_LINK_BYTES) {
    let text: string;
    try {
      const buf = readFileSync(filePath);
      if (buf.includes(0)) return { kind: "file" };
      text = buf.toString("utf8");
    } catch {
      return { kind: "file" };
    }
    if (!isRelativeLinkText(text)) return { kind: "file" };
    linkText = text.trim();
  } else {
    return { kind: "file" };
  }

  const target = resolveLinkTarget(filePath, linkText, root);
  if (!target) return { kind: "broken" };
  return { kind: "link", target };
}

function isRelativeLinkText(text: string): boolean {
  const line = text.trim();
  if (line.length === 0 || line.length > 512) return false;
  if (/[\u0000-\u001F]/.test(line)) return false;
  if (line.includes("://")) return false;
  if (isAbsolute(line) || /^[A-Za-z]:[\\/]/.test(line)) return false;
  return (
    line.startsWith("../") ||
    line.startsWith("..\\") ||
    line.startsWith("./") ||
    line.startsWith(".\\")
  );
}

function resolveLinkTarget(filePath: string, linkText: string, root: string): string | null {
  const raw = linkText.trim();
  if (raw.length === 0 || raw.includes("\0")) return null;
  const absolute = isAbsolute(raw) ? raw : resolve(dirname(filePath), raw);
  let rootReal: string;
  let targetReal: string;
  try {
    rootReal = realpathSync(root);
    targetReal = realpathSync(absolute);
  } catch {
    return null;
  }
  const rel = relative(rootReal, targetReal);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    return null;
  }
  try {
    if (!statSync(targetReal).isFile()) return null;
  } catch {
    return null;
  }
  return targetReal;
}
