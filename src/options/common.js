import { number } from "@inquirer/prompts";
import { main } from "../index.js";
import chalk from "chalk";
import * as logger from "../lib/logger.js";

export function goHome (
    delay=2000
) {
    setTimeout(() => {
        main()
    }, delay);
}

export async function goToQuestion (
    delay=0
) {
    const option = await number({
        message: `Enter ${chalk.yellow("1")} to go back to main menu:`,
        validate: (data) => {
          if (data !== 1) {
            return "Invalid option";
          }
          return true;
        },
    });
    if(option == 1) {
        setTimeout(() => {
           main()
        }, delay);
    }
    return;
}

export async function answerWithYesNo (
    message
) {
    const option = await number({
        message: `${chalk.bgRed(chalk.white(message))} ${chalk.yellow("1: Yes | 2: No :")}`,
        validate: (data) => {
          if (data !== 1 && data !== 2) {
            return "Invalid option";
          }
          return true;
        },
    });
    return option;
}

export function divider (number = 100) {
    logger.info("-".repeat(number));
}

export function bundle_log () {
    divider();
    logger.info(`🛫 ${chalk.blue("Sending bundled transactions...")}`);
    divider();
}