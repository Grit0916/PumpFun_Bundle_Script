import axios from "axios";
import bs58 from "bs58";
import {
    SystemProgram,
    Transaction,
    PublicKey,
    LAMPORTS_PER_SOL
} from "@solana/web3.js";

import {
    getRandomNumber,
    sleep
} from "./utils.js";
import { 
    connection,
    JITO_MAINNET_URL, 
    JITO_TIMEOUT, 
    JITO_TIP 
} from "../config.js";
import * as logger from "./logger.js";
import chalk from "chalk";

export const sendBundles = async (transactions, SIMULATE_MODE=false) => {
    try {
        if (transactions.length === 0)
            return;
        let simulate_success = false;
        if (SIMULATE_MODE){
            for (let i = 0; i < transactions.length; i++) {
                let rlt = await connection.simulateTransaction(transactions[i]);
                if(!rlt.value.err) {
                    logger.info(`✅ #${i+1} Simulation Success`);
                    simulate_success = true;
                }
                else {
                    simulate_success = false;
                    // logger.error("Simulation Error: "+rlt)
                    console.error("Simulation Error: ", rlt.value.err)
                }
            }
            return simulate_success;
        }

        const rawTransactions = transactions.map(tx => bs58.encode(tx.serialize()));
        
        const { data } = await axios.post(`https://${JITO_MAINNET_URL}/api/v1/bundles`,
            {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [
                    rawTransactions
                ],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                }
            }
        );
        const uuid = data.result

        // console.log("Checking bundle's status...", uuid);
        const sentTime = Date.now();
        while (Date.now() - sentTime < JITO_TIMEOUT) {
            try {
                const { data } = await axios.post(`https://${JITO_MAINNET_URL}/api/v1/bundles`,
                    {
                        jsonrpc: "2.0",
                        id: 1,
                        method: "getBundleStatuses",
                        params: [
                            [uuid]
                        ],
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                        }
                    }
                );

                if (data) {
                    const bundleStatuses = data.result.value;
                    // console.log("Bundle Statuses:", bundleStatuses);
                    let success = true;

                    const matched = bundleStatuses.find(bStatus => bStatus && bStatus.bundle_id === uuid);
                    if (!matched || matched.confirmation_status !== "finalized") {
                        success = false;
                    }
                    if (success) {
                        logger.info(`✅ Bundle ${chalk.yellow(uuid)} ${chalk.green("Success")}`);
                        return true;
                    }
                }
            }
            catch (err) {
                logger.error("JITO ERROR:", err);
            }

            await sleep(1000);
        }
    }
    catch (err) {
        console.log("Send Bundle Error",err);
    }
    return false;
}

export const getTipAccounts = async () => {
    try {
        const { data } = await axios.post(`https://${JITO_MAINNET_URL}/api/v1/bundles`,
            {
                jsonrpc: "2.0",
                id: 1,
                method: "getTipAccounts",
                params: [],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        return data.result;
    }
    catch (err) {
        console.log(err);
    }
    return [];
}

export const getJitoTipInstruction = async (keypair) => {
    while (1) {
        try {

            const tipAccounts = await getTipAccounts();
            const tipAccount = new PublicKey(tipAccounts[getRandomNumber(0, tipAccounts.length - 1)]);

            return SystemProgram.transfer({
                fromPubkey: keypair.publicKey,
                toPubkey: tipAccount,
                lamports: JITO_TIP * LAMPORTS_PER_SOL,
            })

        } catch (error) {
            console.error('Jito Tip Instruction Error', error);
        }
        await sleep(100);
    }

}

export const getTipTrx = async (connection, tipPayer) => {
    try {
        const tipAddrs = await getTipAccounts();
        const tipAddr = tipAddrs[getRandomNumber(0, tipAddrs.length - 1)]
        const tipAccount = new PublicKey(tipAddr);

        const tipTx = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: tipPayer.publicKey,
                toPubkey: tipAccount,
                lamports: LAMPORTS_PER_SOL * 0.0003,
            })
        );
        
        tipTx.recentBlockhash = (await connection.getLatestBlockhash("finalized")).blockhash;
        tipTx.sign(tipPayer);

        return tipTx;
    }
    catch (err) {
        console.log(err);
    }
    return null;
}

export const sendBundleTrxWithTip = async (connection, transactions, tipPayer) => {
    const tipTrx = await getTipTrx(connection, tipPayer)
    return await sendBundles([...transactions, tipTrx]);
}