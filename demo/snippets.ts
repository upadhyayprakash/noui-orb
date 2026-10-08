// The code samples in the "Get started" section. Samples marked `data-run` in index.html are executed
// by tests/e2e/demo.spec.ts against the real component, so they can't drift out of date.
export const SNIPPETS: Record<string, string> = {
  install: `npm i @nouisi/orb`,

  html: `<noui-orb id="orb" gestures intro="auto" style="width: 320px"></noui-orb>

<script type="module">
  import "@nouisi/orb"; // registers <noui-orb>

  const orb = document.getElementById("orb");
</script>`,

  states: `orb.state = "listening"; // idle | listening | thinking | working | speaking | error

orb.state = "working";
orb.progress = { steps: 3, done: 1, current: 0.4 }; // null = spinning arc

orb.addEventListener("orb-statechange", (e) => console.log(e.detail)); // { from, to }`,

  mic: `const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
});
orb.attachInput(stream); // the user's voice drives "listening"
orb.state = "listening";

orb.addEventListener("orb-input-silent", () => console.log("the mic is silent"));`,

  reply: `// The reply's audio drives "speaking". An <audio> element or a Web Audio node both work.
orb.attachOutput(replyAudio);
orb.state = "speaking";

// Or push levels yourself (a native bridge, server-side audio):
orb.setLevels({ amp: 0.6, bright: 0.5, bass: 0.4, treble: 0.2 }, "output");`,

  gestures: `// gesture() returns a promise that rejects with "suppressed" when gestures are off or
// rate limited. That is normal, so swallow it.
const play = (name, opts) => orb.gesture(name, opts).catch(() => {});

play("nod");
play("point", { target: document.querySelector("button") });
play("interrupt"); // the user talked over a reply: stop speaking and listen
play("wait"); // a decision is pending; ends on any gesture, state change, tap or orb.stopWaiting()`,

  emit: `// Pulse the orb and move it up to make room.
orb.gesture("emit").catch(() => {});
const o = orb.originRect(); // { x, y, r } in viewport pixels, right now

// Animate your element out of that point.
const box = card.getBoundingClientRect();
card.animate(
  [
    { transform: \`translate(\${o.x - (box.left + box.width / 2)}px, \${o.y - (box.top + box.height / 2)}px) scale(0.15)\`, opacity: 0 },
    { transform: "none", opacity: 1 },
  ],
  { duration: 720, easing: "cubic-bezier(.3, 1.25, .5, 1)", fill: "both" },
);

// When the user starts working in the interface, shrink the orb into the corner.
orb.place("aside"); // "center" | "room" | "aside"
orb.addEventListener("orb-recall", () => orb.place("room")); // they tapped the orb`,

  react: `import "@nouisi/orb";

function Orb({ state, progress, onStateChange }) {
  return (
    <noui-orb
      state={state}
      progress={progress}
      gestures=""
      onorb-statechange={onStateChange}
      style={{ width: 320 }}
    />
  );
}`,
};
