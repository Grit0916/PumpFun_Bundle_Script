import { Connection } from "@solana/web3.js";

export const PROGRAM_NAME = "pumpfun launcher";
export const PROGRAM_VERSION = "0.1.0";

// SOLANA RPC CONFIG
export const connection = new Connection("https://convincing-attentive-sanctuary.solana-mainnet.quiknode.pro/8115d69aaa47f3348a0d97231859ad019742b892", "confirmed");

// NEXT BLOCk CONFIG
export const NEXT_BLOCK_ENDPOINT = "https://fra.nextblock.io/api/v2/submit";
export const NEXT_BLOCK_TOKEN = "trial1737595069-R1HAwEYg2CaP0M3Joe%2FJqj4eVj6JqfiHCSVhEYMHAJs%3D";
export const NEXT_BLOCK_TIP = 0.005;

// JITO CONFIG
export const JITO_TIP = 0.001;
export const JITO_MAINNET_URL="amsterdam.mainnet.block-engine.jito.wtf"
export const JITO_TIMEOUT = 150000;

