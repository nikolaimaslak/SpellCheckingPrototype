## REMOVED Requirements

### Requirement: Suggestion word check
**Reason**: The browser-side dictionary check caught broken mid-word joins ("be" + "n" = "ben"), but also withheld correct completions of words the dictionary doesn't know ("Ollam" → "Ollama"). The structured completion contract (`completion-service`) removes the cause: the model writes whole words and the service checks with plain string comparison that the word extends what the agent typed.
**Migration**: Hosts drop the `checkWord` option; the completion service withholds non-extending output itself (`withheld: "format"`). No client change is needed beyond removing the option.
