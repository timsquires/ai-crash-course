# Maintenance Chat Agent

A production-ready maintenance request intake agent that collects required information, detects emergencies, and escalates appropriately.

## Features

- **Data Collection**: Collects description, full address, phone number, and permission to enter
- **Emergency Detection**: Immediately escalates life-safety issues to on-call staff
- **Input Validation**: Validates all inputs and asks for clarification when needed
- **Parameterization**: Supports company name and service limitations
- **Tool Integration**: Uses submitWorkOrder and notifyOfEmergency tools

## Emergency Criteria

The agent will immediately escalate to on-call staff if the description contains any of these life-safety indicators:

### Fire & Smoke

- Active fire, flames, burning
- Smoke, burning smells
- Heat-related emergencies

### Water & Flooding

- Water flooding, major leaks
- Burst pipes, overflow
- Water damage emergencies

### Gas & Hazards

- Gas leaks, gas odors
- Fumes, chemical smells
- Hazardous material exposure

### Structural Issues

- Structural damage, collapse
- Unsafe building conditions
- Foundation problems

### Electrical Hazards

- Exposed wires, electrical fires
- Power outages, electrical shocks
- Electrical system failures

### Security Issues

- Break-ins, unauthorized access
- Security breaches
- Safety threats

### General Emergency Keywords

- Emergency, urgent, immediate
- Critical, life-threatening
- 911, call emergency services

## Required Parameters

The agent expects these parameters when creating a thread:

```json
{
  "companyName": "Your Company Name",
  "servicesNotProvided": [
    "appliance installation",
    "pest control",
    "landscaping"
  ]
}
```

## Tool Definitions

### submitWorkOrder

- **Purpose**: Submit a maintenance work order after all information is collected
- **Required Fields**: description, address (street/city/state/zip), phone, permissionToEnter
- **Validation**: All fields must be present and valid
- **Output**: Work order ID and confirmation message

### notifyOfEmergency

- **Purpose**: Immediately escalate emergency situations
- **Required Fields**: description (minimum)
- **Optional Fields**: address, phone (if available)
- **Output**: Emergency ID and escalation confirmation

## Input Validation

### Address Validation

- Must include: street, city, state, zip code
- All components must be non-empty strings
- Agent will ask for missing components

### Phone Validation

- Must be 10-15 digits after removing formatting
- Accepts various formats: (555) 123-4567, 555-123-4567, etc.
- Agent will ask for clarification if invalid

### Permission to Enter

- Must be exactly: "Yes", "No", or "Call Before"
- Case-sensitive validation
- Agent will reject other values and ask again

## Service Limitations

The agent will politely decline requests for services not provided by the maintenance team:

- Checks against `servicesNotProvided` parameter
- Provides clear refusal message
- Offers alternative supported services
- Maintains professional tone

## Usage Examples

### Normal Maintenance Request

```
User: "My kitchen sink is leaking"
Agent: "Thanks for reaching out to Acme Property Management. How can we help you today?"
Agent: [Collects description, address, phone, permission]
Agent: [Calls submitWorkOrder]
Agent: "Work order WO-123456 has been created successfully..."
```

### Emergency Detection

```
User: "There's smoke coming from the electrical panel!"
Agent: "Thanks for reaching out to Acme Property Management. How can we help you today?"
Agent: [Immediately calls notifyOfEmergency]
Agent: "EMERGENCY ESCALATED: EMERG-789012. On-call staff has been notified immediately..."
```

### Service Limitation

```
User: "I need help installing a new dishwasher"
Agent: "I'm sorry, that's actually not an issue we are able to handle. You will have to handle that on your own. However, I can help you with plumbing repairs, electrical issues, or general maintenance..."
```

## Assumptions & Limitations

1. **US Phone Numbers**: Validation assumes US phone number format
2. **Address Format**: Expects US address format (street, city, state, zip)
3. **Emergency Detection**: Based on keyword matching in description
4. **Tool Execution**: Synchronous execution, no retry logic
5. **Persistence**: Work orders and emergencies are logged to console
6. **Thread Management**: Relies on existing thread service for conversation state

## Error Handling

- **Validation Errors**: Clear error messages with guidance
- **Missing Fields**: Asks for specific missing information
- **Invalid Input**: Requests clarification and correction
- **Tool Failures**: Throws descriptive errors for debugging
- **Emergency Escalation**: Always attempts to escalate with available information

## Testing

Test the agent through the chat widget:

1. Start API: `npm run api:dev`
2. Start Widget: `npm run chat:dev`
3. Open: `http://localhost:5173/public/test.html`
4. Set Agent: `maintenance-agent`
5. Add Parameters:
   ```json
   {
     "companyName": "Acme Property Management",
     "servicesNotProvided": [
       "appliance installation",
       "pest control",
       "landscaping"
     ]
   }
   ```

## Future Enhancements

- Streaming responses
- Retry policies for tool failures
- Chained tool call support
- Parameter validation with secondary agent
- Thread creation parameter validation
- Conversation summarization
