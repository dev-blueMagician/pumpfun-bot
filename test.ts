import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=45d2a95e-937d-4802-8487-98dec2736fc9", { wsEndpoint: "wss://mainnet.helius-rpc.com/?api-key=45d2a95e-937d-4802-8487-98dec2736fc9" });


async function main() {
    try{
    connection.onLogs(
        new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"),
        async ({ logs, err, signature }) => {
          if (err) return;
        //   console.log(signature, logs);
          if (logs && logs.some((log) => log.includes("Program log: Instruction: InitializeMint2"))) {
            console.log(
              `🎉 Found new mint: https://solscan.io/tx/${signature}`
            );

          } 
        },
        "confirmed")
      } catch (e) {
        console.log('* onLogs error:', e);
      }
    }
      


async function getTxnInfo(txId: string){
    try {
      // console.log("🎉 get tx signature:", txId);
      const instructionName = "MAINNET_PROGRAM_ID.AmmV4.toString()";
      const tx = await connection.getParsedTransaction(txId, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
  

      console.log(tx?.transaction.message.instructions.length);
      //@ts-ignore
      const accounts = tx?.transaction.message.instructions.find((ix) => ix.programId.toString() === instructionName)?.accounts as PublicKey[];
      
    } catch (e) {
      console.log("Error fetching transaction:", e);
      return null;
    }
  }


  main();
