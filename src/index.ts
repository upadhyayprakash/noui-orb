import { NouiOrbElement } from "./element";

if (!customElements.get("noui-orb")) customElements.define("noui-orb", NouiOrbElement);

export { NouiOrbElement };
export type {
  GestureName, OrbConfig, OrbEventDetails, OrbLevels, OrbProgress, OrbState, Placement,
} from "./types";
