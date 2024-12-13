import {
  PublicKey,
  sendAndConfirmTransaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  connection,
  user_keypair,
} from "../../config";
import { Transaction } from "@solana/web3.js";
import { SellInsParam } from "../utils/types";
import { getPumpData, getSellInstruction } from "../utils/pumpfun";

export const sellPumpToken = async (mint: string, amount: number) => {
  console.log(`- Starting sell https://solscan.io/token/${mint}...`);
  const pumpData = await getPumpData(new PublicKey(mint));

  const sellParam: SellInsParam = {
    mint: new PublicKey(mint),
    owner: user_keypair.publicKey,
    bondingCurve: pumpData.bondingCurve,
    associatedBondingCurve: pumpData.associatedBondingCurve,
    splIn: amount,
  };
  const sellInstructions: TransactionInstruction[] =
    getSellInstruction(sellParam);
  const txn = new Transaction().add(...sellInstructions);
  const { blockhash } = await connection.getLatestBlockhash();
  txn.recentBlockhash = blockhash;
  txn.sign(user_keypair);
  const signature = await sendAndConfirmTransaction(connection, txn, [
    user_keypair,
  ]);
  console.log(`- sell https://solscan.io/tx/${signature} successful!`);
};

// sellPumpToken('2tTacSuKRvMNqrB8Bz7Q1FNUux3wH89pERopuUV5pump', 100)
