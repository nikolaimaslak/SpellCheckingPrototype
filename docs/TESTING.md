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
- A supported browser: current **Chrome** or **Edge** (recommended), **Safari 17.2+**, or **Firefox 140+**.

**Start:**

```sh
npm install
npm run dev
```

Open **http://localhost:5173/** (printed in the terminal). Stop with **Ctrl+C**.

**Everything needs an OpenAI API key.** Type it in **OpenAI API key** in the settings (saved in your browser). The page then sends your draft, the conversation, canned responses and KB to OpenAI (`gpt-4.1-mini`), so use made-up text only. Without a key nothing is underlined, there are no grey suggestions and Polish shows nothing.

## 2. What the page shows

- **Settings** (left), saved in your browser; **Reset** puts the defaults back:
  - **Model:** the OpenAI API key.
  - **Spelling:** spell check on or off, auto-correct on or off, the custom dictionary.
  - **Completion:** on or off.
  - **Sources:** **Conversation** (`Customer:` / `Agent:` lines; a scenario picker with **Next customer message** adds the next customer line), **Canned responses** (one per line) and **Knowledge base** (`Title: text` per line). An empty field turns that source off. The note under each field says how it is used.
- **The message field:** Enter adds your message to Conversation as an `Agent:` line and clears the field; Shift+Enter starts a new line. Under it, the **Polish** button.
- **Events** (bottom): every event as one line of JSON, for example `{"type":"autocorrect","lang":"en","original":"teh","replacement":"the"}`, every request to the model (`check-request`) and its answer (`check-reply`, with the mistakes and the completion), and polish.

If something gets into a strange state, press **Reset**, or reload the page.

## 3. Scenarios

Start each section with **Reset** unless it says otherwise. A trailing space in an input (shown as `␣`) matters: type it.

**How spelling works now.** While you type, the page sends the whole draft to the model at most once a second, and once more after you stop. The answer lists the misspelled words, each with fixes and whether the model is **sure**. Sure mistakes are auto-corrected; the others are underlined, with the fixes in the menu. The word you are still typing (the caret at its end) is never touched. Answers vary a little from run to run: report what you see, with the `check-reply` event.

### T1. Spell checking (untick **Auto-correct**)

| # | Do | Expected |
|---|---|---|
| T1.1 | Type `I will recieve it␣` and wait a second | Only "recieve" gets a red wavy underline. A `flag` event appears. |
| T1.2 | Click "recieve" | A small menu opens next to it with fixes ("receive" first) and **Ignore**. |
| T1.3 | Choose "receive", then press Ctrl+Z (Cmd+Z on Mac) once | The word becomes "receive"; the undo brings back "recieve". |
| T1.4 | Put the caret inside "recieve" and press **Ctrl+.**, then use the arrow keys, Enter, and Escape | The menu opens from the keyboard; Enter picks; Escape closes without changes. |
| T1.5 | Type `اذا كان الطلب␣` | "اذا" is underlined. Its menu reads right to left and offers "إذا". |
| T1.6 | Type `رقم الطلب في نظام GOSSI هو␣` | Mixed Arabic and English work in one draft; the Arabic words aren't underlined. |
| T1.7 | Type `see https://example.org or mail info@example.org, case CS-104233, Dear $(user.firstName)␣` | Nothing in the link, email, reference number or placeholder is underlined. |
| T1.8 | Click an underlined word and choose **Ignore** | That word stops being underlined, and isn't flagged again until a setting changes or the page reloads. |
| T1.9 | Type `recie` and stop with the caret right after it | Not underlined while the caret is still at its end. |
| T1.10 | Add `GOSSI` to the Custom dictionary, then type `GOSSI is down␣` | "GOSSI" is not underlined (custom words are sent to the model as "never report", and also never underlined by the page). |

### T2. Auto-correct (defaults)

The corrected word flashes briefly. Each correction is its own Ctrl/Cmd+Z step.

