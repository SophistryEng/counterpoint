type LaneId = "a" | "b";
type StepState = "on" | "off" | "skip";

interface ClockRatio {
	readonly label: string;
	readonly first: number;
	readonly second: number;
}

interface ScaleDefinition {
	readonly id: string;
	readonly label: string;
	readonly intervals: readonly number[];
}

interface SequencerStep {
	readonly note: number;
	readonly state: StepState;
}

interface LaneDefinition {
	readonly id: LaneId;
	readonly startIndex: number;
	readonly stepCount: number;
}

interface LaneCursor {
	readonly nextTimestamp: number;
	readonly nextIndex: number;
}

interface StepLocation {
	readonly laneId: LaneId;
	readonly laneStepNumber: number;
}

interface ScheduledStep extends SequencerStep {
	readonly index: number;
	readonly laneId: LaneId;
	readonly laneStepNumber: number;
	readonly startTimestamp: number;
	readonly endTimestamp: number;
}

interface ClockSchedule {
	readonly timestamps: readonly number[];
	readonly nextTimestamp: number;
}

interface StepSchedule {
	readonly events: readonly ScheduledStep[];
	readonly nextTimestamp: number;
	readonly nextIndex: number;
}

interface LaneStepSelection {
	readonly step: SequencerStep;
	readonly globalIndex: number;
	readonly localIndex: number;
	readonly nextIndex: number;
}

interface StepView {
	readonly strip: HTMLElement;
	readonly pitchSlider: HTMLInputElement;
	readonly pitchOutput: HTMLOutputElement;
	readonly noteLabel: HTMLElement;
	readonly name: HTMLElement;
	readonly toggle: HTMLButtonElement;
	readonly toggleText: HTMLSpanElement;
}

function requireElement<T extends Element>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (!element) throw new Error(`Required element not found: ${selector}`);
	return element;
}

function requireChild<T extends Element>(parent: ParentNode, selector: string): T {
	const element = parent.querySelector<T>(selector);
	if (!element) throw new Error(`Required template element not found: ${selector}`);
	return element;
}

const connectButton = requireElement<HTMLButtonElement>("#connect-midi");
const outputSelect = requireElement<HTMLSelectElement>("#midi-output");
const channelASelect = requireElement<HTMLSelectElement>("#midi-channel-a");
const channelBSelect = requireElement<HTMLSelectElement>("#midi-channel-b");
const statusLight = requireElement<HTMLSpanElement>("#status-light");
const statusText = requireElement<HTMLSpanElement>("#status-text");
const lastMessage = requireElement<HTMLOutputElement>("#last-message");
const rootNoteSelect = requireElement<HTMLSelectElement>("#root-note");
const scaleSelect = requireElement<HTMLSelectElement>("#scale");
const stepCountSelect = requireElement<HTMLSelectElement>("#step-count");
const verticalFaders = requireElement<HTMLDivElement>("#vertical-faders");
const faderTemplate = requireElement<HTMLTemplateElement>("#fader-template");
const splitControl = requireElement<HTMLInputElement>("#split-control");
const splitValue = requireElement<HTMLOutputElement>("#split-value");
const splitRange = requireElement<HTMLElement>("#split-range");
const bpmNumber = requireElement<HTMLInputElement>("#bpm-number");
const bpmSlider = requireElement<HTMLInputElement>("#bpm-slider");
const clockRatioSelect = requireElement<HTMLSelectElement>("#clock-ratio");
const clockRatioSummary = requireElement<HTMLOutputElement>("#clock-ratio-summary");
const transportButton = requireElement<HTMLButtonElement>("#transport-toggle");

