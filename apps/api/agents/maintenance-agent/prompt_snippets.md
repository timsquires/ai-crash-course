This was a proof of concept to attempt to load the company name ahead of time via a tool call (really just an attempt to prove out internal api calls).

If we really wanted to pre-load information for the chatbot, rather than having the LLM handle it, it would be better to place that logic:

- In the thread creation service/controller (e.g., `ThreadsService.createThread` or similar), before saving the thread or rendering the prompt, add the pre-fetch logic. OR
- In the `/threads` POST handler, after receiving the request but before creating the thread, perform the lookup and update the parameters.

---

These instructions never work and instead prompted the user to input an operator id.

## Company Name Resolution
**Step 0: Before doing anything else, if an `operatorId` is provided via input parameter (not user input), you MUST call the `fetchCompanyInfo` tool with the value `{{operatorId}}` to retrieve the company name and logo. Do not greet the user, do not proceed, and do not use any company name until you have called this tool and received a result.**
- If the tool call returns a `companyName`, use it for all greetings and confirmations.
- If the tool call returns a `logoUrl`, display the image in the chat window. Render it in an html <img> tag.
- If the tool call fails or does not return a company name, use the input `companyName` as a fallback for all greetings and confirmations.