# dictionary-provisioning Specification

## Purpose

Defines how the English and Arabic dictionaries reach the spelling engine offline, from pinned, verified, redistributable sources.

## Requirements

### Requirement: One setup command provisions dictionaries
A single npm script SHALL put the English and Arabic affix/dictionary pairs in the static asset folder the app serves, using only files already in the repository or installed by `npm install`. It MUST work offline. Running it again MUST be safe and leave the same result.

#### Scenario: First setup
- **WHEN** a developer runs `npm run fetch-dicts` on a fresh clone after `npm install`, with or without network access
- **THEN** English and Arabic `.aff`/`.dic` pairs exist under the served dictionary folder

#### Scenario: Re-run is idempotent
- **WHEN** the script runs a second time
- **THEN** it finishes successfully, and the files match the first run byte for byte

### Requirement: English dictionary from a permissively licensed package
The English dictionary SHALL come from a locked npm dependency with a permissive license (MIT AND BSD). It MAY be committed.

#### Scenario: Offline English
- **WHEN** the script runs without network access after `npm install`
- **THEN** the English dictionary is provisioned

### Requirement: Dictionary licenses are listed
The repository SHALL hold a manifest listing each dictionary: its source, pinned version or commit, content hash, license (including which option is elected for multi-licensed dictionaries), and whether it may be redistributed.

#### Scenario: Manifest lists both languages
- **WHEN** a reviewer opens the dictionary manifest
- **THEN** it has entries for English (MIT AND BSD, redistributable: yes) and Arabic (GPL-2+ / LGPL-2.1+ / MPL-1.1 with MPL 1.1 elected, redistributable: yes)

### Requirement: Arabic dictionary vendored under MPL 1.1
The Arabic (AyaSpell) dictionary SHALL be committed to the repository from the pinned upstream commit, with a license notice stating the MPL 1.1 election and the upstream source. Provisioning MUST verify the committed files against their pinned sha256 hashes, and MUST fail, naming the file, on a mismatch.

#### Scenario: Notice present
- **WHEN** a reviewer opens the vendored Arabic dictionary folder
- **THEN** it contains the `.aff`/`.dic` pair and a notice naming AyaSpell, the upstream commit, the tri-license and the MPL 1.1 election

#### Scenario: Tampered file
- **WHEN** a committed Arabic file no longer matches its pinned hash
- **THEN** provisioning fails with a message naming the file, and does not copy it into the served folder

### Requirement: Builds include both dictionaries
A production build SHALL include the English and Arabic dictionaries with no extra flags.

#### Scenario: Default production build
- **WHEN** `npm run build` runs
- **THEN** the build output contains both dictionary pairs
