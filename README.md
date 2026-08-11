# Sequencer Web MIDI prototype

A browser-based ten-step MIDI pitch sequencer with ten vertical pitch sliders,
ten step buttons, one master fader, tempo control, and Web MIDI output.

## Run it

Install the TypeScript 7 and Vite development dependencies:

```sh
cd /Users/jdonat/Projects/SophistryEng/Sequencer
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

## Sequencer behavior

- Pitch sliders 1–10: MIDI notes 48–72 (C3–C5), a two-octave range
- Step buttons 1–10: independently enable or disable their step
- Playback: steps 1–10 from left to right, then loops back to step 1
- Timing: one step per beat at 30–300 BPM, with an 80% note gate
- Notes: velocity 100 on the selected MIDI channel
- Master: Control Change 7
- Transport: MIDI Start, Stop, and 24 MIDI Clock pulses per quarter note

The page sends to physical MIDI outputs and virtual MIDI outputs already
installed on the computer. It does not create a virtual MIDI port itself.

## Connect to GarageBand on macOS

1. Open **Audio MIDI Setup** and choose **Window > Show MIDI Studio**.
2. Double-click **IAC Driver**.
3. Turn on **Device is online**.
4. Add or rename a bus to `Sequencer`, then click **Apply**.
5. Reload this web app, click **Enable MIDI**, and select the `Sequencer` IAC
   output.
6. In GarageBand, create and select a Software Instrument track.
7. Return to the web app and click **Start sequencer**.

GarageBand will receive the sequenced MIDI notes and master-volume CC from the
IAC bus. Incoming MIDI Clock support is separate from note reception and depends
on GarageBand's synchronization features; the sequenced notes do not require
GarageBand to follow the clock.
