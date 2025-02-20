import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import base58 from "bs58";
import dotenv from "dotenv";
dotenv.config();

export const RPC_URL = process.env.RPC_URL || "";
export const WEBSOCKET_URL = process.env.WEBSOCKET_URL || "";
const STAKED_RPC = process.env.STAKED_RPC || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
export const GRPC_URL = process.env.GRPC_URL || "";
export const X_TOKEN = process.env.X_TOKEN || "";
export const GEYSER_URL = process.env.GEYSER_URL || "";
export const BLOX_AUTH_HEADER = process.env.BLOX_AUTH_HEADER || "";
export const connection = new Connection(RPC_URL, "processed");
export const stakedConnection = new Connection(STAKED_RPC, "processed");
export const user_keypair = Keypair.fromSecretKey(base58.decode(PRIVATE_KEY));

export enum SignalMode {
  Geyser,
  GRPC,
  RPC,
}

export enum TxnMode {
  Normal,
  Jito,
  BloxRoute
}

export const TxnConfig = {
  TxnType: TxnMode.BloxRoute, // txn type
  Units: 430000, 
  Microlamports: 300000,
  Tip: { // buy/sell tip amount
    Buy: 0.001 * LAMPORTS_PER_SOL,
    Sell: 0.001 * LAMPORTS_PER_SOL,
  },
  Slippage: 100, // slippage 100%
}

export const BotConfig = {
  SignalType: SignalMode.GRPC, // signal type
  SnipeAt: { // sniping condition
    Min: 1 * LAMPORTS_PER_SOL,
    Max: 10 * LAMPORTS_PER_SOL,
  },
  SnipeAmount: 0.001 * LAMPORTS_PER_SOL, // sniping amount
  KeepBuy: false, // keep buy
  CheckDevSell: false, // wait dev's sell
  CheckBuy: false, // wait buy amount hits MinBuyAmount
  CheckBuyAmount: 0.01 * LAMPORTS_PER_SOL, // sell if buy amount >= this
  MaxWaitTime:  1 * 60 * 1000, // 5 min
  SellSteps: [ // sell steps
    { delay: 10 * 1000, amount: 1.0 },
    //{ delay: 2 * 1000, amount: 0.5 },
  ]
}