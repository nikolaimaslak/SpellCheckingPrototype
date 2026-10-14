# Tester guide: composer assistance prototype

This prototype adds four kinds of help to one message field, in **Arabic and English**:
- **spell checking** (underlines and suggestions);
- **auto-correct** of clear typos;
- **inline completion** (grey suggested text, accepted with Tab);
- a **grammar polish** button.

Thank you for testing it. Each scenario below tells you what to type and what you should see. If something differs, please report it (see [Reporting a problem](#5-reporting-a-problem)).

> **Use made-up text only.** All customer conversations, canned responses and knowledge-base content in the demo are synthetic. Never type real customer data, especially with a live model.

## 1. Setup

**Requirements:**
- Node.js **23.6 or newer** (check with `node --version`) and npm.
- **uv** (check with `uv --version`), which runs the completion server and installs its Python by itself. Install it once with `curl -LsSf https://astral.sh/uv/install.sh | sh` (macOS: `brew install uv`; Windows: `winget install astral-sh.uv`). The first `npm run demo` downloads Python and the server's packages, so it needs a network connection and takes a minute.
- A supported browser: current **Chrome** or **Edge** (recommended), **Safari 17.2+**, or **Firefox 140+**.

**Start:**

```sh
npm install
npm run demo
```

Open **http://localhost:5173/** (printed in the terminal, with the active model). Stop with **Ctrl+C**.

**Optional: live completion and polish.** Copy `.env.example` to `.env` and put a Gemini API key in `GEMINI_API_KEY`. Without a key, completion and polish use an **offline test model** that returns canned results. Spell checking and auto-correct always run entirely in your browser and never need a key.

## 2. What the page shows

- **Settings** (left), saved in your browser; **Reset** puts the defaults back:
  - **Spelling:** spell check on or off, auto-correct on or off, the auto-correct confidence, the languages (with how long each dictionary took to load), the custom dictionary.
  - **Completion:** on or off.
  - **Sources:** **Conversation** (`Customer:` / `Agent:` lines; a scenario picker with **Next customer message** adds the next customer line), **Canned responses** (one per line) and **Knowledge base** (`Title: text` per line). An empty field turns that source off. The note under each field says how it is used.
- **The message field:** Enter adds your message to Conversation as an `Agent:` line and clears the field; Shift+Enter starts a new line. Under it, the **Polish** button.
- **Events** (bottom): every event as one line of JSON, for example `{"type":"autocorrect","lang":"en","original":"teh","replacement":"the"}`, the completion requests and replies (with the model's name), and polish.

If something gets into a strange state, press **Reset**, or reload the page.

## 3. Scenarios

Start each section with **Reset** unless it says otherwise. A trailing space in an input (shown as `␣`) matters: type it.

### T1. Spell checking (untick **Auto-correct**)

| # | Do | Expected |
|---|---|---|
| T1.1 | Type `I will recieve it␣` | Only "recieve" gets a red wavy underline. A `flag` event appears. |
| T1.2 | Click "recieve" | A small menu opens next to it with suggestions ("receive" first) and **Ignore**. |
| T1.3 | Choose "receive", then press Ctrl+Z (Cmd+Z on Mac) once | The word becomes "receive"; the undo brings back "recieve". |
| T1.4 | Put the caret inside "recieve" and press **Ctrl+.**, then use the arrow keys, Enter, and Escape | The menu opens from the keyboard; Enter picks; Escape closes without changes. |
| T1.5 | Type `اذا كان الطلب␣` | Only "اذا" is underlined. Its menu reads right to left and offers "إذا". |
| T1.6 | Type `رقم الطلب في نظام GOSSI هو␣` | Only "GOSSI" is underlined (each word is checked in its own language). |
| T1.7 | Type `مَرْحَبًا مرحـــبا␣` | Nothing is underlined (vowel marks and stretched letters are fine). |
| T1.8 | Type `see https://example.org or mail info@example.org, case CS-104233, Dear $(user.firstName)␣` | Nothing in the link, email, reference number or placeholder is underlined. |
| T1.9 | Click an underlined word and choose **Ignore** | That word stops being underlined everywhere, and isn't flagged again until a setting changes or the page reloads. |
| T1.10 | Type `recie` and stop with the caret right after it | Not underlined while you're still typing it. |
| T1.11 | Add `GOSI` to the Custom dictionary, then type `GOSI GOSSI␣` | "GOSI" is not underlined; "GOSSI" is, and its menu suggests "GOSI". |

### T2. Auto-correct (defaults)

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
| T2.15 | `Dear Ms. Fatimah,␣` · `Dear Mr. Al-Harbi,␣` | Names in mid-sentence (a capital letter not at the start of a sentence) are never changed. They may be underlined. |
| T2.16 | Add the line `Customer: Hello, this is Noura` to Conversation. Then type `Noura, thank you␣` | "Noura" is not changed, even at the start of a sentence, because the customer wrote it. Without that line it would become "Nora". |

**When it must not fire:**

| # | Do | Expected |
|---|---|---|
| T2.17 | Type `please seperate` and press **Enter** immediately | The message goes to Conversation exactly as typed ("seperate"). Nothing is changed as it's sent. |
| T2.18 | Type `please seperate`, then press **Shift+Enter** | Corrected to "separate" (a new line counts as finishing the word). |
| T2.19 | Paste `please seperate them` from elsewhere | Not corrected; "seperate" is only underlined. |

**Auto-correct confidence:**

| # | Do | Expected |
|---|---|---|
| T2.20 | Choose **Known misspellings list only**. Type `teh paymnet␣` | "the paymnet": only the known misspelling is fixed, and "paymnet" is underlined. The choice survives a reload. |
| T2.21 | Untick **Auto-correct**, type `teh␣` and click it | Not changed; its menu offers "the" first. |

### T3. Reverting an auto-correction (defaults)

| # | Do | Expected |
|---|---|---|
| T3.1 | Type `please seperate␣`, then press Ctrl+Z (Cmd+Z) until "seperate" comes back | "seperate" comes back, and a `revert` event appears. Typing `seperate␣` again isn't corrected. |
| T3.2 | Type `رقم المستخذم␣`, then click the corrected "المستخدم" | The menu offers only **Revert to المستخذم** (right to left). Choosing it restores the word, and it isn't corrected or underlined again. |
| T3.3 | Type `please seperate␣` (it becomes "separate"), then press **Backspace** | A normal Backspace: the space is deleted, "separate" stays. Only Ctrl/Cmd+Z and the menu revert. |

### T4. Inline completion (defaults)

The default Conversation already has the first English customer message.

| # | Do | Expected |
|---|---|---|
| T4.1 | Click **Next customer message** | A second `Customer:` line about contribution records is added to Conversation. |
| T4.2 | Type `Thank you for waiting, your contribution records` and pause about a second | Grey text appears right after the caret, continuing your sentence (for example "…are up to date, and the latest payment has been registered on your account."). The events show `complete-request` and `complete-reply`. |
| T4.3 | Press **Tab** | The grey text is inserted. One Ctrl+Z removes it again. |
| T4.4 | Pause again to get a suggestion, then type its first few letters | The suggestion stays, minus what you typed. A different letter makes it disappear. |
| T4.5 | With a suggestion showing, press **Escape** | The suggestion disappears; your text is unchanged. |
| T4.6 | With a suggestion showing, press **Enter** | The message goes to Conversation **without** the grey text. |
| T4.7 | Clear Conversation, pick the Arabic scenario, click **Next customer message** twice, type `شكراً لانتظارك، سجل الاشتراكات الخاص بك` and pause | An Arabic suggestion appears to the left of the caret, continuing right to left (for example "…محدث، وتم تسجيل آخر دفعة في حسابك."). |
| T4.8 | Get an English suggestion (as in T4.2) and press **Right Arrow** | The whole suggestion is inserted, as with Tab. |
| T4.9 | Get an English suggestion and press **Ctrl+Right Arrow** twice (**Option+Right Arrow** on a Mac) | The next two words are inserted one at a time; the rest of the grey text stays. One Ctrl+Z removes only the last word. |
| T4.10 | Get an English suggestion and press **Left Arrow** | The suggestion disappears and the caret moves left as usual. |
| T4.11 | Get an Arabic suggestion (as in T4.7) and press **Left Arrow**; get another and press **Ctrl+Left Arrow** (Option+Left on a Mac) | Left Arrow inserts the whole Arabic suggestion; Ctrl+Left inserts its first word only. Right Arrow would dismiss it instead. |
| T4.12 | Reset, type `Thank you for contacting us, your request` and pause | The suggestion "…has been received and will be processed within 3 working days…" appears. Suggestions aren't filtered for figures, dates, links or names. |
| T4.13 | Reset, clear Conversation, pick the Arabic scenario, click **Next customer message** once, type `شكراً لتواصلك معنا، تم استلام طلبك` and pause | An Arabic suggestion with the time period appears, for example "…وسيتم معالجته خلال ثلاثة أيام عمل…". |
| T4.14 | **With Gemini only** (the offline model never uses names): add `Customer: Hello, this is Noura. When will my request be processed?`, then type `Thank you for contacting us,` (with the comma) and pause, a few times | A suggestion may include "Noura": details from the conversation aren't filtered (made-up data only). |
| T4.15 | After T4.1 (two customer messages), type `Your contribution rec` (stop in the middle of the word) and pause | The suggestion completes the word with no extra space: "Your contribution rec**ords are up to date, and the latest payment…**". A suggestion never changes the letters you typed. The join inside a word isn't checked against a dictionary, so it can occasionally repeat or drop a letter. **Report any join that misspells the word**, with the exact text. |
| T4.16 | Edit a canned response in **Canned responses** (for example change "3 working days" to "5 working days"), then repeat T4.12 | The suggestion follows your edited text. The `complete-reply` event lists `req-canned:…` sources. |

With the offline test model, the suggestions come from the canned responses and the knowledge base, so with both fields empty you'll see few or none. With Gemini they vary, but should always be a single sentence in the language you're typing.

### T5. Knowledge-base grounding (defaults)

| # | Do | Expected |
|---|---|---|
| T5.1 | Replace Conversation with `Customer: Am I eligible for early retirement? I have 26 years of contributions.` and clear **Canned responses** (this isolates the knowledge base). Type `Early retirement is` and pause | The suggestion uses the knowledge base, mentioning **25 years of contributions**. |
| T5.2 | Replace Conversation with `Customer: Hello, good morning`, type a sentence of 3+ words and pause | No knowledge-base facts appear (greetings don't pull in articles). |

### T6. Grammar polish (defaults)

| # | Do | Expected |
|---|---|---|
| T6.1 | Type `He go to the office yesterday and buyed a pen.` and press **Polish** (under the field) | A preview shows "go" and "buyed" struck through, and "went" and "bought" highlighted. |
| T6.2 | Press **Accept**, then Ctrl+Z once | The text becomes "He went … bought a pen."; the single undo restores your draft. |
| T6.3 | Type `تم استلام هذه الطلب وسيتم معالجته.` and press Polish | The preview reads right to left, with "هذه" replaced by "هذا". |
| T6.4 | Type `Your request has been received.` and press Polish | "No changes suggested", with only a Close button. |
| T6.5 | Press Polish, then type something in the field before pressing Accept | Accept is refused with "Polish again"; your typing is kept. |
| T6.6 | With the preview open, press **Escape** | The preview closes; your draft is unchanged. |

### T7. Settings

| # | Do | Expected |
|---|---|---|
| T7.1 | Untick **Inline completion** | No grey suggestions, no `complete-request` events; Canned responses and Knowledge base become read-only. Conversation still protects the customer's words (T2.16). |
| T7.2 | Untick **Spell check** | No underlines and no auto-correct; Auto-correct and its confidence are greyed out. |
| T7.3 | Untick **Arabic** | Arabic words are no longer underlined or corrected; the dictionaries line shows only English. |
| T7.4 | Change some settings, reload the page, then press **Reset** | The changes survive the reload; Reset brings back the defaults. |

## 4. Known limitations (not bugs)

- **Short or ambiguous typos aren't auto-corrected** (T2.9–T2.13). Auto-correct only fixes a word when it's a known common misspelling, when exactly one dictionary word is one typo away, or when only a capital letter is wrong. This avoids wrong changes. The other typos are still underlined with suggestions.
- **Many Arabic typos are only underlined, not auto-corrected** (T2.12, T2.13). Arabic words often have several dictionary words one typo away, because of prefixes and suffixes. Common slips such as "اذا" → "إذا" are fixed through the curated list. For the others, pick the fix from the menu.
- **British spellings are corrected to American ones** in auto mode ("labour" → "labor", "cancelled" → "canceled"), because the English dictionary is en-US. Whether to use en-GB is an open question.
- **The misspellings lists are drafts** awaiting human review (known issue KI-5). If you see a word changed that shouldn't have been, please report it with the exact word.
- **Ignored words are forgotten** when a setting changes or the page reloads; use the Custom dictionary to keep a word.
- **Suggestions aren't filtered for personal details:** they may contain names, emails, links, figures and dates from the conversation and the approved answers (T4.12–T4.14). Use made-up data only.
- **Completion and polish take about half a second to a second** with the live model.
- **All data is synthetic:** customer messages, canned responses and knowledge-base articles were written for this demo. They are **not** real policies or figures.
- **Desktop browsers only;** mobile isn't supported.

## 5. Reporting a problem

Use [`docs/TEST-REPORT-TEMPLATE.md`](TEST-REPORT-TEMPLATE.md), one problem per report, and send it to the person who shared the prototype with you (or open a GitHub issue with the "Test report" template if you have access). Please always include:
- the **version**: the output of `git rev-parse --short HEAD`;
- the **model** (printed by `npm run demo`, and the `model` field in the events);
- your **browser and version**;
- the **scenario number** (for example T2.11);
- the **exact text** you typed, plus expected vs. actual result, and the relevant lines from **Events**.

A screenshot helps; make sure it shows no real data.
