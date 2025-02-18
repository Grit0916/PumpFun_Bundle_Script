import { 
  PublicKey, 
  Keypair, 
  Connection, 
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL
} from "@solana/web3.js";
import bs58 from "bs58";
import fs from "fs";
import idl from "../idl.json" assert { type: 'json' };
import anchor from "@project-serum/anchor";
import * as utils from "../lib/utils.js";
import * as logger from "../lib/logger.js";
import * as pumpfun from "../lib/pf_logic.js";
import * as jito from "../lib/jitoAPI.js"
import chalk from "chalk";
import { main } from "../index.js";
import { number } from "@inquirer/prompts";
import Table from "cli-table";
import { disperse_sol } from "./fund_keypairs.js";
import { withdraw_funds } from "./withdraw_funds.js";
import { 
  PUMPFUN_PROGRAM_ID, 
  MIN_SOL_MINTER, 
  MIN_SOL_PER_WALLET,
  INSTRUCTION_PER_TX 
} from "../constants.js";
import { connection, PROGRAM_VERSION } from "../config.js";
import { answerWithYesNo, goHome, goToQuestion, divider, bundle_log } from "./common.js";

export async function jito_launch(keypairs) {

  const settings = JSON.parse(fs.readFileSync("data/settings.json", "utf8"));
  const PAYER = Keypair.fromSecretKey(bs58.decode(settings.dev_wallet_pk));

  const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(PAYER),
      anchor.AnchorProvider.defaultOptions()
  );
  const pumpfunProgram = new anchor.Program(idl, PUMPFUN_PROGRAM_ID, provider);
  
  // --------------------- Begin to check settings.json ---------------------------
  logger.info(chalk.yellowBright("👀 Please check your settings to launch!"))
  await utils.sleep(2000);
  
  let settingTable = new Table({
    head: ["Field", "Value"],
  });
  Object.keys(settings).forEach((key) => {
    if(key !== "rpc" && key !== "deposit_wallet_pk" && key !== "dev_wallet_pk") 
      settingTable.push([chalk.blue(key), settings[key]]);
  });
  console.log(settingTable.toString());

  const check = await answerWithYesNo(`Is the settings correct?`);

  if (check == 2) {
    logger.info(chalk.red("🟧 Launch paused!"))
    goHome();
    return;
  }
  // --------------------- End to check settings.json ---------------------------

  logger.info("💊 Starting launch with jito bundle...")

  // Keypairs
  const wallets = keypairs.map((keypair) =>
    Keypair.fromSecretKey(bs58.decode(keypair.secretKey))
  );
  
  // --------------------- Begin to generate token mint keypair or check ---------------------------
  let tokenMintKeypair; 
  let devKeypair = utils.getKeypairFromBase58(settings.dev_wallet_pk);
  try {
    if (utils.isEmpty(settings.mint_pk)) {
      const optionMsg = chalk.magentaBright(`Not setted pre-generated pumpfun mint key in ${chalk.underline("settings.json")}.`)
                        + chalk.yellowBright("\nGenerate random key? 1: Yes | 2: No") 
                        + "\nreply with option:"
      const option = await number({
        message: optionMsg,
        validate: value => {
          if (value < 1 || value > 2) {
            return "Provided option invalid, choose from the menu number available";
          }
    
          if (value == undefined) {
            return "Input cannot be empty";
          }
          return true;
        }
      })
      if (option == 2) {
        logger.info(chalk.red("🟥 Launch stopped!"))
        goHome();
        return;
      }
      logger.info("🕐 Generating mint key...")
      tokenMintKeypair = Keypair.generate();
    }
    else {
      tokenMintKeypair = utils.getKeypairFromBase58(settings.mint_pk);
      let mintData = await connection.getParsedAccountInfo(tokenMintKeypair.publicKey);
      if(mintData.value) {
        logger.error(`Mint keypair(${chalk.magenta(tokenMintKeypair.publicKey.toBase58())}) already used, please use another mint keypair.`);
        const answer = await answerWithYesNo(`Do you want to generate any new mint keypair?`);
        if (answer == 2) {
          logger.info("🟥 Launch stopped!")
          goHome();
          return;
        } else {
          logger.info("🕐 Generating new mint keypair...")
          tokenMintKeypair = Keypair.generate();
        }
      }
    }
    logger.info(`🔑 New Mint Address: ${chalk.magenta(tokenMintKeypair.publicKey.toBase58())}`)
    const answer = await answerWithYesNo(`Do you want to launch with this address(${chalk.magenta(tokenMintKeypair.publicKey.toBase58())})?`);
    if (answer == 2) {
      logger.info("🟥 Launch stopped!")
      goHome();
      return;
    }
  } catch (error) {
    logger.error(error);
    process.exit(0);
  }
  // --------------------- End to generate mint keypair ---------------------------

  // --------------------- Begin to generate token mint metadata ---------------------------
  const imagePath = "data/img/meme.png";
  if(!fs.existsSync(imagePath)) {
    logger.error(`File not exist in ${imagePath}`)
    goHome();
  }

  let metadataUri;
  try {
    logger.info("🔗 Uploading token meta data...")
    const raw = fs.readFileSync(imagePath)
    const fileBlob = new Blob([new Uint8Array(raw)], {type: 'image/jpeg' })
    metadataUri = await pumpfun.getMintMetaData(
      settings.token_name,
      settings.token_symbol,
      settings.token_desc,
      settings.twitter || "",
      settings.telegram || "",
      settings.website || "",
      fileBlob,
    );
    logger.info(`📝 Metadata Uri: ${chalk.blue(chalk.underline(metadataUri))}`)
  } catch (error) {
    logger.error(error);
    start();
  }
  // --------------------- End to generate token metadata ---------------------------

  // --------- Begin to withdraw SOL from sniper wallets to deposit wallet -----------
  await withdraw_funds();
  await utils.sleep(3000);
  // --------------------------- End to withdraw SOL -----------------------------

  // ----------------------- Begin to  simulate buy sol, token amount ---------------------
  logger.info(`🕐 Simulating SOL amounts needed for launching token on pump.fun...`)
  await utils.sleep(2000);
  let walletSolAmounts = [];
  let depoistWallet = Keypair.fromSecretKey(bs58.decode(settings.deposit_wallet_pk));
  for(let i = 0; i < wallets.length; i ++){
    const sol = Math.random() * (settings.wallets_max_sol_buy - settings.wallets_min_sol_buy) + settings.wallets_min_sol_buy;
    walletSolAmounts.push(Number(sol.toFixed(2)))
  }
  
  let [solAmounts, tokenAmounts] = pumpfun.simulateBuyPumpfunTokens(
    settings.dev_wallet_sol_buy,
    0,
    walletSolAmounts,
    [],
  );

  let depositSOL = await utils.getSolBalance(depoistWallet.publicKey, connection);
  let table = new Table({
    head: ["No", "Type", "Address", "Balance", "Buy SOL", "Buy token"],
  });
  let totalSolAmount = 0;
  for (let i = 0; i < solAmounts.length; i ++) {
    const type = i == 0 ? chalk.green("dev"): chalk.blue(`wallet[${i}]`);
    const solBalance = i == 0 ? await utils.getSolBalance(devKeypair.publicKey, connection) : 
                await utils.getSolBalance(wallets[i-1].publicKey, connection);
    const tokenBalance = tokenAmounts[i];
    const pubKey = i == 0 ? devKeypair.publicKey.toBase58() : wallets[i-1].publicKey.toBase58();
    if (i > 0) {
      totalSolAmount += solAmounts[i] + MIN_SOL_PER_WALLET;
    }
    table.push([
      `${i+1}`,
      type,
      pubKey,
      chalk.yellow(solBalance),
      chalk.yellow(solAmounts[i]),
      chalk.yellow(tokenBalance)
    ])
  }
  console.log(table.toString())
  
  table = new Table({
    head: ["Type", "Address", "Balance", "Needed SOL"],
  })
  table.push([
    chalk.magenta("deposit"),
    depoistWallet.publicKey.toBase58(),
    depositSOL,
    totalSolAmount.toFixed(3),
  ])
  console.log(table.toString());
  await utils.sleep(3000);

  if (depositSOL <= totalSolAmount.toFixed(3)) {
    logger.error("Deposit wallet sol balance not enough to disperse to buy wallets.")
    goHome();
    return;
  }
  // ----------------------- End to  simulate buy sol, token amount ---------------------

  // ----------------------- Begin to disperse SOL into snper wallets ---------------------
  let rlt = await disperse_sol(keypairs, solAmounts.slice(1, solAmounts.length), MIN_SOL_PER_WALLET);
  // --------------------------------- End to disperse SOL -------------------------------
  
  logger.info(chalk.blue(`🚀 Launching & sniping on pump.fun with jito bundle...`));
  divider();

  // ----------------------- Begin to generate bundle transactions for bundler -----------------------
  let instructions = [];
  let bundleTxns = [];
  
  logger.info(`🔑 Minting token (${chalk.magenta(tokenMintKeypair.publicKey.toBase58())}) on pump.fun...`);

  // Build token mint instructions on pump.fun
  const mintInst = await pumpfun.buildMintInst(
    pumpfunProgram,
    PAYER,
    tokenMintKeypair.publicKey,
    settings.token_name,
    settings.token_symbol,
    metadataUri
  );

  logger.info(`🤵‍♂️ Dev(${chalk.yellow(PAYER.publicKey.toBase58())}) buy: ${tokenAmounts[0]}, ${solAmounts[0]} SOL`);
  
  // Build token buy instructions from dev
  const txBuyDev = await pumpfun.buildMintBuyTx(
    pumpfunProgram,
    PAYER,
    tokenMintKeypair.publicKey,
    solAmounts[0],
    tokenAmounts[0]
  );

  // Lookup Table
  const firstAddressLookup = new PublicKey("Ej3wFtgk3WywPnWPD3aychk38MqTdrjtqXkzbK8FpUih")
  const lookupTableAccount = (await connection.getAddressLookupTable(firstAddressLookup));
  let lookupTableAccounts = [lookupTableAccount.value];
  
  instructions = [mintInst, ...txBuyDev.instructions];
  
  // Jito Tip instruction
  instructions.push(await jito.getJitoTipInstruction(PAYER));
  let firstSigners = [PAYER, tokenMintKeypair]
  let signers = [];
  
  const versionedTransaction = new VersionedTransaction(
    new TransactionMessage({
        payerKey: PAYER.publicKey,
        recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
        instructions: instructions,
    }).compileToV0Message(lookupTableAccounts)
  )

  // console.log(await connection.simulateTransaction(versionedTransaction))

  // console.log("first versioned transaction:", versionedTransaction.serialize().length)
  versionedTransaction.sign(firstSigners);
  bundleTxns.push(versionedTransaction)

  // Build token buy instructions from snipers
  instructions.length = 0
  for (let i = 0; i < wallets.length; i ++){
    const tokenAmount = tokenAmounts[i+1];
    const solAmount = solAmounts[i+1];
    const provider = new anchor.AnchorProvider(
      connection,
      new anchor.Wallet(wallets[i]),
      anchor.AnchorProvider.defaultOptions()
    );

    const program = new anchor.Program(idl, PUMPFUN_PROGRAM_ID, provider);
    logger.info(`🔱 Sniper(${chalk.yellow(wallets[i].publicKey.toBase58())}) buy: ${tokenAmount}, ${solAmount} SOL`);
    instructions = instructions.concat(await pumpfun.buildBuyInst(
      program,
      wallets[i],
      tokenMintKeypair.publicKey,
      tokenAmount,
      solAmount,
    ))

    
    signers.push(wallets[i]);
    if (i > 0 && (i + 1) % INSTRUCTION_PER_TX == 0 || i == wallets.length - 1) {
      const versionedTransaction = new VersionedTransaction(
        new TransactionMessage({
            payerKey: wallets[i].publicKey,
            recentBlockhash: (await connection.getLatestBlockhash()).blockhash,
            instructions: instructions,
        }).compileToV0Message(lookupTableAccounts)
      )
      versionedTransaction.sign(signers)
      // console.log("versioned transaction size", versionedTransaction.serialize().length)
      // console.log(await connection.simulateTransaction(versionedTransaction))

      bundleTxns.push(versionedTransaction)
      instructions.length = 0
      signers.length = 0
    }
  }
  // ----------------------- End to generate bundled transactions for bundling ---------------------

  // ----------------------------- Begin to send bundled transactions ---------------------------
  bundle_log();
  let ret = await jito.sendBundles(bundleTxns, false)
  
  if (ret) {
    logger.info(`🎉🎉🎉🎉🎉 ${chalk.green("Pumpfun Launch Success!")} 🎉🎉🎉🎉🎉 `);
    logger.info(`💊 ${chalk.blue(`https://pump.fun/coin/${tokenMintKeypair.publicKey.toBase58()}`)}`);
  } else {
    logger.error(`Pumpfun Launch Failed`);
    logger.error("reason: "+ret)
  }
  // ----------------------------- End to send bundled transactions ---------------------------

  goHome(5000);
}

