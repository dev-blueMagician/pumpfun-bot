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

const sendBundle = async (
  instructions: TransactionInstruction[],
  retry: boolean = false,
  retryAttempts: number = 0
): Promise<boolean> => {
  const blockhash = getLastValidBlockhash();
  if (!blockhash) {
    console.error("Failed to retrieve blockhash from cache");
    return false;
  }
  console.log("blockhash", blockhash);
  const messageV0 = new TransactionMessage({
    payerKey: user_keypair.publicKey,
    instructions,
    recentBlockhash: blockhash,
  }).compileToV0Message();

  const vTxn = new VersionedTransaction(messageV0);
  vTxn.sign([user_keypair]);

  const res = await connection.simulateTransaction(vTxn);
  if(res.value.err){
    console.log("Simulate Error: ", res.value.err, res.value.logs);
    return false;
  }
  const signature = getSignature(vTxn);
  const rawTxn = vTxn.serialize();
  const jitoBundleService = new JitoBundleService();
  console.log("* Sent txn:", Date.now());
  const bundleId = await jitoBundleService.sendBundle(rawTxn);
  const isConfirmed = await getTxnResult(signature);
  if (isConfirmed) return true;
  else {
    if (retry && retryAttempts < 3) {
      console.log("Retrying transaction...");
      return await sendBundle(instructions, true, retryAttempts + 1);
    }
    else return false;
  }
};

export const jitoSniper = async (swapData: SwapParams) => {
  const ca = swapData.mint.toBase58();
  console.log(`- Starting buy/sell https://solscan.io/token/${ca}...`);
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
  buyInstructions.push(getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Buy));

  const isBought = await sendBundle(buyInstructions);
  if (isBought) {
    console.log(
      `🎉 bought token ${splOut / TOKEN_DECIMALS}, ${
        solIn / LAMPORTS_PER_SOL
      } SOL ${ca}`
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
        sellInstructions.push(getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell));
        const success = await sendBundle(sellInstructions, true);
        console.log(
          `${success ? "✅ Sold" : "❌ Failed selling"} 100%, ${ca}`
        );
      }else{
        let splBal = splOut;
        for (const condition of BotConfig.SellSteps) {
          const closeAta =
            condition.amount === BotConfig.SellSteps[BotConfig.SellSteps.length - 1].amount;
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

          sellInstructions.push(getJitoTipInstruction(user_keypair.publicKey, TxnConfig.Tip.Sell));
          await sleepTime(condition.delay);
          const success = await sendBundle(sellInstructions, true);
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
    console.error(`⚠️ Failed to buy token ${ca}, skip this token.`);
  }
};