const minimumMidiNote = 36;
const maximumMidiNote = 72;
const initialPitchPattern = [60, 62, 64, 65, 67, 69, 71, 72, 67, 64] as const;
const noteNames = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;
const minimumStepCount = 8;
const maximumStepCount = 32;
const minimumBpm = 30;
const maximumBpm = 300;
const midiClocksPerQuarterNote = 24;
const schedulerLookaheadMs = 100;
const schedulerIntervalMs = 25;
const noteVelocity = 100;
const noteGateRatio = 0.8;
const availableClockRatios: readonly ClockRatio[] = [
	{ label: "1:1", first: 1, second: 1 },
	{ label: "1:2", first: 1, second: 2 },
	{ label: "1:4", first: 1, second: 4 },
	{ label: "2:3", first: 2, second: 3 },
	{ label: "5:7", first: 5, second: 7 },
	{ label: "7:11", first: 7, second: 11 },
];
const availableScales: readonly ScaleDefinition[] = [
	{ id: "major", label: "Major (Ionian)", intervals: [0, 2, 4, 5, 7, 9, 11] },
	{ id: "dorian", label: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
	{ id: "phrygian", label: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
	{ id: "lydian", label: "Lydian", intervals: [0, 2, 4, 6, 7, 9, 11] },
	{ id: "mixolydian", label: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
	{ id: "natural-minor", label: "Natural Minor (Aeolian)", intervals: [0, 2, 3, 5, 7, 8, 10] },
	{ id: "locrian", label: "Locrian", intervals: [0, 1, 3, 5, 6, 8, 10] },
	{ id: "minor-pentatonic", label: "Minor Pentatonic", intervals: [0, 3, 5, 7, 10] },
	{ id: "harmonic-minor", label: "Harmonic Minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
];
const defaultClockRatio = availableClockRatios[0] ?? {
	label: "1:1",
	first: 1,
	second: 1,
};
const defaultScale = availableScales[0] ?? {
	id: "major",
	label: "Major (Ionian)",
	intervals: [0, 2, 4, 5, 7, 9, 11],
};

let sequence: readonly SequencerStep[] = createInitialSequence(initialPitchPattern);
let splitPoint = 5;
let clockRatio = defaultClockRatio;
let rootPitchClass = 0;
let scale = defaultScale;
let midiAccess: MIDIAccess | null = null;
let selectedOutput: MIDIOutput | null = null;
let playbackOutput: MIDIOutput | null = null;
let playbackSchedulerId: number | null = null;
let nextClockTimestamp = 0;
let laneCursors: readonly LaneCursor[] = createLaneCursors(0);
let bpm = 120;

const stepViews: StepView[] = [];
const playheadTimerIds = new Set<number>();

function clampMidiNote(note: number): number {
	return Math.min(maximumMidiNote, Math.max(minimumMidiNote, Math.round(note)));
}

function createInitialSequence(pitches: readonly number[]): readonly SequencerStep[] {
	return pitches.map((note) => ({ note: clampMidiNote(note), state: "on" }));
}

function clampStepCount(value: number): number {
	return Math.min(maximumStepCount, Math.max(minimumStepCount, Math.round(value)));
}

function createDefaultStep(index: number, pitches: readonly number[]): SequencerStep {
	const note = pitches[index % pitches.length] ?? 60;
	return { note: clampMidiNote(note), state: "on" };
}

function resizeSequence(
	steps: readonly SequencerStep[],
	requestedStepCount: number,
	pitches: readonly number[],
): readonly SequencerStep[] {
	const stepCount = clampStepCount(requestedStepCount);
	return Array.from(
		{ length: stepCount },
		(_unused, index) => steps[index] ?? createDefaultStep(index, pitches),
	);
}

function updateStepPitch(
	steps: readonly SequencerStep[],
	stepIndex: number,
	note: number,
): readonly SequencerStep[] {
	return steps.map((step, index) =>
		index === stepIndex ? { ...step, note: clampMidiNote(note) } : step,
	);
}

function updateStepState(
	steps: readonly SequencerStep[],
	stepIndex: number,
	state: StepState,
): readonly SequencerStep[] {
	return steps.map((step, index) =>
		index === stepIndex ? { ...step, state } : step,
	);
}

function getNextStepState(state: StepState): StepState {
	if (state === "on") return "off";
	if (state === "off") return "skip";
	return "on";
}

function getStepStateLabel(state: StepState): string {
	if (state === "on") return "On";
	if (state === "off") return "Off";
	return "Skip";
}

function midiNoteToName(note: number): string {
	const normalizedNote = clampMidiNote(note);
	const name = noteNames[normalizedNote % noteNames.length] ?? "C";
	const octave = Math.floor(normalizedNote / 12) - 1;
	return `${name}${octave}`;
}

function positiveModulo(value: number, divisor: number): number {
	return ((value % divisor) + divisor) % divisor;
}

function getScale(id: string): ScaleDefinition {
	return availableScales.find((candidate) => candidate.id === id) ?? defaultScale;
}

function getPitchClassName(pitchClass: number): string {
	return noteNames[positiveModulo(Math.round(pitchClass), noteNames.length)] ?? "C";
}

function quantizeMidiNote(
	note: number,
	root: number,
	scaleDefinition: ScaleDefinition,
): number {
	const inputNote = clampMidiNote(note);
	let nearestNote = inputNote;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (let candidate = minimumMidiNote; candidate <= maximumMidiNote; candidate += 1) {
		const interval = positiveModulo(candidate - root, noteNames.length);
		if (!scaleDefinition.intervals.includes(interval)) continue;

		const distance = Math.abs(candidate - inputNote);
		if (distance < nearestDistance || (distance === nearestDistance && candidate < nearestNote)) {
			nearestNote = candidate;
			nearestDistance = distance;
		}
	}

	return nearestNote;
}

function quantizeSequence(
	steps: readonly SequencerStep[],
	root: number,
	scaleDefinition: ScaleDefinition,
): readonly SequencerStep[] {
	return steps.map((step) => ({
		...step,
		note: quantizeMidiNote(step.note, root, scaleDefinition),
	}));
}

function clampBpm(value: number): number {
	return Math.min(maximumBpm, Math.max(minimumBpm, Math.round(value)));
}

function clampSplitPoint(value: number, stepCount: number): number {
	return Math.min(stepCount, Math.max(0, Math.round(value)));
}

function getBeatDurationMs(bpmValue: number): number {
	return 60_000 / bpmValue;
}

function getClockIntervalMs(bpmValue: number): number {
	return getBeatDurationMs(bpmValue) / midiClocksPerQuarterNote;
}

function getClockRatio(label: string): ClockRatio {
	return availableClockRatios.find((ratio) => ratio.label === label) ?? defaultClockRatio;
}

function getSecondSequencerBpm(firstSequencerBpm: number, ratio: ClockRatio): number {
	return firstSequencerBpm * (ratio.second / ratio.first);
}

function getLaneStepDurationMs(
	laneId: LaneId,
	firstSequencerBpm: number,
	ratio: ClockRatio,
): number {
	const laneBpm =
		laneId === "a"
			? firstSequencerBpm
			: getSecondSequencerBpm(firstSequencerBpm, ratio);
	return getBeatDurationMs(laneBpm);
}

function formatBpm(bpmValue: number): string {
	return Number.isInteger(bpmValue) ? String(bpmValue) : bpmValue.toFixed(1);
}

function advanceStepIndex(index: number, stepCount: number): number {
	return (index + 1) % stepCount;
}

function createLaneDefinitions(
	stepCount: number,
	requestedSplitPoint: number,
): readonly LaneDefinition[] {
	const safeSplitPoint = clampSplitPoint(requestedSplitPoint, stepCount);
	return [
		{ id: "a", startIndex: 0, stepCount: safeSplitPoint },
		{ id: "b", startIndex: safeSplitPoint, stepCount: stepCount - safeSplitPoint },
	];
}

function createLaneCursors(startTimestamp: number): readonly LaneCursor[] {
	return [
		{ nextTimestamp: startTimestamp, nextIndex: 0 },
		{ nextTimestamp: startTimestamp, nextIndex: 0 },
	];
}

function getStepLocation(
	stepIndex: number,
	lanes: readonly LaneDefinition[],
): StepLocation | null {
	const lane = lanes.find(
		(candidate) =>
			stepIndex >= candidate.startIndex &&
			stepIndex < candidate.startIndex + candidate.stepCount,
	);
	if (!lane) return null;

	return {
		laneId: lane.id,
		laneStepNumber: stepIndex - lane.startIndex + 1,
	};
}

function describeSplit(requestedSplitPoint: number, stepCount: number): string {
	const safeSplitPoint = clampSplitPoint(requestedSplitPoint, stepCount);
	return `A ${safeSplitPoint} · B ${stepCount - safeSplitPoint}`;
}

function createClockSchedule(
	now: number,
	nextTimestamp: number,
	bpmValue: number,
	lookaheadMs: number,
): ClockSchedule {
	const timestamps: number[] = [];
	const scheduleUntil = now + lookaheadMs;
	const pulseInterval = getClockIntervalMs(bpmValue);
	let timestamp = Math.max(now, nextTimestamp);

	while (timestamp < scheduleUntil) {
		timestamps.push(timestamp);
		timestamp += pulseInterval;
	}

	return { timestamps, nextTimestamp: timestamp };
}

function findNextNonSkippedStep(
	steps: readonly SequencerStep[],
	lane: LaneDefinition,
	startingIndex: number,
): LaneStepSelection | null {
	if (lane.stepCount === 0) return null;

	let localIndex = startingIndex % lane.stepCount;
	for (let checkedSteps = 0; checkedSteps < lane.stepCount; checkedSteps += 1) {
		const globalIndex = lane.startIndex + localIndex;
		const step = steps[globalIndex];
		const nextIndex = advanceStepIndex(localIndex, lane.stepCount);
		if (!step) return null;

		if (step.state !== "skip") {
			return { step, globalIndex, localIndex, nextIndex };
		}
		localIndex = nextIndex;
	}

	return null;
}

function createLaneSchedule(
	now: number,
	cursor: LaneCursor,
	lane: LaneDefinition,
	stepDurationMs: number,
	steps: readonly SequencerStep[],
	lookaheadMs: number,
	gateRatio: number,
): StepSchedule {
	if (lane.stepCount === 0) {
		return {
			events: [],
			nextTimestamp: cursor.nextTimestamp,
			nextIndex: 0,
		};
	}

	const events: ScheduledStep[] = [];
	const scheduleUntil = now + lookaheadMs;
	let timestamp = Math.max(now, cursor.nextTimestamp);
	let localIndex = cursor.nextIndex % lane.stepCount;

	while (timestamp < scheduleUntil) {
		const selection = findNextNonSkippedStep(steps, lane, localIndex);
		if (!selection) break;

		events.push({
			...selection.step,
			index: selection.globalIndex,
			laneId: lane.id,
			laneStepNumber: selection.localIndex + 1,
			startTimestamp: timestamp,
			endTimestamp: timestamp + stepDurationMs * gateRatio,
		});
		timestamp += stepDurationMs;
		localIndex = selection.nextIndex;
	}

	return { events, nextTimestamp: timestamp, nextIndex: localIndex };
}

function buildControls(): void {
	clearPlayhead();
	verticalFaders.replaceChildren();
	verticalFaders.style.setProperty("--step-count", String(sequence.length));
	stepViews.length = 0;

	sequence.forEach((step, index) => {
		const fragment = faderTemplate.content.cloneNode(true) as DocumentFragment;
		const strip = requireChild<HTMLElement>(fragment, ".fader");
		const pitchSlider = requireChild<HTMLInputElement>(fragment, ".vertical-fader");
		const pitchOutput = requireChild<HTMLOutputElement>(fragment, "output");
		const noteLabel = requireChild<HTMLElement>(fragment, ".control-number");
		const name = requireChild<HTMLElement>(fragment, ".fader-name");
		const toggle = requireChild<HTMLButtonElement>(fragment, ".step-toggle");
		const toggleText = requireChild<HTMLSpanElement>(fragment, ".step-toggle span");

		pitchSlider.id = `step-pitch-${index + 1}`;
		pitchSlider.value = String(step.note);
		pitchSlider.setAttribute("aria-label", `Step ${index + 1} pitch`);
		pitchOutput.htmlFor = pitchSlider.id;

		const view = {
			strip,
			pitchSlider,
			pitchOutput,
			noteLabel,
			name,
			toggle,
			toggleText,
		};
		stepViews.push(view);

		pitchSlider.addEventListener("input", () => {
			sequence = updateStepPitch(sequence, index, Number(pitchSlider.value));
			renderStep(index);
			const updatedStep = sequence[index];
			if (updatedStep) {
				const quantizedNote = quantizeMidiNote(updatedStep.note, rootPitchClass, scale);
				describeMessage(
					`Step ${index + 1} · ${midiNoteToName(quantizedNote)} · MIDI ${quantizedNote}`,
				);
			}
		});

		toggle.addEventListener("click", () => {
			const currentStep = sequence[index];
			if (!currentStep) return;

			const nextState = getNextStepState(currentStep.state);
			sequence = updateStepState(sequence, index, nextState);
			renderStep(index);
			describeMessage(`Step ${index + 1} · ${getStepStateLabel(nextState)}`);
		});

		verticalFaders.append(fragment);
		renderStep(index);
	});
}

function renderStep(index: number): void {
	const step = sequence[index];
	const view = stepViews[index];
	if (!step || !view) return;

	const lanes = createLaneDefinitions(sequence.length, splitPoint);
	const location = getStepLocation(index, lanes);
	if (!location) return;
	const quantizedNote = quantizeMidiNote(step.note, rootPitchClass, scale);

	view.pitchSlider.value = String(step.note);
	view.pitchSlider.setAttribute("aria-valuetext", midiNoteToName(quantizedNote));
	view.pitchOutput.value = midiNoteToName(quantizedNote);
	view.noteLabel.textContent = `MIDI ${quantizedNote}`;
	view.name.textContent = `${location.laneId.toUpperCase()} · Step ${location.laneStepNumber}`;
	const nextState = getNextStepState(step.state);
	view.toggleText.textContent = getStepStateLabel(step.state);
	view.toggle.setAttribute(
		"aria-label",
		`Step ${index + 1} state: ${getStepStateLabel(step.state)}. Set to ${getStepStateLabel(nextState)}`,
	);
	view.toggle.classList.toggle("is-on", step.state === "on");
	view.toggle.classList.toggle("is-off", step.state === "off");
	view.toggle.classList.toggle("is-skip", step.state === "skip");
	view.strip.classList.toggle("is-enabled", step.state === "on");
	view.strip.classList.toggle("is-skipped", step.state === "skip");
	view.strip.classList.toggle("is-lane-a", location.laneId === "a");
	view.strip.classList.toggle("is-lane-b", location.laneId === "b");
}

function renderSequenceLayout(): void {
	sequence.forEach((_step, index) => renderStep(index));
	stepCountSelect.value = String(sequence.length);
	splitControl.max = String(sequence.length);
	splitControl.value = String(splitPoint);
	splitValue.value = describeSplit(splitPoint, sequence.length);
	splitRange.textContent = `0–${sequence.length} steps`;
	splitControl.setAttribute(
		"aria-valuetext",
		`Sequencer A has ${splitPoint} steps; Sequencer B has ${sequence.length - splitPoint} steps`,
	);
}

function renderClockSettings(): void {
	clockRatioSelect.value = clockRatio.label;
	const secondBpm = getSecondSequencerBpm(bpm, clockRatio);
	clockRatioSummary.value = `B ${formatBpm(secondBpm)} BPM`;
}

function renderPitchSettings(): void {
	rootNoteSelect.value = String(rootPitchClass);
	scaleSelect.value = scale.id;
}

function showLanePlayhead(laneId: LaneId, stepIndex: number): void {
	const laneClass = `is-lane-${laneId}`;
	stepViews.forEach((view, viewIndex) => {
		if (view.strip.classList.contains(laneClass)) {
			view.strip.classList.toggle("is-current", viewIndex === stepIndex);
		}
	});
}

function clearPlayhead(): void {
	for (const timerId of playheadTimerIds) window.clearTimeout(timerId);
	playheadTimerIds.clear();
	stepViews.forEach((view) => view.strip.classList.remove("is-current"));
}

function schedulePlayhead(event: ScheduledStep, channel: number): void {
	const delay = Math.max(0, event.startTimestamp - performance.now());
	const timerId = window.setTimeout(() => {
		playheadTimerIds.delete(timerId);
		if (playbackSchedulerId === null) return;

		showLanePlayhead(event.laneId, event.index);
		const laneName = event.laneId.toUpperCase();
		if (event.state === "on") {
			describeMessage(
				`CH ${channel + 1} · ${laneName}${event.laneStepNumber} · ${midiNoteToName(event.note)}`,
			);
		} else {
			describeMessage(`${laneName}${event.laneStepNumber} · Rest`);
		}
	}, delay);

	playheadTimerIds.add(timerId);
}

function getLaneChannelIndex(laneId: LaneId): number {
	const channelSelect = laneId === "a" ? channelASelect : channelBSelect;
	return Number(channelSelect.value) - 1;
}

function setStatus(
	message: string,
	state: "idle" | "connected" | "error" = "idle",
): void {
	statusText.textContent = message;
	statusLight.classList.toggle("is-connected", state === "connected");
	statusLight.classList.toggle("is-error", state === "error");
}

function describeMessage(message: string): void {
	lastMessage.value = message;
}

function clearScheduledMessages(output: MIDIOutput): void {
	const outputWithClear = output as MIDIOutput & { clear?: () => void };
	outputWithClear.clear?.call(output);
}

function sendAllNotesOff(output: MIDIOutput): void {
	for (let channel = 0; channel < 16; channel += 1) {
		output.send([0xb0 | channel, 123, 0]);
	}
}

function schedulePlayback(): void {
	if (playbackSchedulerId === null || !playbackOutput) return;

	const now = performance.now();
	const clockSchedule = createClockSchedule(
		now,
		nextClockTimestamp,
		bpm,
		schedulerLookaheadMs,
	);
	for (const timestamp of clockSchedule.timestamps) {
		playbackOutput.send([0xf8], timestamp);
	}
	nextClockTimestamp = clockSchedule.nextTimestamp;

	const lanes = createLaneDefinitions(sequence.length, splitPoint);
	const quantizedSequence = quantizeSequence(sequence, rootPitchClass, scale);
	const nextLaneCursors: LaneCursor[] = [];

	lanes.forEach((lane, laneIndex) => {
		const channel = getLaneChannelIndex(lane.id);
		const cursor = laneCursors[laneIndex] ?? {
			nextTimestamp: now,
			nextIndex: 0,
		};
		const stepSchedule = createLaneSchedule(
			now,
			cursor,
			lane,
			getLaneStepDurationMs(lane.id, bpm, clockRatio),
			quantizedSequence,
			schedulerLookaheadMs,
			noteGateRatio,
		);

		for (const event of stepSchedule.events) {
			schedulePlayhead(event, channel);
			if (event.state !== "on") continue;

			playbackOutput?.send(
				[0x90 | channel, event.note, noteVelocity],
				event.startTimestamp,
			);
			playbackOutput?.send([0x80 | channel, event.note, 0], event.endTimestamp);
		}

		nextLaneCursors.push({
			nextTimestamp: stepSchedule.nextTimestamp,
			nextIndex: stepSchedule.nextIndex,
		});
	});

	laneCursors = nextLaneCursors;
}

function updateTransportButton(isRunning: boolean): void {
	transportButton.textContent = isRunning ? "Stop sequencers" : "Start sequencers";
	transportButton.classList.toggle("is-running", isRunning);
	transportButton.setAttribute("aria-pressed", String(isRunning));
}

function startPlayback(): void {
	if (!selectedOutput || playbackSchedulerId !== null) return;

	playbackOutput = selectedOutput;
	const now = performance.now();
	nextClockTimestamp = now;
	laneCursors = createLaneCursors(now);
	playbackOutput.send([0xfa]);
	playbackSchedulerId = window.setInterval(schedulePlayback, schedulerIntervalMs);
	updateTransportButton(true);
	schedulePlayback();
	describeMessage(
		`MIDI Start · ${getPitchClassName(rootPitchClass)} ${scale.label} · A ${bpm} BPM · ${clockRatio.label} · ${describeSplit(splitPoint, sequence.length)}`,
	);
}

function stopPlayback(sendStop = true): void {
	if (playbackSchedulerId !== null) {
		window.clearInterval(playbackSchedulerId);
		playbackSchedulerId = null;
	}

	clearPlayhead();
	if (playbackOutput) {
		try {
			clearScheduledMessages(playbackOutput);
			if (playbackOutput.state === "connected") {
				sendAllNotesOff(playbackOutput);
				if (sendStop) playbackOutput.send([0xfc]);
			}
		} catch {
			// The port may have disappeared while playback was running.
		}
	}

	playbackOutput = null;
	updateTransportButton(false);
	if (sendStop) describeMessage("MIDI Stop");
}

function togglePlayback(): void {
	if (playbackSchedulerId === null) startPlayback();
	else stopPlayback();
}

function rebasePlaybackSchedule(message: string): void {
	if (playbackSchedulerId === null || !playbackOutput) return;

	clearScheduledMessages(playbackOutput);
	sendAllNotesOff(playbackOutput);
	clearPlayhead();
	const now = performance.now();
	nextClockTimestamp = now;
	laneCursors = createLaneCursors(now);
	schedulePlayback();
	describeMessage(message);
}

function setBpm(value: number): void {
	if (!Number.isFinite(value)) return;

	bpm = clampBpm(value);
	bpmNumber.value = String(bpm);
	bpmSlider.value = String(bpm);
	renderClockSettings();
	rebasePlaybackSchedule(`Tempo · ${bpm} BPM`);
}

function setClockRatio(label: string): void {
	clockRatio = getClockRatio(label);
	renderClockSettings();
	const secondBpm = getSecondSequencerBpm(bpm, clockRatio);
	const message = `Clock ratio · ${clockRatio.label} · B ${formatBpm(secondBpm)} BPM`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function setSplitPoint(value: number): void {
	if (!Number.isFinite(value)) return;

	splitPoint = clampSplitPoint(value, sequence.length);
	renderSequenceLayout();
	const message = `Sequence split · ${describeSplit(splitPoint, sequence.length)}`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function setStepCount(value: number): void {
	if (!Number.isFinite(value)) return;

	const nextStepCount = clampStepCount(value);
	if (nextStepCount === sequence.length) return;

	sequence = resizeSequence(sequence, nextStepCount, initialPitchPattern);
	splitPoint = clampSplitPoint(splitPoint, sequence.length);
	buildControls();
	renderSequenceLayout();
	const message = `Step count · ${sequence.length} · ${describeSplit(splitPoint, sequence.length)}`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function setRootPitchClass(value: number): void {
	if (!Number.isFinite(value)) return;

	rootPitchClass = positiveModulo(Math.round(value), noteNames.length);
	renderPitchSettings();
	renderSequenceLayout();
	const message = `Root · ${getPitchClassName(rootPitchClass)} · ${scale.label}`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function setScale(id: string): void {
	scale = getScale(id);
	renderPitchSettings();
	renderSequenceLayout();
	const message = `Scale · ${getPitchClassName(rootPitchClass)} ${scale.label}`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function applyLaneChannelChange(laneId: LaneId): void {
	const laneName = laneId.toUpperCase();
	const channel = getLaneChannelIndex(laneId) + 1;
	const message = `Synth ${laneName} · MIDI channel ${channel}`;
	if (playbackSchedulerId === null) describeMessage(message);
	else rebasePlaybackSchedule(message);
}

function refreshOutputList(): void {
	const previousSelection = outputSelect.value;
	const outputs = midiAccess ? Array.from(midiAccess.outputs.values()) : [];

	outputSelect.replaceChildren();
	if (outputs.length === 0) {
		stopPlayback(false);
		outputSelect.add(new Option("No MIDI outputs found", ""));
		outputSelect.disabled = true;
		transportButton.disabled = true;
		selectedOutput = null;
		setStatus("MIDI enabled, but no output devices were found.");
		return;
	}

	outputSelect.add(new Option("Choose an output…", ""));
	for (const output of outputs) {
		outputSelect.add(new Option(output.name ?? "Unnamed MIDI output", output.id));
	}

	outputSelect.disabled = false;
	const canRestore = outputs.some((output) => output.id === previousSelection);
	const outputId = canRestore ? previousSelection : (outputs[0]?.id ?? "");
	outputSelect.value = outputId;
	void selectOutput(outputId);
}

async function selectOutput(outputId: string): Promise<void> {
	const nextOutput = outputId && midiAccess ? (midiAccess.outputs.get(outputId) ?? null) : null;
	if (playbackSchedulerId !== null && playbackOutput !== nextOutput) stopPlayback();
	selectedOutput = nextOutput;

	if (!selectedOutput) {
		transportButton.disabled = true;
		setStatus("MIDI enabled. Choose an output device.");
		return;
	}

	try {
		await selectedOutput.open();
		transportButton.disabled = false;
		setStatus(`Sending to ${selectedOutput.name ?? "unnamed MIDI output"}.`, "connected");
	} catch (error: unknown) {
		stopPlayback(false);
		selectedOutput = null;
		transportButton.disabled = true;
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`Could not open that MIDI output: ${message}`, "error");
	}
}

async function enableMidi(): Promise<void> {
	if (!("requestMIDIAccess" in navigator)) {
		setStatus("This browser does not support Web MIDI. Try Chrome or Edge.", "error");
		connectButton.disabled = true;
		return;
	}

	connectButton.disabled = true;
	connectButton.textContent = "Requesting access…";

	try {
		midiAccess = await navigator.requestMIDIAccess({ sysex: false });
		midiAccess.addEventListener("statechange", refreshOutputList);
		refreshOutputList();
		connectButton.textContent = "MIDI enabled";
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		setStatus(`MIDI access was not granted: ${message}`, "error");
		connectButton.disabled = false;
		connectButton.textContent = "Try MIDI again";
	}
}

connectButton.addEventListener("click", () => void enableMidi());
outputSelect.addEventListener("change", () => void selectOutput(outputSelect.value));
channelASelect.addEventListener("change", () => {
	applyLaneChannelChange("a");
});
channelBSelect.addEventListener("change", () => {
	applyLaneChannelChange("b");
});
rootNoteSelect.addEventListener("change", () => {
	setRootPitchClass(Number(rootNoteSelect.value));
});
scaleSelect.addEventListener("change", () => setScale(scaleSelect.value));
stepCountSelect.addEventListener("change", () => {
	setStepCount(Number(stepCountSelect.value));
});
splitControl.addEventListener("input", () => setSplitPoint(Number(splitControl.value)));
bpmSlider.addEventListener("input", () => setBpm(Number(bpmSlider.value)));
clockRatioSelect.addEventListener("change", () => setClockRatio(clockRatioSelect.value));
bpmNumber.addEventListener("change", () => setBpm(Number(bpmNumber.value)));
bpmNumber.addEventListener("keydown", (event) => {
	if (event.key === "Enter") setBpm(Number(bpmNumber.value));
});
transportButton.addEventListener("click", togglePlayback);
window.addEventListener("beforeunload", () => stopPlayback(true));

stepCountSelect.replaceChildren();
for (let stepCount = minimumStepCount; stepCount <= maximumStepCount; stepCount += 1) {
	stepCountSelect.add(new Option(String(stepCount), String(stepCount)));
}
buildControls();
renderPitchSettings();
renderSequenceLayout();
renderClockSettings();
updateTransportButton(false);
