import chalk from "chalk";
import { PROGRAM_NAME } from "../config.js";

const prefix = chalk.green(`${process.pid}| ${PROGRAM_NAME}`);

export const error = (message) => {
    console.log(`${prefix} | ${chalk.red("ERROR")} | ❌ ${chalk.red(message)}`)
}

export const info = (message) => {
    console.log(`${prefix} | ${chalk.blue("INFO ")} | ${chalk.white("" + message)}`)
}