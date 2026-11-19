# Offline coordination dashboard

Open [index.html](index.html) directly in a browser and click **Run demo**. The simulated lead assigns a coverage review. The specialist automatically reports progress and returns the missing test identified in a fixed fixture. The lead receives the result. **Session activity** shows all three messages in order. **Stop session** prevents further messages from the current run.

This source-only prototype uses a fixed task, two in-memory role adapters, and a broker that admits three message types in order. It has no DOSAI runtime or service integration, provider access, storage, network listener, shell, or approval authority. The synthetic result is a fixture outcome. Existing native approval and builder gates apply to live use.

Run the focused tests using Node 24.18.0:

```sh
node --test tests/coordination/coordination-prototype.test.mjs
```
