import { getLastValidBlockhash } from "./src/utils/getBlock"; // Import getLastValidBlockhash
import { useGeyser } from "./src/useGeyser";
import { usegRPC } from "./src/useGRPC";
import { BotConfig, SignalMode } from "./config";
import { useRPC } from "./src/useRPC";

// Start the background process for fetching the last valid blockhash
setInterval(() => {
  const blockhash = getLastValidBlockhash(); // Fetch the blockhash instead of the block
  if (!blockhash) {
    console.error("Blockhash not available");
    return;
  }
  // Now the blockhash is available, but no need to log it unless necessary
}, 100); // Check the last valid blockhash every 100ms

(() => {
  if (BotConfig.SignalType === SignalMode.GRPC) usegRPC();
  else if(BotConfig.SignalType === SignalMode.Geyser) useGeyser();
  else if(BotConfig.SignalType === SignalMode.RPC) useRPC();
})();
