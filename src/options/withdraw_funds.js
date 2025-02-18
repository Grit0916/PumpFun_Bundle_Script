// withdraw_funds.js
import {
  Keypair,
  SystemProgram,
  Transaction,
  Connection,
  LAMPORTS_PER_SOL,
  PublicKey
} from "@solana/web3.js";
import bs58 from "bs58";
import { input } from "@inquirer/prompts";
import fs from "node:fs";
import chalk from "chalk";
import { getKeypairFromBase58, getVersionedTransaction, sendSuccessfulTransaction, sleep } from "../lib/utils.js";
import * as logger from "../lib/logger.js";
import { balance_check } from "./balance_check.js";
import { bundle_log, divider, goHome } from "./common.js";
import { INSTRUCTION_PER_TX } from "../constants.js";
import { JITO_TIP } from "../config.js";
import { getJitoTipInstruction, sendBundles } from "../lib/jitoAPI.js";
import { sign } from "node:crypto";

const settings_file = fs.readFileSync("data/settings.json", "utf8");
const settings = JSON.parse(settings_file);

const connection = new Connection(settings.rpc, "confirmed");

export async function withdraw_funds(deposit=true, backHome=false) {
  try {
    let withdrawAddress = "";
    let depositWallet = Keypair.fromSecretKey(bs58.decode(settings.deposit_wallet_pk));
    if(deposit){
      withdrawAddress = Keypair.fromSecretKey(bs58.decode(settings.deposit_wallet_pk)).publicKey.toBase58();
    }else 
     withdrawAddress = await input({
      message: "Paste the SOL address to which you want to withdraw all funds:",
      validate: (val) => {
        if (!val || val.length < 32) {
          return "Please enter a valid Solana address (Base58).";
        }
        return true;
      },
    });

    const keypairsFile = fs.readFileSync("data/keypairs.json", "utf8");
    const keypairs = JSON.parse(keypairsFile);

    if(keypairs.length > INSTRUCTION_PER_TX) {
      await withdraw_with_jito(connection, keypairs, depositWallet);
    } else {
      let withdrawns = 0;
      for (const [index, kp] of keypairs.entries()) {
        const pubKeyString = kp.publicKey;
        const secretKeyString = kp.secretKey;

        const thisKeypair = Keypair.fromSecretKey(bs58.decode(secretKeyString));

        const balance = await connection.getBalance(thisKeypair.publicKey);
        if (balance === 0) {
          logger.info(
            chalk.yellowBright(`🎿 Keypair #${index} has 0 SOL, withdraw skipped.`)
          );
          continue;
        }

        // Z.B. 5000 Lamports = 0.000005 SOL
        const FEE_BUFFER = 5000;
        
        if (balance <= FEE_BUFFER) {
          logger.info(
            chalk.yellowBright(
              `Keypair #${index+1} has insufficient SOL (${balance} lamports), skipping...`
            )
          );
          continue;
        }

        // Transfer amount
        const lamportsToSend = balance - FEE_BUFFER;

        logger.info(
          `🕐 Withdrawing ~${chalk.yellow((lamportsToSend / LAMPORTS_PER_SOL).toFixed(
            6
          ))} SOL from keypair #${index} to -> ${chalk.yellow(withdrawAddress)}`
        );

        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: thisKeypair.publicKey,
            toPubkey: withdrawAddress,
            lamports: lamportsToSend,
          })
        );

        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.feePayer = thisKeypair.publicKey;

        let signature = await sendSuccessfulTransaction(connection, transaction, thisKeypair)
        if(!signature) {
          return;
        }else {
          logger.info(
            `✅ Sent transaction: ${chalk.blue(`https://solscan.io/tx/${signature}`)}`
          );
          withdrawns ++;
        }
        
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      if (withdrawns > 0) {
        logger.info("✅ All possible funds have been withdrawn!");
        divider();
      }
      else
        logger.info(
            "😉 No funds to withdraw!"
        );
    }
    // await sleep(2000);
    // balance_check();

  } catch (error) {
    logger.error(chalk.redBright.bold("[ERROR] ")+error);
  }
  if(backHome)
    goHome();
}

async function withdraw_with_jito(connection, keypairs, depositWallet) {

  try {
    const withdrawAddress = depositWallet.publicKey.toBase58();
    const FEE_BUFFER = 5000;
    const instrunctionsPerTx = 8;
    let signers = [];
    let bundledTxns = [];
    let instructions = [];
    let index = 0;
    let feePayed = -1;
    for (let i = 0; i < keypairs.length; i++) {
      const wallet = getKeypairFromBase58(keypairs[i].secretKey)
      if (!wallet) continue;
      const solBalance = await connection.getBalance(wallet.publicKey);
        
      if (solBalance <= FEE_BUFFER) {
        // logger.info(
        //   chalk.yellowBright(
        //     `Keypair #${i+1} has insufficient SOL (${solBalance} lamports), skipping...`
        //   )
        // );
        continue;
      }

        // Transfer amount
      let lamportsToSend = solBalance;
      if(feePayed < 0) {
        const jitoInst = await getJitoTipInstruction(
          depositWallet
        );
        if (!jitoInst) return false;
        instructions.push(jitoInst);
        signers.push(depositWallet);
        feePayed = i;
      }
      index ++;
      logger.info(
        `🕐 Withdrawing ~${chalk.yellow((lamportsToSend / LAMPORTS_PER_SOL).toFixed(
          6
        ))} SOL from wallet #${index} to -> ${chalk.yellow(withdrawAddress)}`
      );
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey(withdrawAddress),
          lamports: lamportsToSend,
        })
      );
      signers.push(wallet)
    }
    
    let subInsts = [];
    let subSigners = [];
    for(let i = 0; i < instructions.length; i++) {
      subInsts.push(instructions[i]);
      subSigners.push(signers[i]);
      if((i > 0 && (i + 1) % instrunctionsPerTx == 0) || i == instructions.length - 1 ) {
        const tx = await getVersionedTransaction(
          connection,
          depositWallet.publicKey,
          subInsts
        );
        subSigners.push(depositWallet);
        tx.sign(subSigners)
        // console.log("version tx size:", tx.serialize().length)

        bundledTxns.push(tx);
        subSigners.length = 0;
        subInsts.length = 0;
      }
    }
    if(bundledTxns.length > 0) {
      bundle_log();
      const result = await sendBundles(bundledTxns, false);
      if (!result) {
        logger.error("disperse failed");
        goHome();
      } else {
        logger.info("✅ All possible funds have been withdrawn!");
        divider();
      }
    }
    return true;
  } catch (error) {
    console.log(error);
  }

  return false;
}