| # | Type | Expected |
|---|---|---|
| T2.1 | `please seperate them␣` | becomes "please separate them" |
| T2.2 | `the paymnet from your freind␣` | "payment" · "friend" |
| T2.3 | `Seperate them␣` at the start | "Separate" (capital kept) |
| T2.4 | `teh request␣` | "the request" |
| T2.5 | `اذا كان الطلب␣` · `سنرسل الرد الى بريدك␣` | "إذا كان" · "إلى", when the model is sure; otherwise only underlined |
| T2.6 | `please afte that␣` | Not changed (after? aft?): only underlined, with the choices in the menu |
| T2.7 | `email info@gosi.gov.sa␣` · `visit https://www.gosi.gov.sa/en␣` | Nothing in the address changes |
| T2.8 | `Dear Ms. Fatimah,␣` | Names aren't changed |
| T2.9 | Add the line `Customer: Hello, this is Nura` to Conversation. Then type `Nura, thank you␣` | "Nura" is not changed, because the customer wrote it. |
| T2.10 | Untick **Auto-correct**, type `teh request␣` and click "teh" | Not changed; its menu offers "the" first. |

### T3. Reverting an auto-correction (defaults)

| # | Do | Expected |
|---|---|---|
| T3.1 | Type `please seperate them␣`, then press Ctrl+Z (Cmd+Z) until "seperate" comes back | "seperate" comes back, and a `revert` event appears. It isn't corrected or underlined again. |
| T3.2 | Type `رقم المستخذم في النظام␣`, then click the corrected "المستخدم" | The menu offers only **Revert to المستخذم** (right to left). Choosing it restores the word, and it isn't corrected or underlined again. |
| T3.3 | After a correction, press **Backspace** | A normal Backspace. Only Ctrl/Cmd+Z and the menu revert. |

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
| T4.14 | Add `Customer: Hello, this is Noura. When will my request be processed?`, then type `Thank you for contacting us,` (with the comma) and pause, a few times | A suggestion may include "Noura": details from the conversation aren't filtered (made-up data only). |
| T4.15 | After T4.1 (two customer messages), type `Your contribution rec` (stop in the middle of the word) and pause | The suggestion completes the word with no extra space: "Your contribution rec**ords are up to date, and the latest payment…**". A suggestion never changes the letters you typed. The join inside a word isn't checked against a dictionary, so it can occasionally repeat or drop a letter. **Report any join that misspells the word**, with the exact text. |
| T4.16 | Edit a canned response in **Canned responses** (for example change "3 working days" to "5 working days"), then repeat T4.12 | The suggestion follows your edited text. |

Suggestions vary from run to run, but should always be a single sentence in the language you're typing. All canned responses and KB articles are sent with every request, so an empty field means that source is off.

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
| T7.1 | Untick **Inline completion** | No grey suggestions, and `check-request` events say `"completion":false`; Canned responses and Knowledge base become read-only. Conversation still protects the customer's words (T2.9). |
| T7.2 | Untick **Spell check** | No underlines and no auto-correct; Auto-correct is greyed out. With completion also off, nothing is sent to the model. |
| T7.3 | Change some settings, reload the page, then press **Reset** | The changes survive the reload; Reset brings back the defaults. |

## 4. Known limitations (not bugs)

- **The model decides what is a mistake and what is sure.** Answers can differ between runs, and a word can be underlined in one answer and not in the next. Report wrong auto-corrections with the exact text and the `check-reply` event.
- **Underlines and corrections come up to a second after you type,** plus the model's answer time.
- **Ignored words are forgotten** when a setting changes or the page reloads; use the Custom dictionary to keep a word.
- **Suggestions aren't filtered for personal details:** they may contain names, emails, links, figures and dates from the conversation and the approved answers (T4.12–T4.14). Use made-up data only.
- **All data is synthetic:** customer messages, canned responses and knowledge-base articles were written for this demo. They are **not** real policies or figures.
- **Desktop browsers only;** mobile isn't supported.

## 5. Reporting a problem

Use [`docs/TEST-REPORT-TEMPLATE.md`](TEST-REPORT-TEMPLATE.md), one problem per report, and send it to the person who shared the prototype with you (or open a GitHub issue with the "Test report" template if you have access). Please always include:
- the **version**: the output of `git rev-parse --short HEAD`;
- your **browser and version**;
- the **scenario number** (for example T2.6);
- the **exact text** you typed, plus expected vs. actual result, and the relevant lines from **Events**.

A screenshot helps; make sure it shows no real data.
