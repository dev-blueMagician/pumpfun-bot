import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "@triton-one/yellowstone-grpc";
import { BotConfig, GRPC_URL, TxnConfig, TxnMode, X_TOKEN } from "../config";
import { PUMP_FUN_PROGRAM, MINT_AUTHORITY } from "./utils/constants";
import { PublicKey } from "@solana/web3.js";
import { SwapParams } from "./utils/types";
import { bloxRouteSniper } from "./bloxroute/bloxRouteSwap";
import { jitoSniper } from "./jito/jitoSwap";
import { pumpfunSniper } from "./pumpfun/pumpfunSwap";
import base58 from "bs58";

import { checkTPSL } from "./utils/checkTPSL";

const PING_INTERVAL_MS = 10_000; // 10s

export async function usegRPC() {
  const client = new Client(GRPC_URL, undefined, undefined
  //   {
  //   "grpc.max_receive_message_length": 64 * 1024 ** 2, // Reduce if possible
  // }
);

  const stream = await client.subscribe();

  const streamClosed = new Promise<void>((resolve, reject) => {
    stream.on("error", (error) => {
      reject(error);
      stream.end();
    });
    stream.on("end", resolve);
    stream.on("close", resolve);
  });

  let swapAvailable = true;

  stream.on("data", async (data) => {
    try {
      if (!data?.transaction?.transaction) return;
      const receivedTime = Date.now();
      const metaLog = data?.transaction?.transaction?.meta;
      const txn = data?.transaction?.transaction?.transaction;
      // const isCreatTxn = (metaLog?.logMessages && metaLog?.logMessages.some((log: any) => log.includes('Program log: Instruction: InitializeMint2')));
      // if (isCreatTxn && txn && swapAvailable) {
      const accountList = txn.message.accountKeys.map((acc: any) =>
        base58.encode(Buffer.from(acc))
      );
      const pumpfun_programIdIndex = accountList.findIndex(
        (acc: any) => acc === PUMP_FUN_PROGRAM.toBase58()
      );
      const ins = txn.message.instructions;
      const accountsData = ins.find(
        (instruction: any) =>
          instruction.programIdIndex === pumpfun_programIdIndex
      );
      if (!accountsData) {
        console.log("No account data found in transaction");
        return;
      }
      const accountsRealData = Array.from(accountsData.accounts)
        .map((account: any) => base58.encode(Buffer.from([account])))
        .map((accId) => accountList[Number(accId) - 1]);

      const mint = new PublicKey(accountsRealData[0]);
      const bondingCurve = new PublicKey(accountsRealData[2]);
      const associatedBondingCurve = new PublicKey(accountsRealData[3]);
      const user = new PublicKey(accountsRealData[7]);
      const solSpent = Number(metaLog.preBalances[0] - metaLog.postBalances[0]);
      const splBought = Number(
        metaLog.postTokenBalances[1]?.uiTokenAmount?.amount
      );

      const swapParam: SwapParams = {
        mint,
        user,
        bondingCurve,
        associatedBondingCurve,
        solSpent,
        splBought,
      };


      const beforeSwapTriggerTime = Date.now();

      if (
        solSpent <= BotConfig.SnipeAt.Max &&
        solSpent >= BotConfig.SnipeAt.Min
      ) {
        console.log("- Received signal:", receivedTime);
        swapAvailable = false;
        if (TxnConfig.TxnType === TxnMode.BloxRoute) {
          await bloxRouteSniper(swapParam); // Trigger swap using bloxroute
        } else if (TxnConfig.TxnType === TxnMode.Jito) {
          await jitoSniper(swapParam); // Trigger swap using jito
        } else {
          await pumpfunSniper(swapParam); // Trigger swap using pumpfun
        }
        swapAvailable = true;
      }

      setTimeout(() => {
        console.log(
          `* Time from receiving data to triggering swap: ${
            beforeSwapTriggerTime - receivedTime
          }ms`,
          Date.now()
        );
      }, 0);
      // }
    } catch (error) {
      console.error(error);
    }
  });

  const slotRequest: SubscribeRequest = {
    slots: {
      //slot: { filterByCommitment: true },
    },
    commitment: CommitmentLevel.PROCESSED,
    transactions: {
      pumpfun: {
        accountInclude: [], // Include this even if empty
        accountExclude: [], // Include this even if empty
        accountRequired: [MINT_AUTHORITY.toBase58()],
      },
    },
    accounts: {}, // Required but unused
    accountsDataSlice: [], // Required but unused
    transactionsStatus: {}, // Required but unused
    blocks: {}, // Required but unused
    blocksMeta: {}, // Required but unused
    entry: {}, // Required but unused
  };

  stream.write(slotRequest);

  const pingRequest: SubscribeRequest = {
    ping: { id: 1 },
    accounts: {}, // Required but unused
    accountsDataSlice: [], // Required but unused
    transactions: {}, // Required but unused
    transactionsStatus: {}, // Required but unused
    blocks: {}, // Required but unused
    blocksMeta: {}, // Required but unused
    entry: {}, // Required but unused
    slots: {}, // Required but unused
  };

  setInterval(() => {
    stream.write(pingRequest, (err: any) => {
      if (err) console.error(err);
    });
  }, PING_INTERVAL_MS);

  await streamClosed;
}
