import { PublicKey, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { RPC_URL, WEBSOCKET_URL } from "../../config";
import { SYSTEM_PROGRAM_ID } from "../utils/constants";

export const creators: Array<string> = [];

export const dynamicCreators = async () => {
  const connection = new Connection(RPC_URL, {
    wsEndpoint: WEBSOCKET_URL,
    commitment: "processed",
  });

  connection.onLogs(
    new PublicKey("6JYRx5TuLSxqSyAgnXSm72W4McULjxYj1yiRHViAH7m8"),
    async ({ logs, err, signature }) => {
      if (err) return;
      if (logs) {
        const tx = await connection.getParsedTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (!tx) return;

        const transferInfo: any = tx.transaction.message.instructions[2];
        const destination = transferInfo?.parsed?.info?.destination;
        const amount = transferInfo?.parsed?.info?.lamports;
        console.log(destination, amount);
        if (amount >= 0.9 * LAMPORTS_PER_SOL && destination !== "6JYRx5TuLSxqSyAgnXSm72W4McULjxYj1yiRHViAH7m8" ) {
          console.log("New creator detected:", destination);
          creators.push(destination);
        }
      }
    },
    "confirmed"
  );
};
