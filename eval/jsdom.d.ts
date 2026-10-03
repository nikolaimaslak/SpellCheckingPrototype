// The one part of jsdom the eval pipeline uses (avoids a @types dependency).
declare module 'jsdom' {
  export class JSDOM {
    constructor(html?: string);
    readonly window: Window & typeof globalThis;
  }
}
