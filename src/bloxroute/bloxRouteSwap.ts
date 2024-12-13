import {
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_DECIMALS,
} from "../utils/constants";
import { sleepTime } from "../utils/utils";
import {
  createTraderAPIMemoInstruction,
  HttpProvider,
  MAINNET_API_NY_HTTP,
} from "@bloxroute/solana-trader-client-ts";
import {
  BLOX_AUTH_HEADER,
  BotConfig,
  TxnConfig,
  user_keypair,
} from "../../config";
import { getLastValidBlockhash } from "../utils/getBlock";
import { getTxnResult } from "../utils/getTxnResult";
import {
  AmountsParam,
  BuyInsParam,
  SellInsParam,
  SwapParams,
} from "../utils/types";
import {
  getBloxRouteTipInstruction,
  getBuyInstruction,
  GetComputeUnitePriceInstruction,
  GetComputeUnitLimitInstruction,
  getSellInstruction,
  getSplOut,
} from "../utils/pumpfun";
import { HttpsAgent } from "agentkeepalive";
import { moniterTrading } from "../utils/geyser"; // RESTORED IMPORTS
import base58 from "bs58";


const PRIVATE_KEY = base58.encode(user_keypair.secretKey);
const httpsAgent = new HttpsAgent({
  keepAlive: true,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 60000,
  freeSocketTimeout: 30000,
});

const provider = new HttpProvider(
  BLOX_AUTH_HEADER,
  PRIVATE_KEY,
  MAINNET_API_NY_HTTP,
  { httpsAgent }
);

// Critical memo for the transaction
const memo = createTraderAPIMemoInstruction("");

const send2BloxRoute = async (
  instructions: TransactionInstruction[],
  retry: boolean = false,
  retryAttempts: number = 0
): Promise<boolean> => {
  // Get the prefetched blockhash
  const blockhash = getLastValidBlockhash(); 
  if (!blockhash) {
    console.error("Failed to retrieve blockhash from cache");
    return false;
  }

  // Prepare the instructions for BloxRoute
  const bloxRouteInstruction = [
    GetComputeUnitLimitInstruction(TxnConfig.Units),
    GetComputeUnitePriceInstruction(TxnConfig.Microlamports),
    ...instructions,
    memo, // Memo is important, so we keep it
  ];

  const messageV0 = new TransactionMessage({
    payerKey: user_keypair.publicKey,
    instructions: bloxRouteInstruction,
    recentBlockhash: blockhash, // Use the cached blockhash
  }).compileToV0Message();

  const vTxn = new VersionedTransaction(messageV0);
  vTxn.sign([user_keypair]);

  const serializedTx = vTxn.serialize();
  const encodedTxn = Buffer.from(serializedTx).toString("base64");

  try {
    // Submit the transaction to BloxRoute
    console.log("* Sent txn:", Date.now());
    const response = await provider.postSubmit({
      transaction: { content: encodedTxn, isCleanup: false },
      frontRunningProtection: false,
      useStakedRPCs: true,
      skipPreFlight: true,
    });
    const sig = response.signature;
    console.log(`* Bloxroute txn: https://solscan.io/tx/${sig}`);

    // Wait for the transaction result
    return await getTxnResult(sig);
  } catch (e) {
    console.error("Error while sending bloxroute txn:", e);

    // Retry logic (retry a max of 3 times)
    if (retry && retryAttempts < 3) {
      console.log("Retrying transaction...");
      return await send2BloxRoute(instructions, true, retryAttempts + 1);
    }

    return false;
  }
};

