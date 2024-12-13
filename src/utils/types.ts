import { PublicKey } from "@solana/web3.js";

export type SwapParams = {
  mint: PublicKey;
  user: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  solSpent: number;
  splBought: number;
};

export type BuyInsParam = {
  mint: PublicKey;
  owner: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  maxSol: number;
  splOut: number;
};

export type SellInsParam = {
  mint: PublicKey;
  owner: PublicKey;
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  splIn: number;
};

export type AmountsParam = {
  solSpent: number;
  splBought: number;
  solIn: number;
};

export type PumpData = {
  bondingCurve: PublicKey;
  associatedBondingCurve: PublicKey;
  virtualSolReserves: number;
  virtualTokenReserves: number;
};