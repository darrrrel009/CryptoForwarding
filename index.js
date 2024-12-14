require('dotenv').config();  // Loads variables from .env file
const Web3 = require('web3');  // Correct Web3 import

// Connect to Ethereum network (via Infura or another provider)
const web3 = new Web3(process.env.INFURA_URL);  // Directly pass the Infura URL here

// Wallet details (compromised wallet and the new secure wallet)
const compromisedPrivateKey = process.env.COMPROMISED_PRIVATE_KEY;
const secureWalletAddress = process.env.SECURE_WALLET_ADDRESS;

// Monitor the compromised wallet for incoming transactions
async function monitorAndForward() {
    const compromisedWalletAddress = web3.eth.accounts.privateKeyToAccount(compromisedPrivateKey).address;

    console.log(`Monitoring wallet: ${compromisedWalletAddress}`);
    
    web3.eth.subscribe('pendingTransactions', async (error, txHash) => {
        if (error) console.error("Error subscribing to transactions:", error);

        try {
            const tx = await web3.eth.getTransaction(txHash);
            
            // If the transaction is incoming to the compromised wallet address
            if (tx && tx.to && tx.to.toLowerCase() === compromisedWalletAddress.toLowerCase()) {
                console.log(`Incoming transaction detected: ${txHash}`);

                // Check if the transaction contains ETH (not a token transfer)
                if (tx.value > 0) {
                    console.log(`Forwarding ${web3.utils.fromWei(tx.value, 'ether')} ETH to secure wallet...`);

                    // Calculate the gas cost for forwarding the ETH
                    const gasPrice = await web3.eth.getGasPrice();
                    const gasEstimate = await web3.eth.estimateGas({
                        to: secureWalletAddress,
                        from: compromisedWalletAddress,
                        value: tx.value,
                    });
                    const gasCost = gasPrice * gasEstimate;

                    // Ensure that we leave enough ETH to cover the gas fees
                    if (web3.utils.toBN(tx.value).gt(web3.utils.toBN(gasCost))) {
                        const amountToForward = web3.utils.toBN(tx.value).sub(web3.utils.toBN(gasCost));

                        // Prepare the transaction to forward the ETH
                        const txObject = {
                            to: secureWalletAddress,
                            value: amountToForward,
                            gas: gasEstimate,
                            gasPrice: gasPrice,
                        };

                        // Sign and send the transaction
                        const signedTx = await web3.eth.accounts.signTransaction(txObject, compromisedPrivateKey);
                        const sentTx = await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
                        console.log(`Transaction forwarded successfully: ${sentTx.transactionHash}`);
                    } else {
                        console.log("Insufficient balance to cover gas fees and transfer.");
                    }
                }
            }
        } catch (err) {
            console.error("Error processing transaction:", err);
        }
    });
}

// Start monitoring the compromised wallet
monitorAndForward();
