// Direct test of maintenance agent tools without API
const { tool } = require('@langchain/core/tools');

// Copy the tool definitions for direct testing
const submitWorkOrder = tool(
  async (input) => {
    const description = String(input?.description || '').trim();
    const address = input?.address;
    const phone = String(input?.phone || '').trim();
    const permissionToEnter = String(input?.permissionToEnter || '').trim();

    // Validation
    if (!description) {
      throw new Error('Description is required');
    }

    if (
      !address ||
      !address.street ||
      !address.city ||
      !address.state ||
      !address.zip
    ) {
      throw new Error(
        'Complete address is required (street, city, state, zip)',
      );
    }

    const digits = phone.replace(/\D/g, '');
    if (!phone || digits.length < 10 || digits.length > 15) {
      throw new Error('Valid phone number is required (10-15 digits)');
    }

    if (!['Yes', 'No', 'Call Before'].includes(permissionToEnter)) {
      throw new Error(
        'Permission to enter must be exactly: Yes, No, or Call Before',
      );
    }

    // Generate work order ID
    const workOrderId = `WO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    return {
      workOrderId,
      status: 'created',
      details: {
        description,
        address: {
          street: address.street.trim(),
          city: address.city.trim(),
          state: address.state.trim(),
          zip: address.zip.trim(),
        },
        phone: digits,
        permissionToEnter,
      },
      createdAt: now,
      message: `Work order ${workOrderId} has been created successfully. Our maintenance team will contact you at ${digits} to schedule the repair.`,
    };
  },
  {
    name: 'submitWorkOrder',
    description:
      'Submit a maintenance work order after all required information has been collected and validated.',
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
          },
          required: ['street', 'city', 'state', 'zip'],
        },
        phone: { type: 'string' },
        permissionToEnter: {
          type: 'string',
          enum: ['Yes', 'No', 'Call Before'],
        },
      },
      required: ['description', 'address', 'phone', 'permissionToEnter'],
    },
  },
);

const notifyOfEmergency = tool(
  async (input) => {
    const description = String(input?.description || '').trim();
    const address = input?.address;
    const phone = String(input?.phone || '').trim();

    if (!description) {
      throw new Error('Emergency description is required');
    }

    const emergencyId = `EMERG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    return {
      acknowledged: true,
      notified: 'on-call staff',
      emergencyId,
      details: {
        description,
        address: address && address.street ? address : undefined,
        phone: phone ? phone.replace(/\D/g, '') : undefined,
      },
      escalatedAt: now,
      message: `EMERGENCY ESCALATED: ${emergencyId}. On-call staff has been notified immediately. If this is a life-threatening emergency, please call 911.`,
    };
  },
  {
    name: 'notifyOfEmergency',
    description: 'Immediately escalate emergency situations to on-call staff.',
    schema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            zip: { type: 'string' },
          },
        },
        phone: { type: 'string' },
      },
      required: ['description'],
    },
  },
);

// Test the tools
async function testTools() {
  console.log('🧪 Testing Maintenance Agent Tools\n');

  // Test 1: Valid work order
  console.log('1️⃣ Testing valid work order submission...');
  try {
    const workOrderResult = await submitWorkOrder.invoke({
      description: 'Kitchen sink is leaking water',
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      },
      phone: '(555) 123-4567',
      permissionToEnter: 'Yes',
    });
    console.log(
      '✅ Work Order Result:',
      JSON.stringify(workOrderResult, null, 2),
    );
  } catch (error) {
    console.log('❌ Work Order Error:', error.message);
  }

  // Test 2: Emergency notification
  console.log('\n2️⃣ Testing emergency notification...');
  try {
    const emergencyResult = await notifyOfEmergency.invoke({
      description: 'There is smoke coming from the electrical panel!',
      address: {
        street: '456 Oak Ave',
        city: 'Emergency City',
        state: 'CA',
        zip: '54321',
      },
      phone: '555-987-6543',
    });
    console.log(
      '✅ Emergency Result:',
      JSON.stringify(emergencyResult, null, 2),
    );
  } catch (error) {
    console.log('❌ Emergency Error:', error.message);
  }

  // Test 3: Invalid work order (missing fields)
  console.log('\n3️⃣ Testing validation (missing address)...');
  try {
    const invalidResult = await submitWorkOrder.invoke({
      description: 'Broken door',
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '', // Missing zip
      },
      phone: '555-123-4567',
      permissionToEnter: 'Yes',
    });
    console.log('❌ Should have failed:', invalidResult);
  } catch (error) {
    console.log('✅ Correctly caught error:', error.message);
  }

  // Test 4: Invalid phone number
  console.log('\n4️⃣ Testing validation (invalid phone)...');
  try {
    const invalidPhone = await submitWorkOrder.invoke({
      description: 'Broken window',
      address: {
        street: '789 Pine St',
        city: 'Test City',
        state: 'NY',
        zip: '67890',
      },
      phone: '123', // Too short
      permissionToEnter: 'No',
    });
    console.log('❌ Should have failed:', invalidPhone);
  } catch (error) {
    console.log('✅ Correctly caught error:', error.message);
  }

  // Test 5: Invalid permission
  console.log('\n5️⃣ Testing validation (invalid permission)...');
  try {
    const invalidPermission = await submitWorkOrder.invoke({
      description: 'Clogged drain',
      address: {
        street: '321 Elm St',
        city: 'Validation City',
        state: 'TX',
        zip: '11111',
      },
      phone: '555-555-5555',
      permissionToEnter: 'Maybe', // Invalid value
    });
    console.log('❌ Should have failed:', invalidPermission);
  } catch (error) {
    console.log('✅ Correctly caught error:', error.message);
  }

  console.log('\n🎉 Tool testing completed!');
  console.log('\n📋 Next steps:');
  console.log('1. Install Docker to run the full API');
  console.log(
    '2. Or use the chat widget at http://localhost:5175/public/test.html',
  );
  console.log('3. Set Agent: maintenance-agent');
  console.log(
    '4. Add Parameters: {"companyName": "Test Company", "servicesNotProvided": ["appliance installation"]}',
  );
}

testTools().catch(console.error);
