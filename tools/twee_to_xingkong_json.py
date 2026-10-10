#!/usr/bin/env python3
"""Convert xingkong.twee Ch05+ passages into story JSON scenes.

Early Ch01–Ch04 stay on existing open*/st*/wall*/temple*/star* JSON.
This script emits ch05-* … ch24-* / end-* / su-* and helper gate scenes.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TWEE = ROOT / "works/xingkong/production/twine/xingkong.twee"
STORY = ROOT / "works/xingkong/story"
WORK = ROOT / "works/xingkong/work.json"

SKIP = {"StoryTitle", "StoryData", "StoryCSS", "StoryInit", "Title"}

# Broken / orphan remaps (revise-plot leftovers; no new plot)
REMAP_GOTO = {
    "Ch04-Poem": "Ch05-Road",
    "Ch08-Frame": "Ch07-Ask",  # after Ch07 candor beat → continue Ask
    "Ch11-Frame": "Ch16-Coat",
    "Ch05-Ask": "Ch22-Corner",
    "Title": None,  # ending / restart handled as ending instr
}

# Wire orphan candor frames into spine (same text, only entry/exit)
OVERRIDE_LINKS = {
    # Insert Ch07-Frame after Late; candor branches rejoin Ask
    "Ch07-Late": [("繼續", "Ch07-Frame")],
    "Ch07-Dodge": [("繼續", "Ch07-Ask")],
    "Ch07-Plain": [("繼續", "Ch07-Ask")],
    # Insert Ch16-Frame before Coat
    "Ch15-Snap": [("第十六話", "Ch16-Frame")],
    "Ch16-Frame": None,  # keep choices; remap targets below via REMAP_GOTO
}

SPEAKERS = {
    "凌晨": "lingchen",
    "素婷": "suting",
    "綺珊": "qishan",
    "芷君": "zhijun",
    "家綸": "jialun",
    "會長": "huizhang",
    "學生": None,  # narration-ish / keep as narration with name prefix
    "寶方": None,
    "阿俊": None,
    "大鼻": None,
    "女孩": None,
    "男孩": None,
}

# chapter → default bg / bgm
CHAPTER_LOOK = {
    "ch05": ("bg-bus", "bgm-12-village-2018", "zhijun", "01-laugh"),
    "ch06": ("bg-soc", "bgm-16-town-theme-rpg", "lingchen", "01-shrug"),
    "ch07": ("bg-coffee", "bgm-13-peaceful-tune-2", "zhijun", "01-laugh"),
    "ch08": ("bg-coffee", "bgm-16-town-theme-rpg", "qishan", "01-grin"),
    "ch09": ("bg-soc", "bgm-15-bird-in-hand-night", "suting", "01-smile"),
    "ch10": ("bg-firefly", "bgm-01-starfield-romance", "suting", "03-worry"),
    "ch11": ("bg-grassland", "bgm-09-nighttime-solitude", "lingchen", "04-cold"),
    "ch12": ("bg-coffee", "bgm-07-emotional-piano-loop", "suting", "02-sigh"),
    "ch13": ("bg-beach-day", "bgm-05-sunset-plains", "suting", "01-smile"),
    "ch14": ("bg-canteen", "bgm-16-town-theme-rpg", "jialun", None),
    "ch15": ("bg-beach-day", "bgm-04-yoiyami-core-theme", "qishan", "03-angry"),
    "ch16": ("bg-grassland", "bgm-08-dream-ambience", "qishan", "01-grin"),
    "ch17": ("bg-beach-day", "bgm-01-starfield-romance", "zhijun", "01-laugh"),
    "ch18": ("bg-firefly", "bgm-15-bird-in-hand-night", "zhijun", "05-tearsmile"),
    "ch19": ("bg-beach-day", "bgm-10-i-swear-i-saw-it", "zhijun", "03-glare"),
    "ch20": ("bg-beach-day", "bgm-02-first-light-particles", "zhijun", "01-laugh"),
    "ch21": ("bg-canteen", "bgm-07-emotional-piano-loop", "zhijun", "02-hips"),
    "ch22": ("bg-coffee", "bgm-04-yoiyami-core-theme", "qishan", "01-grin"),
    "ch23": ("bg-mmw", "bgm-01-starfield-romance", "suting", "04-tears"),
    "ch24": ("bg-soc", "bgm-11-at-the-end-of-hope", "lingchen", "01-shrug"),
    "su": ("bg-coffee", "bgm-07-emotional-piano-loop", "suting", "05-spring"),
    "end": ("bg-grassland", "bgm-02-first-light-particles", "lingchen", "01-shrug"),
}

ENDING_IDS = {
    "Ch10-BadEnd": "ch10-bad-secret",
    "Ch12-Alone": "ch12-alone",
    "End-No-Look-Back": "end-no-look-back",
    "End-Suting-Early": "end-suting-early",
    "End-Zhijun-Hankie": "end-zhijun-hankie",
    "End-Qishan-Pinch": "end-qishan-pinch",
    "Ch24-Dawn": "end-canon-dawn",
}

# End-Canon-Rain continues to Ch24 — not a terminal ending
NON_TERMINAL_ENDS = {"End-Canon-Rain"}

EARLY_KEEP = re.compile(
    r"^(open|st|qi_|zj|bus1|wall|temple|star_|midcard|branch|s\d|s_|z\d|z_|q\d|q_)"
)


def pid(name: str) -> str:
    """Passage name → scene id (kebab-case)."""
    return name.lower().replace("_", "-")


def parse_passages(text: str) -> dict[str, str]:
    parts = re.split(r"^:: ", text, flags=re.M)
    out = {}
    for p in parts[1:]:
        lines = p.splitlines()
        name = lines[0].split("[")[0].strip()
        out[name] = "\n".join(lines[1:]).strip("\n")
    return out


def strip_markup(s: str) -> str:
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = s.replace("<br>", "\n").replace("<br/>", "\n").replace("<br />", "\n")
    s = re.sub(r"''([^']*)''", r"\1", s)
    s = re.sub(r"//([^/]*)//", r"\1", s)
    s = re.sub(r"\[\[([^\]]+)\]\]", r"\1", s)
    return s.strip()


def scene_header(scene_id: str, show_char: str | None, expr: str | None) -> list[dict]:
    prefix = scene_id.split("-")[0]
    if scene_id.startswith("end-") or scene_id.startswith("ch10-bad") or scene_id.startswith("ch12-alone"):
        look = CHAPTER_LOOK["end"]
    elif scene_id.startswith("su-"):
        look = CHAPTER_LOOK["su"]
    else:
        look = CHAPTER_LOOK.get(prefix, ("bg-soc", "bgm-13-peaceful-tune-2", "lingchen", "01-shrug"))
    bg, bgm, default_char, default_expr = look
    char = show_char or default_char
    ex = expr or default_expr or "01-shrug"
    # jialun/huizhang may lack sprites — only show known sprite chars
    SPRITE = {"lingchen", "suting", "qishan", "zhijun"}
    instr: list[dict] = [
        {"kind": "background", "asset": bg},
        {"kind": "audio", "action": "play", "channel": "bgm", "asset": bgm},
    ]
    for cid in ("lingchen", "suting", "qishan", "zhijun"):
        instr.append({"kind": "actor", "action": "hide", "id": cid})
    if char in SPRITE:
        instr.append({"kind": "actor", "action": "show", "id": char, "expr": ex, "position": "near"})
    instr.append({"kind": "cg", "action": "hide"})
    return instr


def parse_set_macros(chunk: str) -> list[dict]:
    """Parse (set: ...) inside a link action; emit set instr + courage/candor incr helpers."""
    sets: list[dict] = []
    # boolean / simple
    for m in re.finditer(r"\(set:\s*\$(\w+)\s+to\s+(true|false|\d+)\)", chunk):
        var, val = m.group(1), m.group(2)
        if val in ("true", "false"):
            sets.append({"kind": "set", "var": var, "value": val == "true"})
        else:
            sets.append({"kind": "set", "var": var, "value": int(val)})
    # courage / candor increment: (set: $courage to (min: 5, $courage + 1))
    if re.search(r"\$courage\s+to\s+\(min:\s*5,\s*\$courage\s*\+\s*1\)", chunk):
        sets.append({"kind": "_inc", "var": "courage", "cap": 5})
    if re.search(r"\$candor\s+to\s+\(min:\s*4,\s*\$candor\s*\+\s*1\)", chunk):
        sets.append({"kind": "_inc", "var": "candor", "cap": 4})
    return sets


def extract_links(body: str) -> tuple[str, list[dict]]:
    """Return (body_without_links, list of link dicts).

    link dict: {text, goto, sets, when?}
    """
    links: list[dict] = []
    # (if: COND)[(link...)](else:)[(link...)]
    if_else = re.compile(
        r"\(if:\s*([^)]+)\)\[(.*?)\](?:\(else:\)\[(.*?)\])?",
        re.S,
    )

    def parse_cond(expr: str) -> dict | None:
        expr = expr.strip()
        # $a and $b
        if " and " in expr:
            parts = [p.strip() for p in expr.split(" and ")]
            conds = []
            for p in parts:
                c = parse_cond(p)
                if c:
                    conds.append(c)
            return {"all": conds} if conds else None
        m = re.match(r"\$(\w+)\s*>=\s*(\d+)", expr)
        if m:
            return {"cmp": "gte", "var": m.group(1), "value": int(m.group(2))}
        m = re.match(r"\$(\w+)\s*<=\s*(\d+)", expr)
        if m:
            return {"cmp": "lte", "var": m.group(1), "value": int(m.group(2))}
        m = re.match(r"\$(\w+)$", expr)
        if m:
            return {"cmp": "eq", "var": m.group(1), "value": True}
        return None

    working = body
    # Handle if/else blocks first — convert to special link entries
    for m in if_else.finditer(body):
        cond = parse_cond(m.group(1))
        then_chunk = m.group(2) or ""
        else_chunk = m.group(3) or ""
        for kind, chunk in (("then", then_chunk), ("else", else_chunk)):
            for lm in re.finditer(
                r'\(link(?:-goto)?:\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\)(?:\[(.*?)\])?',
                chunk,
                re.S,
            ):
                text = lm.group(1)
                goto = lm.group(2)
                action = lm.group(3) or ""
                if not goto:
                    gm = re.search(r'\(goto:\s*"([^"]+)"\)', action)
                    goto = gm.group(1) if gm else None
                sets = parse_set_macros(action)
                entry = {"text": text, "goto": goto, "sets": sets}
                if kind == "then" and cond:
                    entry["when"] = cond
                elif kind == "else":
                    entry["when_else"] = True
                links.append(entry)
        working = working.replace(m.group(0), "")

    # Remaining plain links
    for lm in re.finditer(
        r'\(link(?:-goto)?:\s*"([^"]+)"(?:\s*,\s*"([^"]+)")?\)(?:\[(.*?)\])?',
        working,
        re.S,
    ):
        text = lm.group(1)
        goto = lm.group(2)
        action = lm.group(3) or ""
        if not goto:
            gm = re.search(r'\(goto:\s*"([^"]+)"\)', action)
            goto = gm.group(1) if gm else None
        sets = parse_set_macros(action)
        links.append({"text": text, "goto": goto, "sets": sets})
        working = working.replace(lm.group(0), "", 1)

    prose = strip_markup(working)
    # clean leftover empty lines / macros
    prose = re.sub(r"\(set:[^)]*\)", "", prose)
    prose = re.sub(r"\n{3,}", "\n\n", prose).strip()
    return prose, links


def prose_to_instructions(prose: str) -> list[dict]:
    if not prose:
        return []
    instr: list[dict] = []
    lines = [ln.strip() for ln in prose.splitlines()]
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
        # speaker line ending with ： or :
        m = re.match(r"^(.+?)[：:]\s*$", line)
        if m and (m.group(1) in SPEAKERS or m.group(1) in ("學生", "寶方", "阿俊", "大鼻", "女孩", "男孩")):
            name = m.group(1)
            i += 1
            buf = []
            while i < len(lines) and lines[i] and not re.match(r"^.+[：:]\s*$", lines[i]):
                buf.append(lines[i])
                i += 1
            text = "".join(buf).strip() if buf else ""
            # sometimes dialogue on same structure with empty — skip empty
            if not text:
                continue
            sid = SPEAKERS.get(name)
            if sid:
                instr.append({"kind": "dialogue", "speaker": sid, "text": text})
            else:
                instr.append({"kind": "narration", "text": f"{name}：{text}"})
            continue
        # plain narration — merge consecutive non-speaker lines into one beat if short
        instr.append({"kind": "narration", "text": line})
        i += 1
    return instr


def resolve_goto(g: str | None) -> str | None:
    if g is None:
        return None
    if g in REMAP_GOTO:
        return REMAP_GOTO[g]
    return g


def make_inc_scenes(var: str, cap: int, then_to: str, base_id: str) -> list[dict]:
    """Emit helper scenes that increment var up to cap then jump to then_to."""
    scenes = []
    gate_id = f"{base_id}__inc_{var}"
    # gate: jump chain by current value
    gate_instr = []
    for v in range(cap - 1, -1, -1):
        gate_instr.append(
            {
                "kind": "jump",
                "to": f"{base_id}__set_{var}_{v+1}",
                "when": {"cmp": "eq", "var": var, "value": v},
            }
        )
    gate_instr.append({"kind": "jump", "to": then_to})  # already at cap
    scenes.append({"id": gate_id, "instructions": gate_instr})
    for v in range(1, cap + 1):
        scenes.append(
            {
                "id": f"{base_id}__set_{var}_{v}",
                "instructions": [
                    {"kind": "set", "var": var, "value": v},
                    {"kind": "jump", "to": then_to},
                ],
            }
        )
    return scenes, gate_id


def apply_route_flags(passage: str, link_text: str, sets: list[dict]) -> list[dict]:
    """Add routes.md flags not present in twee macros."""
    extra = list(sets)
    # Ch01 Force/Let — only if we were converting Ch01; skip early
    if passage == "Ch02-Behind":
        extra.append({"kind": "set", "var": "sutingWalk", "value": True})
    if passage == "Ch02-Beside":
        extra.append({"kind": "set", "var": "sutingWalk", "value": False})
    if passage == "Ch03-Names":
        extra.append({"kind": "set", "var": "zhijunName", "value": True})
    if passage == "Ch01-Force":
        extra.append({"kind": "set", "var": "qishanHonest", "value": True})
    if passage == "Ch01-Let":
        extra.append({"kind": "set", "var": "qishanHonest", "value": False})
    return extra


def convert_passage(name: str, body: str, all_names: set[str]) -> tuple[list[dict], list[dict]]:
    """Return (scenes_for_this_passage, extra_helper_scenes)."""
    helpers: list[dict] = []
    # OVERRIDE_LINKS for link list replacement
    prose, links = extract_links(body)
    if name in OVERRIDE_LINKS and OVERRIDE_LINKS[name] is not None:
        links = [{"text": t, "goto": g, "sets": []} for t, g in OVERRIDE_LINKS[name]]

    sid = pid(name)
    # pick show char from first dialogue speaker in prose
    show_char = None
    expr = None
    for sp, cid in SPEAKERS.items():
        if cid and (sp + "：" in body or sp + ":" in body):
            show_char = cid
            break

    instr = scene_header(sid, show_char, expr)
    instr.extend(prose_to_instructions(prose))

    # Terminal endings
    if name in ENDING_IDS:
        # add ending after prose; skip Title restart links
        links = [L for L in links if resolve_goto(L.get("goto")) is not None]
        if not any(i.get("kind") == "ending" for i in instr):
            instr.append({"kind": "ending", "id": ENDING_IDS[name]})
        return [{"id": sid, "instructions": instr}], helpers

    if name in NON_TERMINAL_ENDS:
        # just continue via links
        pass

    # Auto if/else with single continue each side and no player choice text variety
    # → use jump-when chain instead of choice
    conditional = [L for L in links if L.get("when") or L.get("when_else")]
    plain = [L for L in links if not L.get("when") and not L.get("when_else")]

    # Special: Ch21-Story style auto-branch (link-goto inside if/else, no real choice)
    auto_branch = (
        len(conditional) >= 1
        and all(L.get("text") in ("赴美前", "繼續", "回到主題曲") or L.get("when") for L in conditional)
        and not plain
    )
    # Actually Ch21 has if with link-goto 赴美前 / else 繼續 — treat as auto jump
    if conditional and not plain:
        texts = {L["text"] for L in conditional}
        if texts <= {"赴美前", "繼續", "回到主題曲"} or all(
            L["text"] in ("赴美前", "繼續") or L.get("when") for L in conditional
        ):
            auto_branch = True

    if auto_branch and conditional:
        # order: when branches first, then else
        for L in conditional:
            if L.get("when_else"):
                continue
            g = resolve_goto(L.get("goto"))
            if g is None:
                continue
            instr.append({"kind": "jump", "to": pid(g), "when": L["when"]})
        for L in conditional:
            if not L.get("when_else"):
                continue
            g = resolve_goto(L.get("goto"))
            if g is None:
                continue
            instr.append({"kind": "jump", "to": pid(g)})
        return [{"id": sid, "instructions": instr}], helpers

    # Mix of conditional choice + plain choice (e.g. Ch10-Hand, Ch22-Table)
    if conditional and plain:
        # gateway scene: if condition met → choice_full else → choice_plain
        when = next(L["when"] for L in conditional if L.get("when"))
        full_id = f"{sid}__choice_full"
        plain_id = f"{sid}__choice_plain"
        instr.append({"kind": "jump", "to": full_id, "when": when})
        instr.append({"kind": "jump", "to": plain_id})

        def build_choice_scene(cid: str, opts: list[dict]) -> dict:
            c_instr = scene_header(cid, show_char, expr)
            # minimal — just choice
            c_instr = [
                {"kind": "background", "asset": scene_header(sid, None, None)[0]["asset"]},
            ]
            # reuse last bg from parent look
            prefix = sid.split("-")[0]
            bg = CHAPTER_LOOK.get(prefix, CHAPTER_LOOK["ch05"])[0]
            c_instr = [{"kind": "background", "asset": bg}]
            options = []
            for L in opts:
                g = resolve_goto(L.get("goto"))
                if g is None:
                    continue
                target = pid(g)
                sets = apply_route_flags(name, L["text"], L.get("sets") or [])
                if any(s.get("kind") == "_inc" for s in sets) or any(
                    s.get("kind") == "set" for s in sets
                ):
                    opt_id = f"{cid}__opt_{len(options)}"
                    opt_instr: list[dict] = []
                    then_to = target
                    for s in sets:
                        if s.get("kind") == "_inc":
                            hs, gate = make_inc_scenes(s["var"], s["cap"], then_to, opt_id)
                            helpers.extend(hs)
                            # after other sets, jump to gate
                            then_to = gate
                        elif s.get("kind") == "set":
                            opt_instr.append(s)
                    # if we had _inc, need to set flags then jump gate
                    # rebuild: apply non-inc sets, jump to gate or target
                    opt_instr = [s for s in sets if s.get("kind") == "set"]
                    inc = next((s for s in sets if s.get("kind") == "_inc"), None)
                    if inc:
                        hs, gate = make_inc_scenes(inc["var"], inc["cap"], target, opt_id)
                        # avoid dup if called twice — use unique
                        helpers.extend(hs)
                        opt_instr.append({"kind": "jump", "to": gate})
                    else:
                        opt_instr.append({"kind": "jump", "to": target})
                    helpers.append({"id": opt_id, "instructions": opt_instr})
                    options.append({"text": L["text"], "jump": opt_id})
                else:
                    options.append({"text": L["text"], "jump": target})
            c_instr.append({"kind": "choice", "options": options})
            return {"id": cid, "instructions": c_instr}

        full_opts = [L for L in conditional if L.get("when")] + plain
        # when links might be the exclusive option; include plain always
        helpers.append(build_choice_scene(full_id, [L for L in links if not L.get("when_else")]))
        helpers.append(build_choice_scene(plain_id, plain))
        return [{"id": sid, "instructions": instr}], helpers

    # Single continue link → jump
    if len(links) == 1 and links[0]["text"] in ("繼續", "第二話", "第三話", "第四話", "第五話", "第六話", "第七話", "第八話", "第九話", "第十話", "第十一話", "第十二話", "第十三話", "第十四話", "第十五話", "第十六話", "第十七話", "第十八話", "第十九話", "第二十話", "第二十一話", "第二十二話", "第二十三話", "第二十四話", "回到主題曲"):
        L = links[0]
        g = resolve_goto(L.get("goto"))
        if g is None:
            # Title restart after ending-like — if no ending yet, add soft ending
            if name not in ENDING_IDS:
                instr.append({"kind": "ending", "id": f"end-{sid}"})
            return [{"id": sid, "instructions": instr}], helpers
        sets = apply_route_flags(name, L["text"], L.get("sets") or [])
        for s in sets:
            if s.get("kind") == "set":
                instr.append(s)
        inc = next((s for s in sets if s.get("kind") == "_inc"), None)
        if inc:
            hs, gate = make_inc_scenes(inc["var"], inc["cap"], pid(g), f"{sid}__link")
            helpers.extend(hs)
            instr.append({"kind": "jump", "to": gate})
        else:
            instr.append({"kind": "jump", "to": pid(g)})
        return [{"id": sid, "instructions": instr}], helpers

    # Multi choice
    if links:
        options = []
        for idx, L in enumerate(links):
            if L.get("when_else") and not L.get("when"):
                # else-only without plain sibling already handled
                pass
            g = resolve_goto(L.get("goto"))
            if g is None:
                continue
            target = pid(g)
            sets = apply_route_flags(name, L["text"], L.get("sets") or [])
            if sets:
                opt_id = f"{sid}__{idx}"
                opt_instr = [s for s in sets if s.get("kind") == "set"]
                inc = next((s for s in sets if s.get("kind") == "_inc"), None)
                if inc:
                    hs, gate = make_inc_scenes(inc["var"], inc["cap"], target, opt_id)
                    helpers.extend(hs)
                    opt_instr.append({"kind": "jump", "to": gate})
                else:
                    opt_instr.append({"kind": "jump", "to": target})
                helpers.append({"id": opt_id, "instructions": opt_instr})
                options.append({"text": L["text"], "jump": opt_id})
            else:
                options.append({"text": L["text"], "jump": target})
        if options:
            instr.append({"kind": "choice", "options": options})
        return [{"id": sid, "instructions": instr}], helpers

    # no links — dead end
    if name not in ENDING_IDS:
        instr.append({"kind": "ending", "id": f"end-{sid}"})
    return [{"id": sid, "instructions": instr}], helpers


def should_convert(name: str) -> bool:
    if name in SKIP:
        return False
    m = re.match(r"^Ch(\d+)", name)
    if m and int(m.group(1)) >= 5:
        return True
    if name.startswith("End-") or name.startswith("Su-"):
        return True
    return False


def main() -> None:
    text = TWEE.read_text(encoding="utf-8")
    # Fix Ch04-Leave broken link in twee SoT
    text2 = text.replace(
        '(link-goto: "繼續", "Ch04-Poem")',
        '(link-goto: "繼續", "Ch05-Road")',
        1,
    )
    if text2 != text:
        TWEE.write_text(text2, encoding="utf-8")
        text = text2
        print("fixed twee Ch04-Leave → Ch05-Road")

    passages = parse_passages(text)
    all_scenes: list[dict] = []
    converted = []
    for name, body in passages.items():
        if not should_convert(name):
            continue
        scenes, helpers = convert_passage(name, body, set(passages))
        all_scenes.extend(scenes)
        all_scenes.extend(helpers)
        converted.append(name)

    # Write scene files
    STORY.mkdir(parents=True, exist_ok=True)
    written = []
    for sc in all_scenes:
        path = STORY / f"{sc['id']}.json"
        path.write_text(json.dumps(sc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        written.append(sc["id"])

    print(f"converted passages: {len(converted)}")
    print(f"scene files: {len(written)}")

    # Update work.json: keep early scenes, replace midcard ending path, add new scenes
    work = json.loads(WORK.read_text(encoding="utf-8"))
    # ensure vars
    var_names = {v["name"] for v in work["variables"]}
    for name, typ, initial in [
        ("ch7_faced", "boolean", False),
        ("ch21_ask", "boolean", False),
    ]:
        if name not in var_names:
            work["variables"].append({"name": name, "type": typ, "initial": initial})

    early_prefixes = (
        "story/open",
        "story/st",
        "story/qi_",
        "story/zj",
        "story/bus1",
        "story/wall",
        "story/temple",
        "story/star_",
        "story/midcard",
    )
    early = [s for s in work["scenes"] if s.startswith(early_prefixes)]
    # drop prototype branch/s_/z_/q_ from active list? Keep files on disk but remove from manifest
    # so check doesn't require unreachable prototype — actually check only validates listed scenes.
    # Keep prototype listed for now so existing tests don't break hard; we'll update tests.
    prototype = [
        s
        for s in work["scenes"]
        if s.startswith(("story/branch", "story/s", "story/z", "story/q"))
        and not s.startswith(("story/star", "story/st", "story/qi_"))
    ]
    # careful: story/suting no; story/s1 ok; story/qi_ is early
    prototype = []
    for s in work["scenes"]:
        base = s.split("/")[-1]
        if base.startswith(("branch", "s1", "s2", "s3", "s4", "s_", "z1", "z2", "z3", "z4", "z_", "q1", "q2", "q3", "q4", "q_")):
            prototype.append(s)

    new_paths = [f"story/{sid}.json" for sid in written]
    # dedupe early (no star_poem)
    early = [s for s in early if "star_poem" not in s]
    work["scenes"] = early + new_paths + prototype
    # content version bump
    work["contentVersion"] = int(work.get("contentVersion", 2)) + 1
    WORK.write_text(json.dumps(work, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("updated work.json contentVersion", work["contentVersion"])
    print("scenes listed:", len(work["scenes"]))


if __name__ == "__main__":
    main()
