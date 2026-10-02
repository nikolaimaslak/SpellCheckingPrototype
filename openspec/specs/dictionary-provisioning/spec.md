# dictionary-provisioning Specification

## Purpose

Defines how English and Arabic dictionaries reach the spelling engine, and the licensing guard that keeps the not-yet-cleared Arabic dictionary out of version control and out of distributable builds.

## Requirements

### Requirement: One setup command provisions dictionaries
A single npm script SHALL put the English and Arabic affix/dictionary pairs in the static asset folder the app serves. Running it again MUST be safe and leave the same result.

#### Scenario: First setup
- **WHEN** a developer runs `npm run fetch-dicts` on a fresh clone with network access
- **THEN** English and Arabic `.aff`/`.dic` pairs exist under the served dictionary folder

#### Scenario: Re-run is idempotent
- **WHEN** the script runs a second time
- **THEN** it finishes successfully, and the files match the first run byte for byte

### Requirement: English dictionary from a permissively licensed package
The English dictionary SHALL come from a locked npm dependency with a permissive license (MIT AND BSD). It MAY be committed.

#### Scenario: Offline English
- **WHEN** the script runs without network access after `npm install`
- **THEN** the English dictionary is still provisioned, and the script reports that Arabic was skipped

### Requirement: Arabic dictionary pinned and kept out of git
The Arabic dictionary SHALL be downloaded from a pinned upstream commit, and its content hash MUST be checked. It MUST be stored in a gitignored location, and a download whose hash does not match MUST be rejected.

#### Scenario: Not tracked by git
- **WHEN** the Arabic files have been provisioned
- **THEN** `git status` does not list them as untracked or changed

#### Scenario: Hash mismatch
- **WHEN** the downloaded Arabic files do not match the pinned hash
- **THEN** the script fails with a message naming the file, and leaves no partial Arabic files in place

### Requirement: Distributable builds exclude Arabic by default
A production build SHALL leave out the Arabic dictionary unless the build is explicitly told to include it. Including it MUST print a warning that the license is not yet cleared.

#### Scenario: Default production build
- **WHEN** `npm run build` runs with no extra flags
- **THEN** the build output contains no Arabic dictionary files

#### Scenario: Explicit opt-in
- **WHEN** the build runs with the Arabic opt-in set
- **THEN** the Arabic files are included and the build prints a license warning

### Requirement: Dictionary licenses are listed
The repository SHALL hold a manifest listing each dictionary: its source, pinned version or commit, license, and whether it may be redistributed.

#### Scenario: Manifest lists both languages
- **WHEN** a reviewer opens the dictionary manifest
- **THEN** it has entries for English (redistributable: yes) and Arabic (redistributable: pending legal review)