// The main sniper function
export const bloxRouteSniper = async (swapData: SwapParams) => {
  const ca = swapData.mint.toBase58();
  console.log(`Starting buy/sell for token: https://solscan.io/token/${ca}`);
  const startTime = Date.now();

  // Define the amount of SOL input
  const solIn = BotConfig.SnipeAmount;
  const maxSol = Math.floor(solIn * (1 + TxnConfig.Slippage / 100));
  // Calculate token output (splOut) based on given amounts
  const amounts: AmountsParam = {
    solSpent: swapData.solSpent,
    splBought: swapData.splBought,
    solIn,
  };
  const splOut = getSplOut(amounts);

  // Early return if splOut is less than or equal to 0
  if (splOut <= 0) {
    console.log("Not enough tokens to buy, aborting...");
    return false;
  }

  // Prepare the buy parameters
  const buyParam: BuyInsParam = {
    mint: swapData.mint,
    owner: user_keypair.publicKey,
    bondingCurve: swapData.bondingCurve,
    associatedBondingCurve: swapData.associatedBondingCurve,
    maxSol,
    splOut,
  };

  // Prepare buy instructions
  const buyInstructions: TransactionInstruction[] = getBuyInstruction(buyParam);
  buyInstructions.push(getBloxRouteTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Buy)); // Add the buy tip instruction

  // Attempt to send the buy transaction
  const isBought = await send2BloxRoute(buyInstructions, true); // Retry enabled

  if (isBought) {
    const endTime = Date.now();
    const timeTaken = endTime - startTime;
    console.log(
      `🎉 Successfully bought ${splOut / TOKEN_DECIMALS} tokens for ${
        solIn / LAMPORTS_PER_SOL
      } SOL. Time taken: ${timeTaken} ms`
    );

    // sell function
    const sellBoughtTokens = async () => {
      let sellAll = false;
      if (BotConfig.CheckBuy || BotConfig.CheckDevSell)
        sellAll = await moniterTrading(swapData, BotConfig.CheckDevSell, BotConfig.CheckBuy, BotConfig.CheckBuyAmount, BotConfig.MaxWaitTime);
      if(sellAll){
        const splIn = splOut;
        const sellParam: SellInsParam = {
          mint: swapData.mint,
          owner: user_keypair.publicKey,
          bondingCurve: swapData.bondingCurve,
          associatedBondingCurve: swapData.associatedBondingCurve,
          splIn,
        };
        const sellInstructions: TransactionInstruction[] = getSellInstruction(
          sellParam,
          true
        );
        sellInstructions.push(getBloxRouteTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell)); // Add the buy tip instruction
        const success = await send2BloxRoute(sellInstructions, true);
        console.log(
          `${success ? "✅ Sold" : "❌ Failed selling"} 100%, ${ca}`
        );
      }else{
        let splBal = splOut;
        for (let i = 0; i < BotConfig.SellSteps.length; i++) {
          const condition = BotConfig.SellSteps[i];
          const closeAta = i === BotConfig.SellSteps.length - 1;
          let splIn = Math.floor(condition.amount * splOut);
          if (closeAta) splIn = splBal;
          splBal -= splIn;
          const sellParam: SellInsParam = {
            mint: swapData.mint,
            owner: user_keypair.publicKey,
            bondingCurve: swapData.bondingCurve,
            associatedBondingCurve: swapData.associatedBondingCurve,
            splIn,
          };
          const sellInstructions: TransactionInstruction[] = getSellInstruction(
            sellParam,
            closeAta
          );
          sellInstructions.push(getBloxRouteTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell)); // Add the buy tip instruction
          await sleepTime(condition.delay);
          const success = await send2BloxRoute(sellInstructions, true);
          console.log(
            `${success ? "✅ Sold" : "❌ Failed selling"} ${
              condition.amount * 100
            } %, ${ca}`
          );
        }
      }
    }
    if (BotConfig.KeepBuy) {
      console.log(` Keep buy`);
      sellBoughtTokens(); // if keep buy, don't wait to sell.
    } else {
      await sellBoughtTokens(); // if not keep buy, wait to sell.
    }
  } else {
    console.error(`⚠️ Failed to buy token ${ca}. Skipping this token.`);
  }
};
