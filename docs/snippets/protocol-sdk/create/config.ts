import "viem/window";

// ---cut---
import { zora } from "viem/chains";
import { http, custom, createPublicClient, createWalletClient } from "viem";

export const chain = zora;

export const publicClient = createPublicClient({
  // this will determine which chain to interact with
  chain,
  transport: http(),
});

export const walletClient = createWalletClient({
  chain,
  transport: custom(window.ethereum!),
});
