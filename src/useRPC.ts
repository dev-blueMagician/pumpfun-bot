import { Connection, PublicKey } from "@solana/web3.js";
import {
  WEBSOCKET_URL,
  RPC_URL,
  TxnMode,
  TxnConfig,
  BotConfig,
  SignalMode,
} from "../config";
import { SwapParams } from "./utils/types";
import { PUMP_FUN_PROGRAM } from "./utils/constants";
import { bloxRouteSniper } from "./bloxroute/bloxRouteSwap";
import { jitoSniper } from "./jito/jitoSwap";
import { pumpfunSniper } from "./pumpfun/pumpfunSwap";
import base58 from "bs58";
import { Metaplex } from "@metaplex-foundation/js";

export async function useRPC() {
  const connection = new Connection(RPC_URL, { wsEndpoint: WEBSOCKET_URL });
  let swapAvailable = true;
  try {
    connection.onLogs(
      new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
      async ({ logs, err, signature }) => {
        if (err) return;
        if (
          logs &&
          logs.some((log) =>
            log.includes("Program log: Instruction: InitializeMint2")
          )
        ) {
          console.log(`🎉 Found new mint: https://solscan.io/tx/${signature}`);
          const instructionName = "MAINNET_PROGRAM_ID.AmmV4.toString()";
          const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed",
          });

          try {
            const accountsList: any = tx?.transaction.message.accountKeys.map(
              (acc: any) => {
                const accountKey = acc.pubkey as PublicKey;
                return accountKey.toBase58();
              }
            );

            const mint = new PublicKey(accountsList[1]);
            const bondingCurve = new PublicKey(accountsList[2]);
            const associatedBondingCurve = new PublicKey(accountsList[3]);
            const user = new PublicKey(accountsList[0]);

            //@ts-ignore
            const solSpent = Number(tx?.meta?.preBalances[0] - tx?.meta?.postBalances[0]);
            //@ts-ignore
            const splBought = Number(tx?.meta?.postTokenBalances[1]?.uiTokenAmount?.amount);
            
            const swapParam: SwapParams = {
                mint,
                user,
                bondingCurve,
                associatedBondingCurve,
                solSpent,
                splBought,
            };
            console.table(swapParam);
            const metplex = new Metaplex(connection);
            const metadata = await metplex.nfts().findByMint({mintAddress: mint});
            console.log(metadata);

              if (
                solSpent <= BotConfig.SnipeAt.Max &&
                solSpent >= BotConfig.SnipeAt.Min
              ) {
                swapAvailable = false;
                if (TxnConfig.TxnType === TxnMode.BloxRoute) {
                  // await bloxRouteSniper(swapParam); // Trigger swap using bloxroute
                } else if (TxnConfig.TxnType === TxnMode.Jito) {
                  // await jitoSniper(swapParam); // Trigger swap using jito
                } else {
                  // await pumpfunSniper(swapParam); // Trigger swap using pumpfun
                }
                swapAvailable = true;
              }
            } catch(e) {
              console.log("Error in log: ", e);
            }
        }
      },
      "confirmed"
    );
  } catch (e) {
    console.log("Error in log: ", e);
  }

  // const swapParam: SwapParams = {
  //     mint,
  //     user,
  //     bondingCurve,
  //     associatedBondingCurve,
  //     solSpent,
  //     splBought,
  // };
}
