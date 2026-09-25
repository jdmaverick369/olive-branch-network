import test from "node:test";
import assert from "node:assert/strict";
import { CdpClient } from "@coinbase/cdp-sdk";
import { disableSubmissionRetries } from "./transport.mjs";

test("installed CDP transport never hides network retries from the submission journal", async () => {
  new CdpClient({apiKeyId:"test",apiKeySecret:"test",walletSecret:"test"});
  const client = await disableSubmissionRetries();
  let attempts = 0;
  // Stub only authentication; retain the actual axios retry response interceptor.
  client.interceptors.request.clear();
  client.defaults.adapter = async config => {
    attempts++;
    const error = Object.assign(new Error("connection reset"), {code:"ECONNRESET",config,isAxiosError:true});
    throw error;
  };
  await assert.rejects(client.post("/test",{}), /connection reset/);
  assert.equal(attempts,1);
});