export async function next_block_launch(keypairs) {
  logger.info("🙁 Sorry, not ready for next block.")
  goHome();
}

export async function normal_launch(keypairs) {
  logger.info("🙁 Sorry, not ready for normal launch.")
  goHome();
}

export async function start() {
  const keypairs = JSON.parse(fs.readFileSync("data/keypairs.json", "utf8"));
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
  })

  switch (option) {
    case 1:
      jito_launch(keypairs);
      break;
    case 2:
      next_block_launch(keypairs);
      break;
    case 3:
      normal_launch(keypairs);
      break;
  
    default:
      break;
  }
}

export async function simulate() {
  const keypairs = JSON.parse(fs.readFileSync("data/keypairs.json", "utf8"));
  const settings = JSON.parse(fs.readFileSync("data/settings.json", "utf8"));
  const depositWallet = Keypair.fromSecretKey(bs58.decode(settings.deposit_wallet_pk));
  const minter = Keypair.fromSecretKey(bs58.decode(settings.dev_wallet_pk));
  logger.info("🧮 Simulating needed SOL amounts before launch token on pump.fun...")
  
  let depositNeededSOL = Number(keypairs.length * (Number(settings.wallets_max_sol_buy) + Number(MIN_SOL_PER_WALLET)) + 0.001);
  let table = new Table({
    head: ["No", "Type", "Address", "Balance", "Needed SOL"],
  });
  const depositSOL = await utils.getSolBalance(depositWallet.publicKey, connection);
  table.push([
    "1",
    chalk.blueBright("deposit"),
    minter.publicKey.toBase58(),
    chalk.yellowBright(depositSOL.toFixed(3)),
    depositSOL < depositNeededSOL ? chalk.redBright(depositNeededSOL.toFixed(3)) : chalk.greenBright(depositNeededSOL.toFixed(3))
  ])
  const minterSOL = await utils.getSolBalance(minter.publicKey, connection);
  const minterNeededSOL = Number(settings.dev_wallet_sol_buy) + Number(MIN_SOL_MINTER);
  table.push([
    "2",
    chalk.blueBright("minter"),
    depositWallet.publicKey.toBase58(),
    chalk.yellowBright(minterSOL.toFixed(3)),
    minterSOL < minterNeededSOL ? chalk.redBright(minterNeededSOL.toFixed(3)): chalk.greenBright(minterNeededSOL.toFixed(3))
  ])
  
  console.log(table.toString());

  goToQuestion();
}
