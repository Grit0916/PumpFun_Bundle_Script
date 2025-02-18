import { Keypair } from '@solana/web3.js';
import * as logger from '../lib/logger.js';
import chalk from 'chalk';
import { sleep } from '../lib/utils.js';
import { goHome } from './common.js';

export async function gen_pumpfun_keypair() {
    logger.info("🕐 Generating new pump.fun mint keypair. It could be take a long time...")
    await sleep(3000);
    while (1) {
        try {
            const keypair = Keypair.generate()
            if (keypair.publicKey.toBase58().slice(-4) == 'pump') {
                const pk = bs58.encode(keypair.secretKey)
                logger.info(`🔑 New Pumpfun Key: ${chalk.yellow(pk)} \n Please set this pk as ${chalk.yellow("mint_pk")} in ${chalk.yellow('settings.json')}`);
                break;
            } else {
                logger.info(`Invalid pumpfun mint keypair(${chalk.yellow(keypair.publicKey.toBase58())}), retrying...`)
            }
        } catch (error) {
            logger.error(error);
            break;
        }
    }
    goHome();
}