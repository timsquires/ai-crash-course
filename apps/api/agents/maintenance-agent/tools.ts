import { tool } from '@langchain/core/tools';

// Type definitions for better type safety
export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
}

export interface WorkOrderDetails {
  description: string;
  address: Address;
  phone: string;
  permissionToEnter: 'Yes' | 'No' | 'Call Before';
}

export interface EmergencyDetails {
  description: string;
  address?: Address;
  phone?: string;
}

export interface WorkOrderResult {
  workOrderId: string;
  status: 'created';
  details: WorkOrderDetails;
  createdAt: string;
  message: string;
}

export interface EmergencyResult {
  acknowledged: boolean;
  notified: string;
  emergencyId: string;
  details: EmergencyDetails;
  escalatedAt: string;
  message: string;
}

// Validation utilities
function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function isValidAddress(address: Address): boolean {
  return !!(
    address.street?.trim() &&
    address.city?.trim() &&
    address.state?.trim() &&
    address.zip?.trim()
  );
}

function isValidPermissionToEnter(
  permission: string,
): permission is 'Yes' | 'No' | 'Call Before' {
  return ['Yes', 'No', 'Call Before'].includes(permission);
}

// Work Order Tool
const submitWorkOrder = tool(
  async (input: any): Promise<WorkOrderResult> => {
    const description = String(input?.description || '').trim();
    const address = input?.address as Address;
    const phone = String(input?.phone || '').trim();
    const permissionToEnter = String(input?.permissionToEnter || '').trim();

    // Validation
    if (!description) {
      throw new Error('Description is required');
    }

    if (!address || !isValidAddress(address)) {
      throw new Error(
        'Complete address is required (street, city, state, zip)',
      );
    }

    if (!phone || !isValidPhone(phone)) {
      throw new Error('Valid phone number is required (10-15 digits)');
    }

    if (!isValidPermissionToEnter(permissionToEnter)) {
      throw new Error(
        'Permission to enter must be exactly: Yes, No, or Call Before',
      );
    }

    // Generate deterministic work order ID
    const workOrderId = `WO-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const workOrderDetails: WorkOrderDetails = {
      description,
      address: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zip: address.zip.trim(),
      },
      phone: normalizePhone(phone),
      permissionToEnter,
    };

    // Simulate work order creation
    console.log(
      `[MAINTENANCE] Work Order Created: ${workOrderId}`,
      workOrderDetails,
    );

    return {
      workOrderId,
      status: 'created',
      details: workOrderDetails,
      createdAt: now,
      message: `Work order ${workOrderId} has been created successfully. Our maintenance team will contact you at ${normalizePhone(phone)} to schedule the repair.`,
    };
  },
  {
    name: 'submitWorkOrder',
    description:
      'Submit a maintenance work order after all required information has been collected and validated.',
    schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Detailed description of the maintenance issue',
        },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', description: 'Street address' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State' },
            zip: { type: 'string', description: 'ZIP code' },
          },
          required: ['street', 'city', 'state', 'zip'],
          additionalProperties: false,
        },
        phone: {
          type: 'string',
          description: 'Contact phone number (10-15 digits)',
        },
        permissionToEnter: {
          type: 'string',
          enum: ['Yes', 'No', 'Call Before'],
          description: 'Permission to enter the property',
        },
      },
      required: ['description', 'address', 'phone', 'permissionToEnter'],
      additionalProperties: false,
    },
  },
);

// Emergency Notification Tool
const notifyOfEmergency = tool(
  async (input: any): Promise<EmergencyResult> => {
    const description = String(input?.description || '').trim();
    const address = input?.address as Address | undefined;
    const phone = String(input?.phone || '').trim();

    if (!description) {
      throw new Error('Emergency description is required');
    }

    // Generate deterministic emergency ID
    const emergencyId = `EMERG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const now = new Date().toISOString();

    const emergencyDetails: EmergencyDetails = {
      description,
      address: address && isValidAddress(address) ? address : undefined,
      phone: phone && isValidPhone(phone) ? normalizePhone(phone) : undefined,
    };

    // Simulate emergency notification
    console.log(
      `[EMERGENCY] Emergency Escalated: ${emergencyId}`,
      emergencyDetails,
    );
    console.log(`[EMERGENCY] Notifying on-call staff immediately...`);

    return {
      acknowledged: true,
      notified: 'on-call staff',
      emergencyId,
      details: emergencyDetails,
      escalatedAt: now,
      message: `EMERGENCY ESCALATED: ${emergencyId}. On-call staff has been notified immediately. If this is a life-threatening emergency, please call 911.`,
    };
  },
  {
    name: 'notifyOfEmergency',
    description:
      'Immediately escalate emergency situations to on-call staff. Use this when life-safety issues are detected.',
    schema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'Description of the emergency situation',
        },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string', description: 'Street address' },
            city: { type: 'string', description: 'City' },
            state: { type: 'string', description: 'State' },
            zip: { type: 'string', description: 'ZIP code' },
          },
          required: ['street', 'city', 'state', 'zip'],
          additionalProperties: false,
        },
        phone: {
          type: 'string',
          description: 'Contact phone number (10-15 digits)',
        },
      },
      required: ['description'],
      additionalProperties: false,
    },
  },
);

// Export tools as array for the agent service
export default [submitWorkOrder, notifyOfEmergency];
