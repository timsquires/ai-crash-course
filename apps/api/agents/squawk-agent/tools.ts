// tools.ts - Squawk Agent
import { tool } from '@langchain/core/tools';
import axios from 'axios';

console.log('[SquawkAgent] Tool file loaded');

// --- In-memory Aircraft Cache ---
let aircraftCache: any[] | null = null;

// --- Aircraft Fetch Tool ---
const fetchAircraft = tool(
  async (_input: any) => {
    console.log('[fetchAircraft] Tool invoked with input:', _input);
    if (aircraftCache) {
      return { ok: true, aircraft: aircraftCache };
    }
    try {
      // todo - new endpoint that can fetch aircraft w/o auth token
      const response = await axios.get(
        `https://api-feature-1.flightschedulepro.com/api/v3/operator/10/aircraft?status=1`,
        {
          headers: {
            Authorization: `Bearer ${process.env.SESSION_TOKEN}`,
          },
        },
      );
      aircraftCache = response.data;
      return { ok: true, aircraft: aircraftCache };
    } catch (error) {
      console.error('[fetchAircraft] API call failed:', error);
      return {
        ok: false,
        error: 'api_request_failed',
        details: error?.message || String(error),
      };
    }
  },
  {
    name: 'fetchAircraft',
    description:
      'Fetch all aircraft for tail number matching. Returns an array of aircraft objects.',
    schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
);

// --- Squawk Submission Tool ---
const submitSquawk = tool(
  async (input: any) => {
    console.log('[submitSquawk] Tool invoked with input:', input);
    const { operatorId, aircraftId, discrepancy, grounded } = input || {};
    // operatorId must come from the params, not user input, and is always included in the POST body
    if (!aircraftId) {
      return { ok: false, error: 'missing_aircraftId', field: 'aircraftId' };
    }
    if (!operatorId) {
      return { ok: false, error: 'missing_operatorId', field: 'operatorId' };
    }
    if (
      !discrepancy ||
      typeof discrepancy !== 'string' ||
      !discrepancy.trim()
    ) {
      return {
        ok: false,
        error: 'missing_or_invalid_discrepancy',
        field: 'discrepancy',
      };
    }
    try {
      // todo - new endpoint that can submit squawks w/o auth token
      const response = await axios.post(
        `https://api-feature-1.flightschedulepro.com/api/v2/squawks`,
        {
          aircraftId,
          discrepancy: `${discrepancy.trim()} [added by squawkbot]`,
          isGroundable: grounded === 'Yes' ? true : false,
          operatorId,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.SESSION_TOKEN}`,
          },
          validateStatus: () => true, // allow handling of non-200s
        },
      );
      if (response.status >= 200 && response.status < 300) {
        return {
          ok: true,
          squawkId: response.data?.id || null,
          aircraftId,
          discrepancy: `${discrepancy.trim()} [added by squawkbot]`,
          grounded: grounded === 'Yes' ? true : false,
        };
      } else {
        return {
          ok: false,
          error: 'api_request_failed',
          message:
            response.data?.message || response.statusText || 'Unknown error',
          status: response.status,
        };
      }
    } catch (error) {
      console.error('[submitSquawk] API call failed:', error);
      return {
        ok: false,
        error: 'api_request_failed',
        message: error?.message || String(error),
      };
    }
  },
  {
    name: 'submitSquawk',
    description:
      'Submit a squawk (aircraft discrepancy report) with aircraftId, discrepancy, and optional grounded status.',
    schema: {
      type: 'object',
      properties: {
        aircraftId: { type: 'string' },
        discrepancy: { type: 'string' },
        grounded: { type: 'string', enum: ['Yes', 'No'], default: 'No' },
        operatorId: { type: 'number' },
      },
      required: ['aircraftId', 'discrepancy', 'operatorId'],
      additionalProperties: false,
    },
  },
);

// --- End Conversation Tool (reuse) ---
const endConversation = tool(
  async (input: any) => {
    console.log('[endConversation] Tool invoked with input:', input);
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

export default [fetchAircraft, submitSquawk, endConversation];
