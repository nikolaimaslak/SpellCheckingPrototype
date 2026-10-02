# hunspell-wasm-build Specification

## Purpose

Produces the spelling engine as a WebAssembly module, built reproducibly from a pinned upstream Hunspell release under its MPL 1.1 license option, so browser workers and Node tests both run the same engine.

## Requirements

### Requirement: Reproducible build from pinned versions
The build SHALL compile the spelling engine from one pinned upstream Hunspell tag, using one pinned compiler toolchain image. It MUST NOT use a floating `latest` tag or a branch head for either.

#### Scenario: Rebuild produces the same provenance
- **WHEN** a developer runs the WASM build twice on a clean checkout
- **THEN** both runs use the same upstream tag and toolchain version
- **AND** the recorded provenance (upstream tag, upstream commit, toolchain version, output file hashes) is identical

#### Scenario: Pins are visible
- **WHEN** a reviewer opens the build script
- **THEN** the upstream tag and the toolchain image tag appear as named constants at the top of the file

### Requirement: Committed build output
The generated engine module (WASM binary plus its JavaScript loader) and its provenance record SHALL be committed, so the project installs, runs and tests without Docker.

#### Scenario: Fresh clone without Docker
- **WHEN** a developer clones the repository, runs `npm install`, and has no Docker
- **THEN** `npm test` and `npm run dev` work using the committed engine module

### Requirement: Minimal engine surface
The module SHALL expose only these operations: create an engine from an affix file and a dictionary file, check a word, list suggestions for a word, add a word at runtime, and destroy an engine. All strings crossing the boundary MUST be UTF-8, so Arabic and English words round-trip unchanged.

#### Scenario: English word check
- **WHEN** an engine is created with the English dictionary
- **THEN** checking "receive" returns correct, and checking "recieve" returns incorrect with "receive" among the suggestions

#### Scenario: Arabic word round-trips
- **WHEN** an engine is created with the Arabic dictionary and asked about "مرحبا"
- **THEN** the call returns a result without encoding errors, and any suggestions come back as valid Arabic strings

#### Scenario: Runtime-added word
- **WHEN** the word "GOSI" is added to an English engine
- **THEN** checking "GOSI" returns correct for the rest of that engine's lifetime

### Requirement: Runs in browser workers and in Node
The same committed module SHALL load inside a browser Web Worker served by the dev server, and inside Node for automated tests.

#### Scenario: Node test loads the module
- **WHEN** the test suite runs in Node
- **THEN** it creates an English engine from files on disk and completes a spell check

### Requirement: License election recorded
The build SHALL record in the repository that Hunspell is used under its MPL 1.1 option. No GPL- or LGPL-only source MAY be compiled into the module.

#### Scenario: License notice present
- **WHEN** a reviewer inspects the engine output folder
- **THEN** it contains a notice naming Hunspell, the pinned tag, and the MPL 1.1 election
