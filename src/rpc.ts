import { Rpc } from "@opencode/plugin/rpc";
import { z } from "zod";
import { accountPreferenceSchema, snapshotSchema } from "./quota/types.js";

export const QuotaDock = Rpc.define({
  id: "quota-dock",
  methods: {
    diagnostics: { input: z.object({}), output: z.object({ activeAccountRef: z.string().nullable(), accounts: z.array(z.object({ accountRef: z.string(), kind: z.string(), metadataKeys: z.array(z.string()), authClaimKeys: z.array(z.string()) })) }) },
    snapshot: { input: z.object({}), output: snapshotSchema },
    refresh: { input: z.object({ accountRef: z.string().max(100).optional() }), output: snapshotSchema },
    preferences: {
      input: z.object({ accountRef: z.string().max(100).optional(), account: accountPreferenceSchema.optional(), sort: z.enum(["name", "remaining"]).optional() }),
      output: snapshotSchema,
    },
    visibility: { input: z.object({ clientId: z.string().min(1).max(100), visible: z.boolean() }), output: z.object({ ok: z.boolean() }) },
  },
  events: { updated: { schema: z.object({ revision: z.number() }) } },
});
