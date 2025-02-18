import figlet from "figlet";
import chalk from "chalk";
import Table from "cli-table";
import { number } from "@inquirer/prompts";

// BOT OPTIONs IMPORT
import { keypairs } from "./options/create_keypairs.js";
import { simulate, start } from "./options/launch.js";
import * as sellToken from "./options/sell_token.js";
import { sell_percent } from "./options/sell_percent.js";
import { fund_keypairs } from "./options/fund_keypairs.js";
import { withdraw_funds } from "./options/withdraw_funds.js";
import fs from "node:fs";
import * as utils from "./lib/utils.js";
import { balance_check } from "./options/balance_check.js";
import { gen_pumpfun_keypair } from "./options/gen_pumpfun_keypair.js";
import * as logger from './lib/logger.js';

const settings = JSON.parse(fs.readFileSync("data/settings.json", "utf8"));

export async function main() {
  // console.clear();
  if(!checkSettings()) return;
  // LOG FIGLET
  const fig_text = figlet.textSync("Pumpfun Launch tool", {
    font: "Star Wars",
    horizontalLayout: "default",
    verticalLayout: "default",
    width: 150,
    whitespaceBreak: true,
  });
  console.log(chalk.cyanBright.bold(fig_text));
  // LOG COPYRIGHT
  // console.log(chalk.magentaBright("Developed by: www.crypto-bots.io"));

  // PRINT OPTION MENUs
  var table = new Table({
    head: ["Command", "Label", "Description"],
  });

  table.push(
    [
      "1",
      chalk.greenBright.bold("Create Keypairs"),
      "Generate 20 wallets used for token snipings",
    ],
    [
      "2",
      chalk.greenBright.bold("Create Pumpfun mint Keypair"),
      "Generate mint keypair ended with pump",
    ],
    [
      "3",
      chalk.blue.bold("Simulation"),
      "Simulation before launch token on pump.fun",
    ],
    [
      "4",
      chalk.yellowBright.bold("Launch"),
      "Launch token to pump.fun via the UI",
    ],
    [
      "5",
      chalk.cyanBright.bold("Sell token"),
      "Sell token supply across all wallets",
    ],
    ["6", chalk.magenta.bold("Withdraw SOL"), "Withdraw leftover SOL from wallets to a deposit wallet"],
    ["7", chalk.gray.bold("Blance wallets"), "Check balance of wallets"],
    ["8", chalk.redBright.bold("Quit"), "Quit the bot interface"]
  );
  console.log(table.toString());

  // AWAIT USER OPTION REPLIES
  const option = await number({
    message: "reply with command number:",
    validate: (data) => {
      if (data < 1 || data > 10) {
        return "Provided option invalid, choose from the menu number available";
      }

      if (data == undefined) {
        return "Input cannot be empty";
      }

      return true;
    },
  });

  switch (option) {
    case 1:
      keypairs();
      break;
    
    case 2:
      gen_pumpfun_keypair();
      break;

    case 3:
      simulate();
      break;
    
    case 4:
      start();
      break;

    case 5:
      sellToken.start();
      break;

    // case 6:
    //   fund_keypairs();
    //   break;

    case 6:
      withdraw_funds(true, true);
      break;

    case 7:
      balance_check();
      break;

    case 8:
      process.exit(0);
      break;
  }
}

function checkSettings() {
  if(!settings?.rpc || !utils.isUrlValid(settings.rpc)) {
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'rpc' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.dev_wallet_pk || !utils.isValidPrivateKey(settings.dev_wallet_pk)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'dev_wallet_pk' in " + chalk.yellow.bold("settings.json"));
    return false;
  } 
  if(!settings?.deposit_wallet_pk || !utils.isValidPrivateKey(settings.deposit_wallet_pk)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'deposit_wallet_pk' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.dev_wallet_sol_buy || !isFinite(settings?.dev_wallet_sol_buy)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'dev_wallet_sol_buy' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.wallets_min_sol_buy || !isFinite(settings?.wallets_min_sol_buy)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'wallets_min_sol_buy' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.wallets_max_sol_buy || !isFinite(settings?.wallets_max_sol_buy)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'wallets_max_sol_buy' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.token_name || utils.isEmpty(settings.token_name)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'token_name' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  if(!settings?.token_symbol || utils.isEmpty(settings.token_symbol)){
    logger.error(chalk.redBright.bold("SETTINGS ERROR: ") + "Invalid 'token_symbol' in " + chalk.yellow.bold("settings.json"));
    return false;
  }
  return true;
}

main();
