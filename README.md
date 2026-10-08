# @nouisi/orb

`<noui-orb>` is the living form of the orange o in the noui mark: a voice surface, a loading and processing indicator, and the place assembled interface comes from. It is a framework-free Web Component (Custom Elements v1, Shadow DOM) with no runtime dependencies.

**Status: work in progress, not yet published to npm.** The install commands below work once `0.1.0` is out. The full reference is [`docs/SPEC.md`](docs/SPEC.md).

Demo (once deployed): https://noui.si/lab/orb/

## Quick start

```bash
npm i @nouisi/orb
```

```html
<noui-orb id="orb" gestures intro="auto" style="width: 320px"></noui-orb>

<script type="module">
  import "@nouisi/orb"; // registers <noui-orb>

  const orb = document.getElementById("orb");
  orb.state = "thinking";                               // idle | listening | thinking | working | speaking | error
  orb.addEventListener("orb-statechange", (e) => console.log(e.detail)); // { from, to }

  orb.state = "working";
  orb.progress = { steps: 3, done: 1, current: 0.4 };   // determinate ring; null means the spinning arc
  orb.gesture("nod").catch(() => {});                   // rejects with "suppressed" when gestures are off or rate limited
</script>
```

- Size the element from the outside; it fills its box and should be square.
- Without the `gestures` attribute, character motion (springs, lean, breath, wait) is off. States, audio and the ring still work.
- `intro="manual"` (the default) shows the logo and waits for `orb.intro()`. Use `intro="auto"` to play it on load or `intro="none"` to start as the orb.
- Importing `@nouisi/orb/element` gives you the class without registering it.

## Microphone and audio

The component never asks for the microphone. You do, and hand it the stream:

```js
const stream = await navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
});
orb.attachInput(stream);       // the user's voice (drives `listening`)
orb.state = "listening";

orb.attachOutput(audioElement); // the reply's audio (drives `speaking`); an AudioNode works too
```

If you analyse audio yourself (a native bridge, server-side audio), push levels instead: `orb.setLevels({ amp, bright, bass, treble }, "input" | "output")`. The orb fires `orb-input-silent` when an attached input stays quiet for 4 s or its track ends. Call `getUserMedia` from a click or tap, and serve the page over HTTPS.

## Using it with a framework

It is a standard custom element, so it works anywhere a custom element does. Set object-valued things (`progress`, `config`) as **properties**, listen to events with `addEventListener`, and import the package only in code that runs in the browser or is safe to run on the server (see below).

Verified in this repo: plain JavaScript, React 19, and importing and server-rendering under Node. The other frameworks below follow the same custom element rules but have not been tried here.

### React 19

Props are set as properties when the element has them, and `on<event-name>` attaches an event listener, so this works directly:

```jsx
import "@nouisi/orb";

function Orb({ state, progress }) {
  return (
    <noui-orb
      state={state}
      progress={progress}                       // an object, set as a property
      gestures=""                               // boolean attribute: present means on
      onorb-statechange={(e) => console.log(e.detail)}
      style={{ width: 320 }}
    />
  );
}
```

Call methods through a ref: `ref.current.gesture("hop")`, `ref.current.originRect()`.

### React 18 and earlier

React 18 turns object props into strings and has no event props for custom elements. Use a ref:

```jsx
const ref = useRef(null);
useEffect(() => { ref.current.progress = progress; }, [progress]);
useEffect(() => {
  const el = ref.current;
  const on = (e) => console.log(e.detail);
  el.addEventListener("orb-statechange", on);
  return () => el.removeEventListener("orb-statechange", on);
}, []);
return <noui-orb ref={ref} state={state} gestures="" />;
```

### Next.js and other server-rendered apps

The package is safe to import on a server: it only registers the element when `customElements` exists, so there is no `HTMLElement is not defined`. The server renders an empty `<noui-orb>` tag, and the browser upgrades it. In the Next.js App Router, use it from a client component (`"use client"`) as in the React example. I verified importing under Node and rendering with `react-dom/server`; I have not run a full Next.js app.

### Vue 3

Tell the compiler it is a custom element (`compilerOptions.isCustomElement: (tag) => tag === "noui-orb"`), then use `.prop` for objects: `<noui-orb :state="state" :progress.prop="progress" gestures @orb-statechange="onChange" />`.

### Svelte

Svelte sets props on custom elements as properties and supports `on:` for their events: `<noui-orb {state} {progress} gestures on:orb-statechange={onChange} />`.

### Not provided yet

- Type declarations for the `<noui-orb>` tag in React JSX, Vue templates and Svelte. The element class and its types are exported (`NouiOrbElement`, `OrbState`, `OrbProgress`, ...), so you can write the declaration for your framework yourself.
- CommonJS and a plain `<script>` tag build. The package is ESM only.
- Thin framework wrapper packages.

## Licence

The code is MIT licensed (see `LICENSE`). The noui name and the noui mark are not licensed for reuse.
