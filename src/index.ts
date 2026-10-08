import { NouiOrbElement } from "./element";

// Registers in the browser only, so the package can be imported during server-side rendering.
if (typeof customElements !== "undefined" && !customElements.get("noui-orb")) {
  customElements.define("noui-orb", NouiOrbElement);
}

export { NouiOrbElement };
export type {
  GestureName, OrbConfig, OrbEventDetails, OrbLevels, OrbProgress, OrbState, Placement,
} from "./types";
