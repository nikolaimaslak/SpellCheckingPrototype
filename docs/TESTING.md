# Tester guide: composer assistance prototype

This prototype adds four kinds of help to a chat and an email composer, in **Arabic and English**:
- **spell checking** (underlines and suggestions);
- **auto-correct** of clear typos;
- **inline completion** (grey suggested text, accepted with Tab);
- a **grammar polish** button.

Thank you for testing it. Each scenario below tells you what to type and what you should see. If something differs, please report it (see [Reporting a problem](#reporting-a-problem)).

> **Use made-up text only.** All customer conversations, canned responses and knowledge-base content in the demo are synthetic. Never type real customer data, especially when the yellow Google banner is shown.

## 1. Setup

**Requirements:**
- Node.js **23.6 or newer** (check with `node --version`) and npm.
- A supported browser: current **Chrome** or **Edge** (recommended), **Safari 17.2+**, or **Firefox 140+**.

**Start:**

```sh
npm install
npm run demo
```

Open **http://localhost:5173/** (printed in the terminal). Stop with **Ctrl+C**.

**Optional: live completion and polish.** Copy `.env.example` to `.env` and put a Gemini API key in `GEMINI_API_KEY`. Without a key, completion and polish use an **offline test model** that returns canned results. Spell checking and auto-correct always run entirely in your browser and never need a key.

## 2. What the page shows

- **Banner at the top**, saying which model completion and polish use:
  - **Yellow, "… (Google)":** a live model. Text you type in a composer may be sent to Google.
  - **"Offline test model":** canned results; nothing leaves your machine.
  - **"Unavailable":** the completion server isn't running. Spelling still works.
- **Spelling engine line:** English and Arabic dictionaries loading, with timings.
- **Settings panel** (stands in for the administrator's and agent's settings): presets, mode, languages, custom dictionary, completion and polish options, and the current agent's user and team. Press **Apply** after editing fields by hand; the preset buttons apply immediately.
- **Chat composer** (Enter sends, Shift+Enter starts a new line) with customer-simulation controls, and an **email composer** with formatting buttons.
- **Footer:** the **version stamp**, for example `v0.1.0 · 3abdde6`. Include it in every report.

If something gets into a strange state, press **Reset demo settings**, or reload the page.

## 3. Scenarios

Type in the **chat** composer unless a step says otherwise. A trailing space in an input (shown as `␣`) matters: type it.

### T1. Spell checking (preset **Spell check only**)

| # | Do | Expected |
|---|---|---|
| T1.1 | Type `I will recieve it␣` | Only "recieve" gets a red wavy underline. |
| T1.2 | Click "recieve" | A small menu opens next to it with suggestions ("receive" first) and **Ignore**. |
| T1.3 | Choose "receive", then press Ctrl+Z (Cmd+Z on Mac) once | The word becomes "receive"; the undo brings back "recieve". |
| T1.4 | Put the caret inside "recieve" and press **Ctrl+.**, then use the arrow keys, Enter, and Escape | The menu opens from the keyboard; Enter picks; Escape closes without changes. |
| T1.5 | Type `اذا كان الطلب␣` | Only "اذا" is underlined. Its menu reads right to left and offers "إذا". |
| T1.6 | Type `رقم الطلب في نظام GOSSI هو␣` | Only "GOSSI" is underlined (each word is checked in its own language). |
| T1.7 | Type `مَرْحَبًا مرحـــبا␣` | Nothing is underlined (vowel marks and stretched letters are fine). |
| T1.8 | Type `see https://example.org or mail info@example.org, case CS-104233, Dear $(user.firstName)␣` | Nothing in the link, email, reference number or placeholder is underlined. |
| T1.9 | Click an underlined word and choose **Ignore** | That word stops being underlined everywhere, and isn't flagged again. |
| T1.10 | Type `recie` and stop with the caret right after it | Not underlined while you're still typing it. |

### T2. Auto-correct (preset **Auto-correct**)

A fix happens **when you type the space or punctuation right after the word**. The corrected word flashes briefly. After `.` `@` `:` or `/` the fix waits until your next space or line break, so nothing inside an email address or link is ever changed.

| # | Type | Expected |
|---|---|---|
| T2.1 | `please seperate␣` | becomes "please separate" |
| T2.2 | `paymnet␣` · `freind␣` · `goverment␣` | "payment" · "friend" · "government" |
| T2.3 | `Seperate␣` at the start | "Separate" (capital kept) |
| T2.4 | `teh␣` · `Teh␣` | "the" · "The" (a known common misspelling, fixed even though it's short) |
| T2.5 | `اذا كان` (the space after "اذا" triggers it) · `سنرسل الرد الى بريدك␣` | "إذا كان" · "الى" becomes "إلى" (known misspellings) |
| T2.6 | `المستخذم␣` · `حتىى␣` | "المستخدم" · "حتى" |
| T2.7 | `oNly␣` · `thiS␣` | "only" · "this" (only the stray capital is fixed, never "oily" or "thin") |
| T2.8 | `please seperate.␣` | Still "seperate." right after the full stop; "separate." once you type the space |

**Must not change (only underlined):**

| # | Type | Why |
|---|---|---|
| T2.9 | `afte␣` | Ambiguous: after, aft, ate, fate and ante are all one typo away |
| T2.10 | `tge␣` | Too short to auto-correct safely, and not a known misspelling |
| T2.11 | `GOSSI␣` · `TEH␣` | All capitals (codes and names are left alone) |
| T2.12 | `ان␣` | Ambiguous in Arabic: both "أن" and "إن" are words |
| T2.13 | `النضام␣` | Ambiguous in Arabic: several Arabic words are one typo away. Its menu offers "النظام". |
| T2.14 | `email info@gosi.gov.sa␣` · `visit https://www.gosi.gov.sa/en␣` | Nothing in the address changes at any moment while you type it (watch "gosi" and "https") |
| T2.20 | `Dear Ms. Fatimah,␣` · `Dear Mr. Al-Harbi,␣` | Names in mid-sentence (a capital letter not at the start of a sentence) are never changed. They may be underlined. |
| T2.21 | In the customer box, send `Hello, this is Noura`. Then type `Noura, thank you␣` in the chat composer | "Noura" is not changed, even at the start of a sentence, because the customer wrote it. Without that customer message it would become "Nora". |

**When it must not fire:**

| # | Do | Expected |
|---|---|---|
| T2.15 | In chat, type `please seperate` (or `please seperate.`) and press **Enter** immediately | The message is sent exactly as typed ("seperate"). Nothing is ever changed as it's sent. |
| T2.16 | Type `please seperate`, then press **Shift+Enter** | Corrected to "separate" (a new line counts as finishing the word). |
| T2.17 | Paste `please seperate them` from elsewhere | Not corrected; "seperate" is only underlined. |

**Auto-replace confidence (admin setting):**

| # | Do | Expected |
|---|---|---|
| T2.18 | In the settings, set **Auto-replace confidence** to "Misspellings list only" and apply. Type `teh paymnet␣` | "the paymnet": only the known misspelling is fixed, and "paymnet" is underlined. The effective-settings line reads "Auto-replace known misspellings and suggest", and the choice survives a reload. Set it back with **Auto-correct**. |
| T2.19 | With the preset **Spell check only**, type `teh␣` and click it | Not changed; its menu offers "the" first. |

### T3. Reverting an auto-correction (preset **Auto-correct**)

| # | Do | Expected |
|---|---|---|
| T3.1 | Type `please seperate␣`, then press Ctrl+Z once | "seperate" comes back. Typing `seperate␣` again isn't corrected. |
| T3.2 | Type `رقم المستخذم␣`, then click the corrected "المستخدم" | The menu offers only **Revert to المستخذم** (right to left). Choosing it restores the word, and it isn't corrected or underlined again. |
| T3.3 | Look at the counter under the settings | "Auto-corrected" and "Reverted" counts went up. |
| T3.4 | Type `please seperate␣` (it becomes "separate"), then press **Backspace** right away | "seperate" comes back; the space stays and the caret stays after it. Typing `seperate␣` again isn't corrected. |
| T3.5 | Type `رقم المستخذم␣`, then press **Backspace** right away | "المستخذم" comes back. |
| T3.6 | Type `please seperate␣`, type `x`, press Backspace twice | The first Backspace deletes "x", the second deletes the space: a normal Backspace, because it wasn't the next key after the correction. "separate" stays. |

### T4. Inline completion (preset **Everything on**)

| # | Do | Expected |
|---|---|---|
| T4.1 | Click **Next customer message** (English scenario) | A customer question appears in the chat history. |
| T4.2 | Type `Thank you for contacting us, your request` and pause about a second | Grey text appears right after the caret, continuing your sentence (for example "…has been received and will be processed within 3 working days…"). |
| T4.3 | Press **Tab** | The grey text is inserted. One Ctrl+Z removes it again. |
| T4.4 | Pause again to get a suggestion, then type its first few letters | The suggestion stays, minus what you typed. A different letter makes it disappear. |
| T4.5 | With a suggestion showing, press **Escape** | The suggestion disappears; your text is unchanged. |
| T4.6 | With a suggestion showing, press **Enter** | The message is sent **without** the grey text. |
| T4.7 | Switch the scenario to Arabic, click **Next customer message**, type `شكراً لتواصلك معنا، تم استلام طلبك` and pause | An Arabic suggestion appears to the left of the caret, continuing right to left. |
| T4.8 | Tick **Agent Desktop fidelity** and repeat T4.7 | The Arabic suggestion appears on the line **below**, starting at the left edge. This mimics Agent Desktop's left-to-right composer; see the limitations. |
| T4.9 | Get an English suggestion (as in T4.2) and press **Right Arrow** | The whole suggestion is inserted, as with Tab. |
| T4.10 | Get an English suggestion and press **Ctrl+Right Arrow** twice (**Option+Right Arrow** on a Mac) | The next two words are inserted one at a time; the rest of the grey text stays. One Ctrl+Z removes only the last word. |
| T4.11 | Get an English suggestion and press **Left Arrow** | The suggestion disappears and the caret moves left as usual. |
| T4.12 | Get an Arabic suggestion (as in T4.7) and press **Left Arrow**; get another and press **Ctrl+Left Arrow** (Option+Left on a Mac) | Left Arrow inserts the whole Arabic suggestion; Ctrl+Left inserts its first word only. Right Arrow would dismiss it instead. |
| T4.13 | Repeat T4.12 with **Agent Desktop fidelity** ticked | Same result, although the suggestion is shown on the line below. |

With the offline test model, the suggestions are canned and may not fit perfectly. With Gemini they vary, but should always be a single sentence in the language you're typing.

### T5. Knowledge-base grounding (preset **Everything on**)

| # | Do | Expected |
|---|---|---|
| T5.1 | In **Customer says**, send `Am I eligible for early retirement? I have 26 years of contributions.` Untick **Canned responses** under Completion context and press Apply (this isolates the knowledge base). Then type `Early retirement is` and pause | The suggestion uses the synthetic knowledge base, mentioning **25 years of contributions**. |
| T5.2 | Send a greeting as the customer (`Hello, good morning`), then type a sentence of 3+ words and pause | No knowledge-base facts appear (greetings don't pull in articles). |

### T6. Grammar polish (preset **Everything on**)

| # | Do | Expected |
|---|---|---|
| T6.1 | In chat, type `He go to the office yesterday and buyed a pen.` and press **Polish** (next to the composer) | A preview shows "go" and "buyed" struck through, and "went" and "bought" highlighted. |
| T6.2 | Press **Accept**, then Ctrl+Z once | The text becomes "He went … bought a pen."; the single undo restores your draft. |
| T6.3 | In the **email** composer, type `He go to the office yesterday and buyed a pen.`, select "the office" and press **B**, then press Polish and Accept | The fixes are applied and "the office" stays bold. A **Revert polish** button appears for about 10 seconds; it restores the original words. |
| T6.4 | Type `تم استلام هذه الطلب وسيتم معالجته.` and press Polish | The preview reads right to left, with "هذه" replaced by "هذا". |
| T6.5 | Type `Your request has been received.` and press Polish | "No changes suggested", with only a Close button. |
| T6.6 | Press Polish, then type something in the composer before pressing Accept | Accept is refused with "Polish again"; your typing is kept. |
| T6.7 | With the preview open, press **Escape** | The preview closes; your draft is unchanged. |

### T7. Administrator and agent settings

| # | Do | Expected |
|---|---|---|
| T7.1 | Set Inline completion to **Listed teams and users**, Teams `Pensions`, Current team `Pensions`, and Apply. Then change Current team to `Registration` and Apply | The "Effective" line shows completion **on**, then **off**, and grey suggestions stop appearing. |
| T7.2 | With completion on, untick **Use inline completion** (agent) and Apply | Completion turns off for this agent. |
| T7.3 | Untick **Agents may choose a less aggressive mode** | The agent controls become disabled, and the effective settings follow the administrator's. |
| T7.4 | Add `GOSI` to the Custom dictionary and Apply, then type `GOSI GOSSI␣` | "GOSI" is not underlined; "GOSSI" is, and its menu suggests "GOSI". |

### T8. Usage summary

| # | Do | Expected |
|---|---|---|
| T8.1 | After some of the scenarios, wait about 5 seconds and open **Telemetry summary** (link under the settings) | A page shows completion and polish acceptance rates, latency, and the auto-correct revert rate. It records counts and timings only: no typed text, suggestions or drafts. |

## 4. Known limitations (not bugs)

- **Short or ambiguous typos aren't auto-corrected** (T2.9–T2.13). Auto-correct only fixes a word when it's a known common misspelling, when exactly one dictionary word is one typo away, or when only a capital letter is wrong. This avoids wrong changes. The other typos are still underlined with suggestions.
- **Many Arabic typos are only underlined, not auto-corrected** (T2.12, T2.13). Arabic words often have several dictionary words one typo away, because of prefixes and suffixes. Common slips such as "اذا" → "إذا" are fixed through the curated list. For the others, pick the fix from the menu.
- **British spellings are corrected to American ones** in auto mode ("labour" → "labor", "cancelled" → "canceled"), because the English dictionary is en-US. Whether to use en-GB is an open question.
- **The misspellings lists are drafts** awaiting human review (known issue KI-5). If you see a word changed that shouldn't have been, please report it with the exact word.
- **Arabic in a left-to-right composer:** Agent Desktop's chat composer is left to right, so Arabic suggestions appear on the line below (T4.8). This follows from that composer's layout.
- **Completion and polish take about half a second to a second** with the live model.
- **All data is synthetic:** customer messages, canned responses and knowledge-base articles were written for this demo. They are **not** real policies or figures.
- **Desktop browsers only;** mobile isn't supported.

## 5. Reporting a problem

Use [`docs/TEST-REPORT-TEMPLATE.md`](TEST-REPORT-TEMPLATE.md), one problem per report, and send it to the person who shared the prototype with you (or open a GitHub issue with the "Test report" template if you have access). Please always include:
- the **version stamp** from the footer;
- the **banner** text (which model was active);
- your **browser and version**;
- the **scenario number** (for example T2.11);
- the **exact text** you typed, plus expected vs. actual result.

A screenshot helps; make sure it shows no real data. Optionally, if asked, the local usage log in `telemetry/events.jsonl` can be shared. It contains no typed text.
