# Issue #28 gap report (early-align PR → 九把刀)

SoT: `works/xingkong/production/twine/xingkong.twee` @ revise-plot `6461f15` (+ main tip `#27`).

## This PR (kickoff) did

- Aligned **existing** early playable JSON (`open1`…`midcard` chain) to revise-plot prose where those scenes already map to Ch01–Ch04.
- Removed playable `star_poem` / 《在天邊》 path: `star_stay` and `star_leave` now jump straight to `midcard`. Deleted `story/star_poem.json`.
- Expanded `star_leave` with Ch04-Leave 芷君星空對白 (twee kept this after Leave; Poem passage deleted).
- Left `midcard` as temporary soft end (`ending: playtest-midcard`) with copy noting Ch05+ not wired yet. **Did not** jump to `branch` (old prototype three-route hub ≠ Ch05-Road).

## Twee bug to fix

- `Ch04-Leave` still `(link-goto: "繼續", "Ch04-Poem")` but `Ch04-Poem` was deleted. Stay already goes to `Ch05-Road`. **Retarget Leave → `Ch05-Road`.**

## JSON still missing (Ch05+ = full game)

Playable JSON today covers roughly **Ch01–Ch04 only** (playtest spine), then stops at `midcard`.

| Twee chapter / block | JSON status | Notes |
|---|---|---|
| Ch01 Soc…End | Partial (`open*`/`st*`/`qi_*`/`zj*`) | Aligned this PR |
| Ch02 Wall…End | Partial (`bus1`/`wall_*`) | Choice labels still playtest-simplified vs twee Beside/Behind |
| Ch03 Stone…Dog | Partial (`temple_*`) | Hold/Name/Lie are playtest ladder variants |
| Ch04 Night…Stay/Leave | Partial (`star_*`) | Poem removed; no Ch05 jump yet |
| **Ch05 Road…End** | **None** | Bus Killer / stop — first full-game slice after midcard |
| **Ch06 Work…Bye** | **None** | |
| **Ch07 Late…Tea** | **None** | Frame coffee paths removed in revise-plot; keep ladder flags |
| **Ch08 Term…Sky** | **None** | Ch08-Frame/Dodge/Plain removed in twee |
| **Ch09 Hall…Turn** | **None** | Choice label polish in revise-plot |
| **Ch10 Camp…BadEnd** | **None** | Includes `Ch10-BadEnd` 「守不住的秘密」 |
| **Ch11 Tent…Walk** | **None** | Ch11-Frame removed |
| **Ch12 Year…Alone** + Su-* + End-Suting-Early | **None** | |
| **Ch13–Ch15** | **None** | |
| **Ch16–Ch18** | **None** | Ch16-Frame remains in twee (not the deleted Ch05/Ch08 coffee frames) |
| **Ch19–Ch24** + endings | **None** | Canon / route endings in twee |

## Old JSON endings still on disk (unreachable from playtest spine)

Prototype route hub `branch` → `s*` / `z*` / `q*` still listed in `work.json`, with endings:

- 素婷: `suting-true`, `suting-good`, `suting-bad-leave`, `suting-bad-rip`
- 芷君: `zhijun-true`, `zhijun-good`, `zhijun-bad-shield`, `zhijun-bad-bridge`
- 綺珊: `qishan-true`, `qishan-good`, `qishan-bad-setup`, `qishan-bad-cool`
- Soft: `playtest-midcard`

These are **v0.3 prototype endings**, not revise-plot Ch10–Ch24 endings. Do not reconnect `midcard`→`branch` as “Ch05”.

## Recommended order for 九把刀

1. Fix twee `Ch04-Leave` → `Ch05-Road`.
2. Port **Ch05** JSON; change `star_stay`/`star_leave` (or `midcard`) to enter Ch05; remove or repurpose `playtest-midcard`.
3. Port Ch06 → Ch07 (flags: `courage` / `candor` / `ch4_faced` + method-丙 per `adaptation-plan.md`).
4. Port Ch08–Ch10 including BadEnd; wire start→endings smoke test.
5. Port Ch11–Ch15, then Ch16–Ch24 + Su-* / End-* canon endings.
6. Retire or quarantine prototype `branch`/`s_*`/`z_*`/`q_*` once twee endings exist.
7. Puppy: tests + asset id wiring; Paddy: merge + Pages deploy (`bun run build`, base `/`).

## Out of scope here

- No merge, no deploy.
- No inventing Ch05+ plot in JSON.
- mystery-fixture untouched.
