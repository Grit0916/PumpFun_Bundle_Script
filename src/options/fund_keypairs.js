// fund_keypairs.js
import { Keypair, SystemProgram, Transaction, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { input } from "@inquirer/prompts";
import fs from "node:fs";
import chalk from "chalk";
import * as logger from "../lib/logger.js";
import { getKeypairFromBase58, getVersionedTransaction, sendSuccessfulTransaction, sleep } from "../lib/utils.js";
import { bundle_log, divider, goHome } from "./common.js";
import { getJitoTipInstruction, sendBundles } from "../lib/jitoAPI.js";
import { MIN_SOL_PER_WALLET } from "../constants.js";

const settings_file = fs.readFileSync("data/settings.json", "utf8");
const settings = JSON.parse(settings_file);

const connection = new Connection(settings.rpc, "confirmed");

export async function fund_keypairs() {
  try {
    
    const fundingKeypair = Keypair.fromSecretKey(
        bs58.decode(settings.deposit_wallet_pk)
    );

    const solAnswer = await input({
      message: "How much SOL should each Keypair receive?",
      validate: (val) => {
        const parsed = parseFloat(val);
        if (isNaN(parsed) || parsed <= 0) {
          return "Please enter a number greater than 0!";
        }
        return true;
      },
    });
    const solAmount = parseFloat(solAnswer);

    const keypairsFile = fs.readFileSync("data/keypairs.json", "utf8");
    const keypairs = JSON.parse(keypairsFile);

    for (const [index, kp] of keypairs.entries()) {
      const pubKeyString = kp.publicKey;
      const lamportsToSend = solAmount * LAMPORTS_PER_SOL;

      logger.info(`Funding wallet #${index} (pubkey: ${pubKeyString}) with ${solAmount} SOL ...`);

      let transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fundingKeypair.publicKey,
          toPubkey: pubKeyString,
          lamports: lamportsToSend,
        })
      );

      const latestBlockhash = await connection.getLatestBlockhash();
      transaction.recentBlockhash = latestBlockhash.blockhash;
      transaction.feePayer = fundingKeypair.publicKey;

      let signature = await sendSuccessfulTransaction(transaction, fundingKeypair)
      if(!signature) {
        return;
      }else
        logger.info(chalk.greenBright.bold("[*]") + 
          ` Sent transaction: https://solscan.io/tx/${signature} (funding #${index})`
        );

      if (index < keypairs.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    logger.info(chalk.greenBright.bold("[*]") + 
    " All keypairs funded successfully! Returning home...")
    
  } catch (error) {
    logger.error("disperse Error:"+error);
  }

  goHome();
}

export async function disperse_sol(
  accounts,
  solAmounts,
  minSOLAmount = MIN_SOL_PER_WALLET,
) {
  try {
    const fundingKeypair = Keypair.fromSecretKey(
        bs58.decode(settings.deposit_wallet_pk)
    );

    if (accounts.length !== solAmounts.length) {
      logger.error(
        "The number of accounts and the number of amounts must be equal!"
      );
      return;
    }
    
    if (accounts.length > 5) {
      await disperse_sol_with_jito(connection, accounts, solAmounts, fundingKeypair);
    } else {
      let transfers = 0;
      for (const [index, account] of accounts.entries()) {
        const pubKeyString = account.publicKey;
        const lamportsToSend = (solAmounts[index] + minSOLAmount) * LAMPORTS_PER_SOL;
  
        logger.info(`🕐 Transfering ~${chalk.yellow(solAmounts[index])} SOL to wallet #${index+1} (${chalk.yellow(pubKeyString)}) ...`);
  
        let transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: fundingKeypair.publicKey,
            toPubkey: pubKeyString,
            lamports: Number(lamportsToSend.toFixed(0)),
          })
        );
  
        const latestBlockhash = await connection.getLatestBlockhash();
        transaction.recentBlockhash = latestBlockhash.blockhash;
        transaction.feePayer = fundingKeypair.publicKey;
  
        let signature = await sendSuccessfulTransaction(connection, transaction, fundingKeypair)
        if(!signature) {
          return;
        }else {
          logger.info( 
            `✅ Sent transaction: ${chalk.blue(`https://solscan.io/tx/${signature}`)}`
          );
          transfers++;
        }
  
        if (index < accounts.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
      if (transfers === accounts.length) {
        logger.info("✅ All keypairs funded successfully!");
        divider();
      }
    }
    
  } catch (error) {
    logger.error("disperse Error: "+error);
  }
}


async function disperse_sol_with_jito(connection, accounts, solAmounts, depositWallet) {
  try {
    const instrunctionsPerTx = 8;
    let bundledTxns = [];
    let instructions = [];
    let index = 0;
    const jitoInst = await getJitoTipInstruction(
      depositWallet
    );
    if (!jitoInst) return false;
    let signers = [depositWallet];
    instructions.push(jitoInst);
    for (let i = 0; i < accounts.length; i++) {
      const wallet = getKeypairFromBase58(accounts[i].secretKey)
      if (!wallet) continue;
      
      logger.info(`🕐 Transfering ~${chalk.yellow(solAmounts[index++])} SOL to wallet #${index}(${chalk.yellow(wallet.publicKey.toBase58())}) ...`);
      
      instructions.push(
        SystemProgram.transfer({
          fromPubkey: depositWallet.publicKey,
          toPubkey: wallet.publicKey,
          lamports: (solAmounts[i] + MIN_SOL_PER_WALLET) * LAMPORTS_PER_SOL,
        })
      );
      if(instructions.length == instrunctionsPerTx || i == accounts.length - 1 ) {
        const tx = await getVersionedTransaction(
          connection,
          depositWallet.publicKey,
          instructions
        );
        tx.sign(signers)
        // console.log("version tx size:", tx.serialize().length)
        bundledTxns.push(tx);
        instructions.length = 0;
      }
    }
    if(index > 0){
      bundle_log();
      const result = await sendBundles(bundledTxns, false);
      if (!result) {
        logger.error("transfer failed");
        goHome();
        return;
      }else {
        logger.info("✅ All keypairs funded successfully!");
        divider();
      }
    }
    return true;
  } catch (error) {
    console.log(error);
  }

  return false;
}