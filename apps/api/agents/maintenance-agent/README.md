# Maintenance Agent

## Emergency Criteria
The following are considered emergencies and will be escalated immediately:
- Flooding or active water leak
- Fire, smoke, or burning smell
- Gas leak or strong gas odor
- Structural collapse or major damage
- Earthquake damage
- Any situation posing immediate risk to life, health, or property
If the agent is unsure, it will err on the side of caution and escalate.

## Assumptions
- The agent expects address input as structured fields: street, city, state, and zip. The LLM is responsible for clarifying and splitting free-form addresses with the user.
- Phone numbers must be 10-15 digits (US/E.164 format, numbers only). The agent will ask for corrections if invalid.
- Permission to enter must be one of: "Yes", "No", or "Call Before". Any other value will be rejected and clarified.
- The agent uses the `companyName` parameter for personalized greetings and confirmations.
- The agent checks all requests against the `servicesNotProvided` list and refuses unsupported services with a clear message, offering supported alternatives when possible.
- All tool outputs are deterministic and echo the input fields for traceability.

## Limitations
- The agent does not parse free-form addresses at the tool level; it relies on the LLM to extract and clarify address fields with the user.
- The agent cannot handle requests outside the scope of maintenance intake (e.g., coding, jokes, system info) and will politely refuse such requests.
- Only the specific emergency criteria listed above will trigger immediate escalation; other urgent issues may require user clarification.
- The agent does not support chained or multi-step tool calls beyond the standard intake and emergency flow.
- The agent's validation is strict; missing or malformed fields will result in follow-up questions or error responses.

## Passing Input Parameters

The maintenance agent requires two input parameters:
- `companyName` (string): Used for personalized greetings and confirmations.
- `servicesNotProvided` (string[]): A list of services the maintenance team does NOT provide.

### 1. Using the Chat Widget
In the chat widget's "Parameters" field, provide the parameters as JSON:
```json
{
  "companyName": "Acme Property Management",
  "servicesNotProvided": ["appliance installation", "pest control", "landscaping"]
}
```

### 2. Using the API
When creating a thread via the API, include the parameters in the `parameters` field:
```json
{
  "agent": "maintenance-agent",
  "parameters": {
    "companyName": "Acme Property Management",
    "servicesNotProvided": ["appliance installation", "pest control", "landscaping"]
  },
  "userMessage": "Hi, I need help with my sink."
}
```
