# counterpoint

counterpoint is a browser-based 8–32-step MIDI pitch sequencer with vertical
pitch sliders, step buttons, a two-sequencer split control, tempo control, and
Web MIDI output. Root-note and scale controls quantize every sequenced pitch.

## Run it

Install the TypeScript 7 and Vite development dependencies:

```sh
npm install
npm run dev
```

Then open the local address printed by Vite in Chrome or Edge and click
**Enable MIDI**.
The browser will ask for permission to use connected MIDI devices.

Web MIDI requires a secure context. Vite's `localhost` development server
counts as secure; double-clicking `index.html` is not supported.

## Commands

- `npm run dev` starts the local development server.
- `npm run check` type-checks the MIDI controller with TypeScript 7.
- `npm run build` type-checks and creates a production build in `dist/`.
- `npm run preview` serves the production build locally.

## GitHub Pages

The `Deploy static content to Pages` workflow builds and publishes `dist` when
changes are pushed to `dev`, or when it is started manually from the Actions
tab. In the repository’s **Settings → Pages**, set **Source** to
**GitHub Actions** before the first deployment.

## Sequencer behavior

- Step count: 8–32 steps, defaulting to 10; the fader row scrolls horizontally
  when its controls are wider than the available space
- Pitch sliders: MIDI notes 36–72 (C2–C5), a three-octave range
- Root note: all 12 chromatic pitch classes
- Scales: all seven diatonic modes—Ionian, Dorian, Phrygian, Lydian,
  Mixolydian, Aeolian, and Locrian—plus Minor Pentatonic and Harmonic Minor
- Quantization: displayed and transmitted notes snap to the nearest selected
  scale tone while each slider retains its underlying chromatic position
- Step buttons: cycle through On, Off, and Skip
  - On plays the step normally
  - Off creates a timed rest
  - Skip removes the step from timing and immediately advances to the next
    non-skipped step
- Split control: assigns 0–N steps to Sequencer A and the remainder to
  Sequencer B, where N is the selected step count
- Playback: Sequencers A and B run concurrently and loop independently
- Clock ratio: `1:1`, `1:2`, `1:4`, `2:3`, `5:7`, or `7:11`
- Timing: the BPM control sets Sequencer A's step clock; Sequencer B's BPM is
  `A BPM × ratio second ÷ ratio first`, with an 80% note gate
- MIDI channels: independent Synth A and Synth B selectors, both defaulting to
  channel 1
- Notes: velocity 100, routed through the channel assigned to their sequencer
- Transport: MIDI Start, Stop, and 24 MIDI Clock pulses per quarter note at
  Sequencer A's BPM

For example, with 10 steps selected, a split of `6` gives Sequencer A six steps
and Sequencer B four steps. With A set to 120 BPM and a `2:3` ratio, A advances
at 120 BPM while B advances at 180 BPM. Each loops as soon as it reaches the end
of its own steps. At either end of the split range, one sequencer is empty and
the other plays all selected steps.

MIDI Clock is a global, channel-independent message, so the external MIDI Clock
output represents Sequencer A's BPM. Sequencer B's derived clock is used by the
app's internal note scheduler rather than sent as a second MIDI Clock stream.

The page sends to physical MIDI outputs and virtual MIDI outputs already
installed on the computer. It does not create a virtual MIDI port itself.

## Connect to GarageBand on macOS

1. Open **Audio MIDI Setup** and choose **Window > Show MIDI Studio**.
2. Double-click **IAC Driver**.
3. Turn on **Device is online**.
4. Add or rename a bus to `counterpoint`, then click **Apply**.
5. Reload this web app, click **Enable MIDI**, and select the `counterpoint` IAC
   output.
6. In GarageBand, create and select a Software Instrument track.
7. Return to the web app and click **Start sequencer**.

GarageBand will receive the sequenced MIDI notes from the IAC bus. Incoming MIDI
Clock support is separate from note reception and depends on GarageBand's
synchronization features; the sequenced notes do not require GarageBand to
follow the clock.
