import { SwapParams } from "./types";
import { PUMP_FUN_PROGRAM } from "./constants";
import { GEYSER_URL } from "../../config";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import WebSocket from "ws";

export const PING_INTERVAL_MS = 30_000; // 30s

export function sendWsRequest(ws: WebSocket, accounts: string[]) {
  const request = {
    jsonrpc: "2.0",
    id: 420,
    method: "transactionSubscribe",
    params: [
      {
        vote: false,
        failed: false,
        accountRequired: accounts,
      },
      {
        commitment: "processed",
        encoding: "jsonParsed",
        transactionDetails: "full",
        showRewards: false,
        maxSupportedTransactionVersion: 0,
      },
    ],
  };
  ws.send(JSON.stringify(request));
}

export function startWsPing(ws: WebSocket) {
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
      console.log("Ping sent");
    }
  }, PING_INTERVAL_MS); // Ping every 30 seconds
}

export async function moniterTrading(
  swapData: SwapParams,
  checkDevSell: boolean,
  checkBuy: boolean,
  checkBuyAmount: number,
  max_t: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log("Timeout reached. Closing WS");
      ws.close();
      resolve(false);
    }, max_t);

    const accounts = [swapData.mint.toBase58(), PUMP_FUN_PROGRAM.toBase58()];

    let totalSolSpent = 0;

    const ws = new WebSocket(GEYSER_URL);
    ws.on("open", function open() {
      console.log("WebSocket is open");
      sendWsRequest(ws, accounts); // Send a request once the WebSocket is open
      startWsPing(ws); // Start sending pings
    });

    ws.on("message", async function incoming(data) {
      try {
        const messageStr = data.toString("utf8");
        const messageObj = JSON.parse(messageStr);

        const accountKeys =
          messageObj?.params?.result?.transaction?.transaction?.message?.instructions?.find(
            (ix: any) => ix.programId.toString() === PUMP_FUN_PROGRAM.toBase58()
          )?.accounts as string[];

        if (accountKeys) {
          const signature = messageObj?.params?.result?.signature;
          // console.log(
          //   `\n* Received signature: https://solscan.io/tx/${signature}`
          // );
          const mint = accountKeys[2];
          const user = accountKeys[6];
          const metaLog = messageObj?.params?.result?.transaction?.meta;
          const solSpent = metaLog?.preBalances[0] - metaLog?.postBalances[0];
          const isBuy = metaLog.logMessages.some((log: any) =>
            log.includes("Buy")
          );

          if (checkBuy && isBuy && mint === swapData.mint.toBase58()) {
            totalSolSpent += solSpent;
            if (totalSolSpent > checkBuyAmount) {
              console.log(
                " Buy amount reached. Closing WS",
                totalSolSpent / LAMPORTS_PER_SOL,
                signature
              );
              clearTimeout(timeout);
              ws.close();
              resolve(true);
            }
          }
          if (
            checkDevSell &&
            !isBuy &&
            user === swapData.user.toBase58() &&
            mint === swapData.mint.toBase58()
          ) {
            console.log(
              `* Found Dev sell: signature: https://solscan.io/tx/${signature}`
            );
            clearTimeout(timeout);
            ws.close();
            resolve(true);
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
  });
}

// export async function moniterDev(
//   swapData: SwapParams,
//   max_t: number
// ): Promise<boolean> {
//   return new Promise((resolve) => {
//     const timeout = setTimeout(() => {
//       console.log("Timeout reached. Closing WS");
//       ws.close();
//       resolve(false);
//     }, max_t);

//     const accounts = [
//       swapData.mint.toBase58(),
//       swapData.user.toBase58(),
//       PUMP_FUN_PROGRAM.toBase58(),
//     ];

//     const ws = new WebSocket(GEYSER_URL);
//     ws.on("open", function open() {
//       console.log("WebSocket is open");
//       sendWsRequest(ws, accounts); // Send a request once the WebSocket is open
//       startWsPing(ws); // Start sending pings
//     });

//     ws.on("message", async function incoming(data) {
//       try {
//         const messageStr = data.toString("utf8");
//         const messageObj = JSON.parse(messageStr);

//         const accountKeys =
//           messageObj?.params?.result?.transaction?.transaction?.message?.instructions?.find(
//             (ix: any) => ix.programId.toString() === PUMP_FUN_PROGRAM.toBase58()
//           )?.accounts as string[];

//         if (accountKeys) {
//           const signature = messageObj?.params?.result?.signature;
//           // console.log(
//           //   `* waiting dev's selling: signature: https://solscan.io/tx/${signature}`
//           // );
//           const logMsgs =
//             messageObj?.params?.result?.transaction?.meta?.logMessages;
//           const isBuy = logMsgs.some((log: any) => log.includes("Sell"));
//           const mint = accountKeys[2];
//           const user = accountKeys[6];
//           if (
//             !isBuy &&
//             user === swapData.user.toBase58() &&
//             mint === swapData.mint.toBase58()
//           ) {
//             console.log(
//               `* Found Dev sell: signature: https://solscan.io/tx/${signature}`
//             );
//             clearTimeout(timeout);
//             ws.close();
//             resolve(true);
//           }
//         }
//       } catch (e) {
//         console.error("Failed to parse JSON:", e);
//       }
//     });

//     ws.on("error", function error(err) {
//       console.error("WebSocket error:", err);
//     });

//     ws.on("close", function close() {
//       console.log("WebSocket is closed");
//     });
//   });
// }
