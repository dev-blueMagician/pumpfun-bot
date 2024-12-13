import {
    LAMPORTS_PER_SOL,
    sendAndConfirmTransaction,
    TransactionInstruction,
  } from "@solana/web3.js";
  import {
    TOKEN_DECIMALS,
  } from "../utils/constants";
  import { sleepTime } from "../utils/utils";
  import {
    user_keypair,
    TxnConfig,
    BotConfig,
    stakedConnection,
    connection,
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
    getBuyInstruction,
    GetComputeUnitePriceInstruction,
    GetComputeUnitLimitInstruction,
    getSellInstruction,
    getSplOut,
  } from "../utils/pumpfun";
  import { moniterTrading } from "../utils/geyser"; // RESTORED IMPORTS
import { Transaction } from "@solana/web3.js";

  const sendAndConfirmTxn = async (
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
  
    // Prepare the instructions
    const txn = new Transaction().add(
        GetComputeUnitLimitInstruction(TxnConfig.Units),
        GetComputeUnitePriceInstruction(TxnConfig.Microlamports),
      ...instructions,
    );
    txn.recentBlockhash = blockhash;
    txn.feePayer = user_keypair.publicKey;

    try {        
      console.log("* Sent txn:", Date.now());
      const sig = await connection.sendTransaction(txn, [user_keypair], { skipPreflight: true, preflightCommitment: "processed", maxRetries: 3 });
      console.log(`* Normal txn: https://solscan.io/tx/${sig}`);
  
      // Wait for the transaction result
      return await getTxnResult(sig);
    } catch (e) {
      console.error("Error while sending normal txn:", e);
  
      // Retry logic (retry a max of 3 times)
      if (retry && retryAttempts < 3) {
        console.log("Retrying transaction...");
        return await sendAndConfirmTxn(instructions, true, retryAttempts + 1);
      }
  
      return false;
    }
  };
  
  // The main sniper function
  export const pumpfunSniper = async (swapData: SwapParams) => {
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
  
    // Attempt to send the buy transaction
    const isBought = await sendAndConfirmTxn(buyInstructions, true); // Retry enabled
  
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
          const success = await sendAndConfirmTxn(sellInstructions, true);
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
            await sleepTime(condition.delay);
            const success = await sendAndConfirmTxn(sellInstructions, true);
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
  