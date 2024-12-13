import {
  PublicKey,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { BotConfig, connection, TxnConfig, user_keypair } from "../../config";
import { Transaction } from "@solana/web3.js";
import { BuyInsParam } from "../utils/types";
import {
  calculateSplOut,
  getBuyInstruction,
  getPumpData,
} from "../utils/pumpfun";

export const buyPumpToken = async (mint: string, amount: number) => {
  console.log(`- Starting buy https://solscan.io/token/${mint}...`);
  const pumpData = await getPumpData(new PublicKey(mint));
  const maxSol = Math.floor(BotConfig.SnipeAmount * (1 + TxnConfig.Slippage / 100));
  const splOut = calculateSplOut(pumpData, amount);

  const buyParam: BuyInsParam = {
    mint: new PublicKey(mint),
    owner: user_keypair.publicKey,
    bondingCurve: pumpData.bondingCurve,
    associatedBondingCurve: pumpData.associatedBondingCurve,
    maxSol,
    splOut: splOut,
  };
  const buyInstructions: TransactionInstruction[] = getBuyInstruction(buyParam);
  const txn = new Transaction().add(...buyInstructions);
  const { blockhash } = await connection.getLatestBlockhash();
  txn.recentBlockhash = blockhash;
  txn.sign(user_keypair);
  const signature = await sendAndConfirmTransaction(connection, txn, [
    user_keypair,
  ]);
  console.log(`- Buy https://solscan.io/tx/${signature} successful!`);
};

// buyPumpToken('2tTacSuKRvMNqrB8Bz7Q1FNUux3wH89pERopuUV5pump', 100)
