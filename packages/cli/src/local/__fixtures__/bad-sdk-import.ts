// Deliberate boundary violation: `bandwise run --local` must never import the SDK transport.
// Local mode takes only @bandwise/system-one-client/fixture, which never loads @typesafe-ai/sdk.
// This folder is excluded from lint, typecheck, test and build.
// packages/config/test/boundaries.test.ts lints this file on purpose and expects an error.
import { SdkTransport } from "@bandwise/system-one-client";

export const leakedSdkTransport = SdkTransport;
