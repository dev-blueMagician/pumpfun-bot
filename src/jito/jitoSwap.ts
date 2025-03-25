import {
  LAMPORTS_PER_SOL,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { TOKEN_DECIMALS } from "../utils/constants";
import { sleepTime } from "../utils/utils";
import { JitoBundleService } from "./jito.service";
import {
  BotConfig,
  connection,
  TxnConfig,
  user_keypair,
  stakedConnection,
} from "../../config";
import {
  AmountsParam,
  BuyInsParam,
  SellInsParam,
  SwapParams,
} from "../utils/types";
import {
  getBuyInstruction,
  getJitoTipInstruction,
  getSellInstruction,
  getSignature,
  getSplOut,
} from "../utils/pumpfun";
import { getLastValidBlockhash } from "../utils/getBlock";
import { moniterTrading } from "../utils/geyser";
import { getTxnResult } from "../utils/getTxnResult";
import { checkTPSL } from "../utils/checkTPSL";
import { ParsedTransaction } from "@solana/web3.js";
import { ParsedTransactionWithMeta } from "@solana/web3.js";

const sendBundle = async (
  instructions: TransactionInstruction[],
  retry: boolean = false,
  retryAttempts: number = 0
): Promise<{ result: boolean; signature: string | null } | undefined> => {
  const blockhash = getLastValidBlockhash();
  if (!blockhash) {
    console.error("Failed to retrieve blockhash from cache");
    return { result: false, signature: null };
  }
  // console.log("blockhash", blockhash);
  const messageV0 = new TransactionMessage({
    payerKey: user_keypair.publicKey,
    instructions,
    recentBlockhash: blockhash,
  }).compileToV0Message();

  const vTxn = new VersionedTransaction(messageV0);
  vTxn.sign([user_keypair]);

  // const res = await connection.simulateTransaction(vTxn);
  // if (res.value.err) {
  //   console.log("Simulate Error: ", res.value.err, res.value.logs);
  //   return { result: false, signature: null };
  // }
  const signature = getSignature(vTxn);
  const rawTxn = vTxn.serialize();
  const jitoBundleService = new JitoBundleService();
  // console.log("* Sent txn:", Date.now());
  const bundleId = await jitoBundleService.sendBundle(rawTxn);
  const isConfirmed = await getTxnResult(signature);
  if (isConfirmed) return { result: true, signature: signature };
  else {
    if (retry && retryAttempts < 3) {
      console.log("Retrying transaction...");
      return await sendBundle(instructions, true, retryAttempts + 1);
    } else return { result: false, signature: null };
  }
};

export const jitoSniper = async (swapData: SwapParams) => {
  const ca = swapData.mint.toBase58();
  // console.log(`- Starting buy/sell https://solscan.io/token/${ca}...`);
  const startTime = Date.now();

  const solIn = BotConfig.SnipeAmount;
  const maxSol = Math.floor(solIn * (1 + TxnConfig.Slippage / 100));
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
  const buyParam: BuyInsParam = {
    mint: swapData.mint,
    owner: user_keypair.publicKey,
    bondingCurve: swapData.bondingCurve,
    associatedBondingCurve: swapData.associatedBondingCurve,
    maxSol,
    splOut,
  };
  const buyInstructions: TransactionInstruction[] = getBuyInstruction(buyParam);
  buyInstructions.push(
    getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Buy)
  );

  const isBought = await sendBundle(buyInstructions, true, 3);
  if (isBought && isBought.result) {
    const endTime = Date.now();
    const timeTaken = endTime - startTime;

    if (!isBought.signature) return;
    let buyTx: ParsedTransactionWithMeta | null = null,
      retries = 1000,
      delay = 100;
    for (let attempt = 0; attempt <= retries; attempt++) {
      buyTx = await stakedConnection.getParsedTransaction(isBought.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (buyTx) {
        break;
      }
      // await sleepTime(delay);
    }

    if (!buyTx) {
      console.error("Failed to retrieve transaction details.");
      return;
    }

    // console.log(`Buy txn: https://solscan.io/tx/${isBought.signature}`);
    const usedSol =
      Number(buyTx.meta?.postBalances[3]) - Number(buyTx.meta?.preBalances[3]);
    console.log(
      `   Buy ${Number(splOut / TOKEN_DECIMALS).toFixed(2)} => ${
        usedSol / LAMPORTS_PER_SOL
      } SOL. Slippage: ${Number(
        (usedSol / solIn) * 100 - 100).toFixed(2)
      }%, Time: ${timeTaken} ms https://dexscreener.com/solana/${ca}?maker=${user_keypair.publicKey.toBase58()}`
    );
    // console.log(`Checking TPSL for ${ca}...`);
    checkTPSL(
      buyParam.bondingCurve.toBase58(),
      (usedSol / splOut) * (TOKEN_DECIMALS / LAMPORTS_PER_SOL),
      endTime
    ).then(async (result) => {
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
      sellInstructions.push(
        getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell)
      );
      const success = await sendBundle(sellInstructions, true);
      console.log(
        `${
          success ? "   Sold" : "❌ Failed selling"
        }, https://dexscreener.com/solana/${ca}?maker=${user_keypair.publicKey.toBase58()}`
      );
    });

    // // sell function
    // const sellBoughtTokens = async () => {
    //   let sellAll = false;
    //   if (BotConfig.CheckBuy || BotConfig.CheckDevSell)
    //     sellAll = await moniterTrading(
    //       swapData,
    //       BotConfig.CheckDevSell,
    //       BotConfig.CheckBuy,
    //       BotConfig.CheckBuyAmount,
    //       BotConfig.MaxWaitTime
    //     );
    //   if (sellAll) {
    //     const splIn = splOut;
    //     const sellParam: SellInsParam = {
    //       mint: swapData.mint,
    //       owner: user_keypair.publicKey,
    //       bondingCurve: swapData.bondingCurve,
    //       associatedBondingCurve: swapData.associatedBondingCurve,
    //       splIn,
    //     };
    //     const sellInstructions: TransactionInstruction[] = getSellInstruction(
    //       sellParam,
    //       true
    //     );
    //     sellInstructions.push(
    //       getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell)
    //     );
    //     const success = await sendBundle(sellInstructions, true);
    //     console.log(`${success ? "✅ Sold" : "❌ Failed selling"} 100%, ${ca}`);
    //   } else {
    //     let splBal = splOut;
    //     for (const condition of BotConfig.SellSteps) {
    //       const closeAta =
    //         condition.amount ===
    //         BotConfig.SellSteps[BotConfig.SellSteps.length - 1].amount;
    //       let splIn = Math.floor(condition.amount * splOut);
    //       if (closeAta) splIn = splBal;
    //       splBal -= splIn;
    //       const sellParam: SellInsParam = {
    //         mint: swapData.mint,
    //         owner: user_keypair.publicKey,
    //         bondingCurve: swapData.bondingCurve,
    //         associatedBondingCurve: swapData.associatedBondingCurve,
    //         splIn,
    //       };
    //       const sellInstructions: TransactionInstruction[] = getSellInstruction(
    //         sellParam,
    //         closeAta
    //       );

    //       sellInstructions.push(
    //         getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell)
    //       );
    //       await sleepTime(condition.delay);
    //       const success = await sendBundle(sellInstructions, true);
    //       console.log(
    //         `${success ? "✅ Sold" : "❌ Failed selling"} ${
    //           condition.amount * 100
    //         } %, ${ca}`
    //       );
    //     }
    //   }
    // };
    // if (BotConfig.KeepBuy) {
    //   console.log(` Keep buy`);
    //   sellBoughtTokens(); // if keep buy, don't wait to sell.
    // } else {
    //   await sellBoughtTokens(); // if not keep buy, wait to sell.
    // }
  } else {
    console.error(`⚠️ Failed to buy token ${ca}, retry purchase.`);
  }
};
