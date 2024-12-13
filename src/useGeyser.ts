import WebSocket from "ws";
import { BotConfig, GEYSER_URL, TxnConfig, TxnMode } from "../config";
import { PUMP_FUN_PROGRAM } from "./utils/constants";
import { PublicKey } from "@solana/web3.js";
import { jitoSniper } from "./jito/jitoSwap";
import { bloxRouteSniper } from "./bloxroute/bloxRouteSwap";
import { SwapParams } from "./utils/types";
import { sendWsRequest, startWsPing } from "./utils/geyser";
import { pumpfunSniper } from "./pumpfun/pumpfunSwap";

export function useGeyser() {
  const ws = new WebSocket(GEYSER_URL);
  ws.on("open", function open() {
    console.log("WebSocket is open");
    sendWsRequest(ws, [PUMP_FUN_PROGRAM.toBase58()]); // Send a request once the WebSocket is open
    startWsPing(ws); // Start sending pings
  });

  let swapAvailable = true;
  ws.on("message", async function incoming(data) {
    try {
      
      const receivedTime = Date.now(); // Log the time when data is received from Geyser
      const messageStr = data.toString("utf8");
      const messageObj = JSON.parse(messageStr);
      const metaLog = messageObj?.params?.result?.transaction?.meta;
      const isCreatTxn = (metaLog?.logMessages && metaLog?.logMessages.some((log: any) => log.includes('Program log: Instruction: InitializeMint2')));
      if (swapAvailable && isCreatTxn) {

        const accountKeys =
          messageObj?.params?.result?.transaction?.transaction?.message?.instructions?.find(
            (ix: any) => ix.programId.toString() === PUMP_FUN_PROGRAM.toBase58()
          )?.accounts as string[];
        if (accountKeys) {
          const signature = messageObj?.params?.result?.signature;
          console.log(
            `\n* Received signature: https://solscan.io/tx/${signature}`
          );
          const mint = new PublicKey(accountKeys[0]);
          const bondingCurve = new PublicKey(accountKeys[2]);
          const associatedBondingCurve = new PublicKey(accountKeys[3]);
          const user = new PublicKey(accountKeys[7]);          
          const solSpent = Number(metaLog?.preBalances[0] - metaLog?.postBalances[0]);
          const splBought =
            Number(metaLog?.postTokenBalances[1]?.uiTokenAmount?.amount);

          const swapParam: SwapParams = {
            mint,
            user,
            bondingCurve,
            associatedBondingCurve,
            solSpent,
            splBought,
          };
          // console.log({ swapParam });
          const beforeSwapTriggerTime = Date.now(); // Log the time before triggering the swap

          if (solSpent < BotConfig.SnipeAt.Max && solSpent > BotConfig.SnipeAt.Min) {
            console.log("- Received signal:", receivedTime);
            swapAvailable = false;
            if (TxnConfig.TxnType === TxnMode.BloxRoute) {
              await bloxRouteSniper(swapParam); // Trigger swap using bloxroute
            } else if (TxnConfig.TxnType === TxnMode.Jito) {
              await jitoSniper(swapParam); // Trigger swap using jito
            } else{
              await pumpfunSniper(swapParam); // Trigger swap using pumpfun
            }
          }

          console.log(
            `Time from receiving data to triggering swap: ${
              beforeSwapTriggerTime - receivedTime
            }ms`, Date.now()
          );

          swapAvailable = true;
        }
      }
    } catch (e) {
      console.error("Failed to parse JSON:", e);
    }
  });

  ws.on("error", function error(err) {
    console.error("WebSocket error:", err);
  });

  ws.on("close", function close() {
    console.log("WebSocket is closed");
  });
}
