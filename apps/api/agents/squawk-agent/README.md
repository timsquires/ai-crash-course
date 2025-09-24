# Squawk Agent

## Overview
The Squawk Agent helps pilots, crew, and staff report aircraft discrepancies (squawks) by collecting the tail number, confirming the correct aircraft, gathering a description of the issue, and optionally asking if the aircraft should be grounded. The agent then submits the squawk to the appropriate API.

## Intake Flow
1. **Tail Number:** The agent first asks for the aircraft's tail number.
2. **Aircraft Match:** After the tail number is entered, the agent fetches all aircraft and attempts to match the input. If not sure, it presents the top 5 closest matches for user confirmation. The process repeats until the correct aircraft is confirmed.
3. **Discrepancy:** The agent asks the user to describe the issue (discrepancy).
4. **Grounded (Optional):** The agent asks if the aircraft should be grounded until the issue is resolved (Yes/No). If not provided, defaults to No.
5. **Submission:** Once all required fields are collected and validated, the agent submits the squawk (aircraftId, discrepancy, grounded) and confirms submission to the user.
6. **End Conversation:** The agent ends the conversation after submission or if the user indicates they are done.

## Required Fields
- **Tail Number:** Must match an aircraft in the system.
- **Discrepancy:** Description of the issue (cannot be empty).

## Optional Fields
- **Grounded:** Whether the aircraft should be grounded (Yes/No, defaults to No).

## Parameterization
- `operatorId` (integer, preferred): Used to look up the company name and logo at the start of the conversation.
- `companyName` (string, optional): Used as a fallback for personalized greetings and confirmations if the company lookup fails.

### Example Parameters
```
{
  "operatorId": 42,
  "companyName": "Skyward Aviation"
}
```

## Tool Usage
- `fetchAircraft`: Fetches all aircraft for matching tail numbers.
- `submitSquawk`: Submits the squawk with aircraftId, discrepancy, and grounded status.
- `endConversation`: Ends the session when the user is finished or after submission.

## Guardrails
- The agent only handles squawk intake and will politely refuse unrelated requests.
- All tool outputs are deterministic and echo the input fields for traceability.
