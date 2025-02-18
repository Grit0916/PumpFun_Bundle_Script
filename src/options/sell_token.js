import { input, number } from "@inquirer/prompts";
import { Trade } from "../lib/Trade_backup.js";
import fs from "node:fs";
import chalk from "chalk";
import * as logger from "../lib/logger.js";
import { buildSellTx } from "../lib/pf_logic.js";
import * as anchor from "@project-serum/anchor";
import { INSTRUCTION_PER_TX, PUMPFUN_PROGRAM_ID } from "../constants.js";
import idl from "../idl.json" assert { type: 'json' };
import { getKeypairFromBase58, getSafeTokenBalance, isValidPublicKey } from "../lib/utils.js";
import { connection, PROGRAM_VERSION } from "../config.js";
import { PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import * as jito from "../lib/jitoAPI.js";
import * as utils from "../lib/utils.js";
import { bundle_log, goHome } from "./common.js";

const trade = new Trade();

export async function sell() {
  // AWAIT USER OPTION REPLIES
  const percent_to_sell = await number({
    message:
      "percentage of token to sell across all wallet (e.g 50 for 50 percent):",
    validate: (data) => {
      if (data < 1 || data > 100) {
        return "minimum percent to sell is 1 and maximum is 100";
      }

      if (data == undefined) {
        return "Input cannot be empty";
      }

      return true;
    },
  });

  const mint = await input({
    message: "paste token contract address to sell:",
    validate: (data) => {
      return true;
    },
  });

  // read from keypairs file
  const keypairs_file = fs.readFileSync("data/keypairs.json", "utf8");
  const keypairs = JSON.parse(keypairs_file);

  // loop through each keypair with a delay
  for (const [index, keypair] of keypairs.entries()) {
    const { publicKey, secretKey } = keypair;

    await trade.sell(mint, secretKey, `${percent_to_sell}%`);

    if (index < keypairs.length - 1) {
      // Add a delay of 0.3 seconds before the next buy
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.log(
    chalk.greenBright.bold("[*]") +
      `All wallets holding of mint: ${mint} sold ${percent_to_sell}% successfully. Returning home...`
  );

  // RETURN TO MAIN MENU (HOME) (wait for 4 seconds)
  goHome(4000)
}

export async function sell_with_jito() {
  // AWAIT USER OPTION REPLIES
  const mint = await input({
    message: "paste token contract address to sell:",
    validate: (data) => {
      return isValidPublicKey(data);
    },
  });
  const percent = await number({
    message:
      "percentage of token to sell across all wallet (e.g 50 for 50 percent):",
      validate: (data) => {
        if (data < 1 || data > 100) {
          return "minimum percent to sell is 1 and maximum is 100";
        }

        if (data == undefined) {
          return "Input cannot be empty";
        }

        return true;
      },
  });
  const settings = JSON.parse(fs.readFileSync("data/settings.json", "utf8"));
  const devKeypair = utils.getKeypairFromBase58(settings.dev_wallet_pk);
  const PAYER = utils.getKeypairFromBase58(settings.deposit_wallet_pk);
  // read from keypairs file
  const keypairs = JSON.parse(fs.readFileSync("data/keypairs.json", "utf8"));

  let instructions = [];
  let signers = [];
  let bundleTxns = [];

  const provider = new anchor.AnchorProvider(
    connection,
    new anchor.Wallet(devKeypair),
    anchor.AnchorProvider.defaultOptions()
  )
  const program = new anchor.Program(idl, PUMPFUN_PROGRAM_ID, provider);
  const tokenBalance = await getSafeTokenBalance(connection, devKeypair.publicKey.toBase58(), mint);
  logger.info(`🕐 Selling token(${chalk.magenta(mint)}) from ${chalk.yellow(devKeypair.publicKey)}: ${percent}% ${tokenBalance*percent/100}`);
  if(tokenBalance > 0) {
    const sellTx = await buildSellTx(program, connection, devKeypair, mint, percent,tokenBalance);
    if(sellTx){
      instructions = [...sellTx.instructions];
      signers.push(devKeypair);
    }
  }
  // Lookup Table
  const firstAddressLookup = new PublicKey("Ej3wFtgk3WywPnWPD3aychk38MqTdrjtqXkzbK8FpUih")
  const lookupTableAccount = (await connection.getAddressLookupTable(firstAddressLookup));
  let lookupTableAccounts = [lookupTableAccount.value];

  // loop through each keypair with a delay
  for (const [index, keypair] of keypairs.entries()) {
    const { publicKey, secretKey } = keypair;
    const signer = getKeypairFromBase58(secretKey);

    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(signer),
      anchor.AnchorProvider.defaultOptions()
    )
    const program = new anchor.Program(idl, PUMPFUN_PROGRAM_ID, provider);
    const tokenBalance = await getSafeTokenBalance(connection, publicKey, mint);
    logger.info(`🕐 Selling token(${chalk.magenta(mint)}) from ${chalk.yellow(signer.publicKey)}: ${percent}% ${tokenBalance*percent/100}`);
    if(tokenBalance > 0) {
      const sellTx = await buildSellTx(
        program,
        connection,
        signer,
        mint,
        percent,
        tokenBalance
      );
      if (!sellTx) {
        logger.error("Failed to build sell transaction");
        continue;
      }
      instructions = [...instructions, ...sellTx.instructions];
      signers.push(signer);
    }
    if ((index > 0 && instructions.length % INSTRUCTION_PER_TX == 0) || index == keypairs.length - 1) {
      if(instructions.length == 0) continue;
      if(index == keypairs.length - 1) {
        const jitoTipInst = await jito.getJitoTipInstruction(PAYER);
        instructions.push(jitoTipInst);
      }
      const versionedTransaction = new VersionedTransaction(
        new TransactionMessage({
            payerKey: PAYER.publicKey,
            recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
            instructions: instructions,
        }).compileToV0Message(lookupTableAccounts)
      )
      signers.push(PAYER);
      versionedTransaction.sign(signers);
      // console.log("versioned transaction size", versionedTransaction.serialize().length)
      
      bundleTxns.push(versionedTransaction)
      instructions.length = 0
      signers.length = 0
    }
  }
  if(bundleTxns.length > 0 && bundleTxns.length <= INSTRUCTION_PER_TX) {
    bundle_log();
    let ret = await jito.sendBundles(bundleTxns, false)
    if (ret) {
        logger.info(`✅ Sell all tokens`);
    } else {
        logger.error(`Sell all tokens Failed`);
        logger.error("Reason:", ret)
    }
  }else {
    logger.info(chalk.redBright("😉 No token to sell"));
  }
  goHome();
}

export async function sell_with_nextblock(percent) {
  
}

export async function start() {

  const optionMsg = chalk.yellow("1: USE JITO | 2: USE NEXT BLOCK | 3: USE NORMAL") +
                    chalk.white("\nreply with option:")
  const option = PROGRAM_VERSION == "0.1.0" ? 1 : await number({
    message: optionMsg,
    validate: value => {
      if (value < 1 || value > 3) {
        return "Provided option invalid, choose from the menu number available";
      }

      if (value == undefined) {
        return "Input cannot be empty";
      }
      return true;
    }
  });

  switch (option) {
    case 1:
      await sell_with_jito();
      break;
    case 2:
      await sell_with_nextblock();
      break;
  
    default:
      await sell();
      break;
  }
}