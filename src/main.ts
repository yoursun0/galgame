import ask from "../works/mystery-fixture/story/ask.json";
import corridor from "../works/mystery-fixture/story/corridor.json";
import done from "../works/mystery-fixture/story/done.json";
import drawer from "../works/mystery-fixture/story/drawer.json";
import lock from "../works/mystery-fixture/story/lock.json";
import manifest from "../works/mystery-fixture/work.json";

const instructionCount =
  corridor.instructions.length +
  lock.instructions.length +
  drawer.instructions.length +
  ask.instructions.length +
  done.instructions.length;

const status = document.querySelector("#status");
if (status) {
  status.textContent = `format loaded: ${manifest.id} (${instructionCount})`;
}
