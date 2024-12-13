import { Keypair } from "@solana/web3.js";
import { Bundle as JitoBundle } from "jito-ts/dist/sdk/block-engine/types.js";

import {
  SearcherClient,
  searcherClient as jitoSearcherClient,
} from "jito-ts/dist/sdk/block-engine/searcher.js";
import { VersionedTransaction } from "@solana/web3.js";
import axios from "axios";
import * as fs from "fs";

const BLOCK_ENGINE_URL = "frankfurt.mainnet.block-engine.jito.wtf";
const decodedKey = new Uint8Array(
  JSON.parse(fs.readFileSync("./blockengine.json").toString()) as number[]
);
const keypair = Keypair.fromSecretKey(decodedKey);
const client: SearcherClient = jitoSearcherClient(BLOCK_ENGINE_URL, keypair, {
  "grpc.keepalive_timeout_ms": 4000,
});

export async function sendJitoBundle(bundledTxns: VersionedTransaction[]) {
  try {
    const bundleId = await client.sendBundle(
      new JitoBundle(bundledTxns, bundledTxns.length)
    );

    console.log(bundleId);

    const isSucceed = await getBundleStatus(bundleId);
    if (isSucceed) {
      console.log(
        "🎉 JitoTransaction confirmed!",
        `https://explorer.jito.wtf/bundle/${bundleId}`
      );
      return true;
    } else {
      console.log(
        "JitoTransaction failed!",
        `https://explorer.jito.wtf/bundle/${bundleId}`
      );
      return false;
    }
  } catch (error) {
    // const err = error as any;

    // if (err?.message?.includes("Bundle Dropped, no connected leader up soon")) {
    //   console.error(
    //     "Error sending bundle: Bundle Dropped, no connected leader up soon."
    //   );
    // } else {
    console.error("An unexpected error occurred:", error);
    // }

    process.exit(1);
  }
}

async function getBundleStatus(bundleId: string) {
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "getBundleStatuses",
    params: [[bundleId]],
  };

  let retries = 0;
  const MAX_CHECK_JITO = 40;
  while (retries < MAX_CHECK_JITO) {
    try {
      retries++;
      const jitoURL = `https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles`; // ?uuid=${JITO_UUID}

      const response = await axios.post(jitoURL, payload, {
        headers: { "Content-Type": "application/json" },
      });

      if (!response || response.data.result.value.length <= 0) {
        // await sleepTime(1000);
        continue;
      }

      const bundleResult = response.data.result.value[0];
      if (
        bundleResult.confirmation_status === "processed" ||
        bundleResult.confirmation_status === "confirmed" ||
        bundleResult.confirmation_status === "finalized"
      ) {
        retries = 0;
        break;
      }
    } catch (error) {
      // console.error("GetBundleStatus Failed");
    }
  }
  if (retries === 0) return true;
  return false;
}
