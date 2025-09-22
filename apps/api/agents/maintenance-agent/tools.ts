// tools.ts - Maintenance Agent
import { tool } from '@langchain/core/tools';

// --- Validation Helpers ---
function normalizePhone(input: string): string {
  return String(input || '').replace(/\D+/g, '');
}

function isValidPhone(phone: string): boolean {
  const digits = normalizePhone(phone);
  return digits.length >= 10 && digits.length <= 15;
}

function trimAddress(address: any): any {
  if (!address) return address;
  return {
    street:
      typeof address.street === 'string'
        ? address.street.trim()
        : address.street,
    city: typeof address.city === 'string' ? address.city.trim() : address.city,
    state:
      typeof address.state === 'string' ? address.state.trim() : address.state,
    zip: typeof address.zip === 'string' ? address.zip.trim() : address.zip,
  };
}

function isValidAddress(address: any): boolean {
  if (!address) return false;
  const { street, city, state, zip } = address;
  return (
    typeof street === 'string' &&
    !!street.trim() &&
    typeof city === 'string' &&
    !!city.trim() &&
    typeof state === 'string' &&
    !!state.trim() &&
    typeof zip === 'string' &&
    !!zip.trim()
  );
}

function isValidPermissionToEnter(val: any): boolean {
  return val === 'Yes' || val === 'No' || val === 'Call Before';
}

// --- Tools ---
const submitWorkOrder = tool(
  async (input: any) => {
    const { description, address, phone, permissionToEnter } = input || {};
    if (
      !description ||
      typeof description !== 'string' ||
      !description.trim()
    ) {
      return {
        ok: false,
        error: 'missing_or_invalid_description',
        field: 'description',
      };
    }
    if (!isValidAddress(address)) {
      return {
        ok: false,
        error: 'missing_or_invalid_address',
        field: 'address',
      };
    }
    if (!isValidPhone(phone)) {
      return { ok: false, error: 'missing_or_invalid_phone', field: 'phone' };
    }
    if (!isValidPermissionToEnter(permissionToEnter)) {
      return {
        ok: false,
        error: 'missing_or_invalid_permissionToEnter',
        field: 'permissionToEnter',
      };
    }
    const workOrderId = 'workorder_' + Math.random().toString(36).slice(2, 10);
    return {
      ok: true,
      workOrderId,
      description: description.trim(),
      address: trimAddress(address),
      phone: phone ? normalizePhone(phone) : undefined,
      permissionToEnter,
    };
  },
  {
    name: 'submitWorkOrder',
    description:
      'Submit a maintenance work order after all required fields are collected and validated.',
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
      additionalProperties: false,
    },
  },
);

const notifyOfEmergency = tool(
  async (input: any) => {
    const { description, address, phone } = input || {};
    // Address and phone are now required
    if (!isValidAddress(address)) {
      return {
        ok: false,
        error: 'missing_or_invalid_address',
        field: 'address',
      };
    }
    if (!isValidPhone(phone)) {
      return { ok: false, error: 'missing_or_invalid_phone', field: 'phone' };
    }
    const normalizedPhone = normalizePhone(phone);
    const normalizedAddress = trimAddress(address);
    // Description is optional; if missing, agent should use initial emergency message
    return {
      ok: true,
      acknowledged: true,
      notified: 'on-call',
      description: description ? description.trim() : undefined,
      address: normalizedAddress,
      phone: normalizedPhone,
    };
  },
  {
    name: 'notifyOfEmergency',
    description:
      'Notify on-call staff immediately when an emergency is detected. Address and phone are required; description is optional and will default to the initial emergency message if not provided.',
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
      },
      required: ['address', 'phone'],
      additionalProperties: false,
    },
  },
);

const endConversation = tool(
  async (input: any) => {
    const reason = String(input?.reason || 'user requested to end');
    return { ok: true, reason };
  },
  {
    name: 'endConversation',
    description: 'Signal that the conversation should end now.',
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
);

export default [submitWorkOrder, notifyOfEmergency, endConversation];
