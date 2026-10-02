import createHunspellModule, { type HunspellModuleOptions } from './wasm/hunspell.mjs';

/** One Hunspell instance bound to a single language's .aff/.dic pair. */
export interface SpellEngine {
  spell(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): void;
  destroy(): void;
}

/** A loaded WASM module that can create any number of engines. */
export interface HunspellRuntime {
  createEngine(aff: Uint8Array, dic: Uint8Array): SpellEngine;
}

export async function loadHunspell(options: HunspellModuleOptions = {}): Promise<HunspellRuntime> {
  const mod = await createHunspellModule(options);
  const create = mod.cwrap('hs_create', 'number', ['string', 'string']);
  const spell = mod.cwrap('hs_spell', 'number', ['number', 'string']);
  const suggest = mod.cwrap('hs_suggest', 'number', ['number', 'string']);
  const add = mod.cwrap('hs_add', 'number', ['number', 'string']);
  const freeStr = mod.cwrap('hs_free_str', null, ['number']);
  const destroy = mod.cwrap('hs_destroy', null, ['number']);
  let nextId = 0;

  return {
    createEngine(aff, dic) {
      // Hunspell reads both files during construction, so they can be
      // removed from MEMFS right after to release the memory.
      const dir = `/dict/${nextId++}`;
      mod.FS.mkdirTree(dir);
      mod.FS.writeFile(`${dir}/d.aff`, aff);
      mod.FS.writeFile(`${dir}/d.dic`, dic);
      let handle = create(`${dir}/d.aff`, `${dir}/d.dic`);
      mod.FS.unlink(`${dir}/d.aff`);
      mod.FS.unlink(`${dir}/d.dic`);

      const live = () => {
        if (!handle) throw new Error('SpellEngine used after destroy()');
        return handle;
      };

      return {
        spell: (word) => spell(live(), word) === 1,
        suggest: (word) => {
          const ptr = suggest(live(), word);
          try {
            const joined = mod.UTF8ToString(ptr);
            return joined ? joined.split('\n') : [];
          } finally {
            freeStr(ptr);
          }
        },
        add: (word) => {
          add(live(), word);
        },
        destroy: () => {
          if (handle) destroy(handle);
          handle = 0;
        },
      };
    },
  };
}
