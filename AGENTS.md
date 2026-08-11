# counterpoint Development Guidelines

## Prefer pure functions

- Implement calculations, validation, mapping, and state transformations as
  pure functions whenever reasonably practical.
- Prefer explicit inputs and return values over hidden dependencies, shared
  mutable state, or functions that both calculate a value and cause an effect.
- Keep pure functions small, deterministic, and straightforward to test.
- Isolate unavoidable side effects—DOM updates, Web MIDI calls, timers,
  storage, and browser APIs—at clearly named boundaries.
- Pass dependencies into effectful code when doing so improves clarity or
  testability.
- Purity is a strong preference, not an absolute rule. Do not introduce
  excessive abstraction when a small, localized side effect is clearer.

## Verification

- Run `npm run check` after TypeScript changes.
- Run `npm run build` before handing off a completed change.
