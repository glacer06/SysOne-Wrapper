// Deliberate boundary violation: in live mode only live/transport.ts may import the SDK transport
// (ADR-020). Every other live file goes through transport.ts.
// This folder is excluded from lint, typecheck, test and build.
// packages/config/test/boundaries.test.ts lints this file on purpose and expects an error.
import { SdkTransport } from "@bandwise/system-one-client";

export const leakedSdkTransport = SdkTransport;
