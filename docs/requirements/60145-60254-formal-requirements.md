2p 60145 and 60254 \- Auto-complete and auto-correct functions for chat and email

#### Change Control

* 2026-9-22 SV \- Initial version

#### Background Info

The functions discussed in this document aim to reduce handle time of text-based customer interactions while improving message quality and consistency. The two functions are related but distinct and are specified separately below: auto-complete predicts what the agent hasn't typed yet (ghost text ahead of the cursor); auto-correct fixes what the agent already typed (in place, behind the cursor). Users may have either, both, or neither enabled depending on their configuration profiles.

2p/GOSI [60145](https://bugfocus.zendesk.com/agent/tickets/60145)  
2p/GOSI [60254](https://bugfocus.zendesk.com/agent/tickets/60254)

Andri Petrov’s research and proposal is [here](https://drive.google.com/file/d/1NsvTJ1xqJBmnIxYQ6BcAMFKiANH8DigA/view?usp=drive_link)

#### Requirements

1. In Tenant Management \> AI Features section, introduce a new tenant feature  
   1. Name: *Assisted typing in chats and emails*   
   2. Disabled by default  
   3. Non-paid (TBD)  
2. In AD2.0 [Configuration Profiles](https://docs.google.com/document/d/1cJvBeK59Bu8VrLcZyGSb-g46LeZFV2f4H-uB9yMMXOw/edit?usp=sharing) \> Interaction Handling section, introduce these new settings shown only if the above tenant feature is enabled  
   1. *Use auto-correct in text interactions*  
   2. *Use auto-replace for commonly misspelled words*  
      1. Editable only if the **auto-correct** setting (above) is enabled  
   3. *Send messages with unresolved spelling flags without warning*  
      1. Editable only if the **auto-correct** setting (above) is enabled  
   4. *Use auto-complete in text interactions*  
   5. All of the above settings shall be  
      1. Shown only if feature *Assisted typing in chats and emails* is enabled for the given tenant  
      2. Enabled in all profiles of existing (migrating) tenants  
      3. Enabled in the default profile of any new tenant  
3. With the **auto-complete** function enabled  
   1. As the agent types in the email or chat compose box, the system shall predict the likely continuation of the current sentence and display it as inline ghost text (low-contrast, non-editable) immediately following the cursor, similar to the pattern used by Gmail Smart Compose.  
   2. The agent shall be able to:  
      1. accept the full suggestion with a single keystroke (e.g., Tab and Right Arrow at end-of-line)  
      2. accept it one word at a time (e.g., Ctrl+Right Arrow)  
      3. dismiss it by continuing to type any other character, pressing Escape, or moving the cursor.  
   3. Suggestions shall never auto-insert text without explicit agent action; the agent is always free to ignore a suggestion and keep typing.  
   4. New suggestions shall regenerate as the agent continues typing or after accepting a partial suggestion.  
   5. Suggestion latency shall not exceed 200ms from keystroke to render, so the feature does not feel laggy; if the system cannot generate a suggestion within that window, none is shown for that keystroke rather than a delayed one appearing later.  
   6. Suggestions shall be generated from a blend of:  
      1. General-purpose language patterns  
      2. The current interaction's context (customer message thread, case/ticket fields, customer profile data and activity history available to the agent)  
      3. Relevant knowledge base articles  
      4. Global canned chat responses  
      5. Agent-authored messages in transcripts of relevant previous interactions   
   7. Suggestions shall not include   
      1. Any PII  
      2. Any unique identifiers (e.g., order or case number)  
      3. Specific amounts  
      4. Specific dates or timelines  
4. With the **auto-correct** function enabled  
   1. The system shall check spelling continuously as the agent types and either auto-replace or flag misspelled words with a visual indicator (e.g., underline), without interrupting typing.  
   2. High-confidence errors shall be auto-replaced when the word is completed (space, punctuation or Enter). A typical example is "teh": a known common misspelling of “the” with a single unambiguous correction.  
      1. An auto-replaced word shall be visibly indicated for a short time. The agent shall be able to revert it with one action (for example, Ctrl+Z or Backspace right after the change). A reverted word shall not be auto-corrected again in the same message.    
      2. Auto-replace shall not apply to people's names, URLs, email addresses, words containing digits, or words in all caps.   
      3. High confidence shall be determined by either a maintained autocorrect dictionary of common misspellings or a correction confidence score exceeding a configurable threshold (the exact method TBD). A word with more than one plausible correction shall always be treated as low-confidence.   
      4. (SV: nice-to-have) The system shall maintain an editable custom dictionary of terms that must never be flagged or altered: product names, company/brand names, technical jargon, and agent-added terms.  
   3. Low-confidence errors shall not be changed automatically. Instead they shall be flagged (for example, underlined). Clicking a flagged word shall allow the agent to pick a suggested fix or ignore it.   
   4. Admins shall be able to [disable auto-replace](#bookmark=id.vpqvryyoguxh). When it's disabled, all errors are handled as low-confidence errors (see above).  
   5. Auto-correct shall apply identically whether the agent is typing free text or editing an inserted copy-pasted text, canned responses, or KB articles (TBD).

   6. If the [Send messages with unresolved spelling flags without warning](#bookmark=id.bqjwklezf13h) setting is disabled, the system shall show the confirmation dialog *This message has possible typos, send anyway?*

5. When enabled, both auto-complete and auto-correct functions shall apply to:  
   1. Email drafts in AD 2.0  
   2. Chat input areas for all service chat communications (web, messenger, SMS) in AD 2.0  
   3. Chat input areas for all service chat communications (web, messenger, SMS) in Comm Widget 2.0  
   4. Knowledge Base article body drafts  
6. Neither auto-complete nor auto-correct functions shall apply to:  
   1. Internal chat messages  
   2. Any from fields  
   3. Interaction notes (TBC)  
   4. Internal case notes (TBC)  
   5. Titles of any custom entities (e.g., calendar events, saved record searches, home page views, KB articles and folders)  
   6. KB keywords, usage notes  
   7. Search fields  
7. The system shall attempt to detect the language from the interaction context and apply the matching spelling/grammar ruleset; agents handling multiple languages shall be able to switch the language manually if auto-detection is wrong.  
8. Any third-party technology used to enable the above functionalities shall support at least the following languages:  
   1. English  
   2. Arabic  
   3. Spanish  
   4. French  
   5. German  
   6. Japanese  
   7. Korean  
9. Copies of the original license and copyright notices for 3rd party components shall be added to the list of 3rd party acknowledgement notices  
10. If the AI service providing the auto-complete/auto-correct functions becomes too slow or is down, the affected text input areas should behave as a normal text boxes, without showing any errors  
11. Reporting (Measuring effectiveness: suggestion acceptance rate, how often agents undo auto-replace, and effect on handle time.) \- TBD 

    

    

    

    

  


    