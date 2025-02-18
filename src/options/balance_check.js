import bs58  from "bs58";
import { 
  Connection, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  PublicKey
} from "@solana/web3.js";
import chalk from "chalk";
import Table from "cli-table";
import { main } from "../index.js";
import fs from "node:fs";
import { number } from "@inquirer/prompts";
import { goToQuestion } from "./common.js";

const settings_file = fs.readFileSync("data/settings.json", "utf8");
const settings = JSON.parse(settings_file);
const connection = new Connection(settings.rpc, "confirmed");

export async function balance_check() {
    const from = JSON.parse(fs.readFileSync("data/keypairs.json", "utf8"))
    const minter = Keypair.fromSecretKey(bs58.decode(settings.dev_wallet_pk));
    const depositWallet = Keypair.fromSecretKey(bs58.decode(settings.deposit_wallet_pk));
    let table = new Table({
      head: ["No", "Type", "Address", "Balance"],
    });
  
    table.push([
      "1",
      chalk.blueBright("deposit"),
      depositWallet.publicKey.toBase58(),
      chalk.yellowBright(((await connection.getBalance(depositWallet.publicKey)) / LAMPORTS_PER_SOL).toFixed(3).toString())
    ])
    table.push([
      "2",
      chalk.blueBright("minter"),
      minter.publicKey.toBase58(),
      chalk.yellowBright(((await connection.getBalance(minter.publicKey)) / LAMPORTS_PER_SOL).toFixed(3).toString())
    ])
  
    for (let [i, {publicKey}] of from.entries()) {
      
      let index = i + 3;
      const balance = await connection.getBalance(new PublicKey(publicKey));
      table.push([
        index.toString(),
        chalk.greenBright(`wallet[${i+1}]`),
        publicKey,
        chalk.yellowBright((balance / LAMPORTS_PER_SOL).toFixed(3).toString())
      ]);
    }
    console.log(table.toString());

    goToQuestion();
}