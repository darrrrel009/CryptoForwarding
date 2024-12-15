require('dotenv').config();
const Web3 = require('web3');
const pLimit = require('p-limit');
const rateLimit = pLimit(1);

// Environment Variables
const INFURA_URL = process.env.INFURA_URL.replace('http', 'wss');
const GETBLOCK_URL = process.env.GETBLOCK_URL;
const COMPROMISED_PRIVATE_KEY = process.env.COMPROMISED_PRIVATE_KEY;
const SECURE_WALLET = process.env.SECURE_WALLET;

// Initialize Web3 Providers
let currentProvider = INFURA_URL;
const web3 = new Web3(new Web3.providers.WebsocketProvider(currentProvider));

// Wallet Setup
const compromisedAccount = web3.eth.accounts.privateKeyToAccount(COMPROMISED_PRIVATE_KEY);
web3.eth.accounts.wallet.add(compromisedAccount);

// Utility: Switch Providers
const switchProvider = () => {
    currentProvider = currentProvider === INFURA_URL ? GETBLOCK_URL : INFURA_URL;
    web3.setProvider(new Web3.providers.WebsocketProvider(currentProvider));
    console.log(`Switched provider to: ${currentProvider}`);
};

// Monitor Pending Transactions
const monitorTransactions = async () => {
    console.log(`Monitoring transactions for: ${compromisedAccount.address}`);
    web3.eth.subscribe('pendingTransactions', async (error, txHash) => {
        if (error) {
            console.error('Error subscribing to transactions:', error.message);
            return;
        }

        try {
            const tx = await web3.eth.getTransaction(txHash);
            if (!tx || tx.to !== compromisedAccount.address) return;

            console.log(`Incoming transaction detected: ${txHash}`);

            // Check Balance and Forward ETH
            const balance = await web3.eth.getBalance(compromisedAccount.address);
            const gasPrice = await web3.eth.getGasPrice();
            const gasLimit = 21000; // Standard for ETH transfers
            const gasCost = BigInt(gasPrice) * BigInt(gasLimit);

            if (BigInt(balance) <= gasCost) {
                console.log('Not enough balance to cover gas fees.');
                return;
            }

            const transferAmount = BigInt(balance) - gasCost;
            await forwardETH(transferAmount, gasPrice, gasLimit);
        } catch (err) {
            if (err.message.includes('Too Many Requests')) {
                console.warn('Rate limit hit, switching provider...');
                switchProvider();
            } else {
                console.error('Error processing transaction:', err.message);
            }
        }
    });
};

// Forward ETH to Secure Wallet
const forwardETH = async (amount, gasPrice, gasLimit) => {
    try {
        const tx = {
            from: compromisedAccount.address,
            to: SECURE_WALLET,
            value: amount.toString(),
            gas: gasLimit,
            gasPrice,
        };

        const signedTx = await web3.eth.accounts.signTransaction(tx, COMPROMISED_PRIVATE_KEY);
        const receipt = await rateLimit(() => web3.eth.sendSignedTransaction(signedTx.rawTransaction));
        console.log(`Successfully forwarded ${web3.utils.fromWei(amount.toString(), 'ether')} ETH.`);
        console.log('Transaction receipt:', receipt);
    } catch (err) {
        console.error('Error forwarding ETH:', err.message);
        if (err.message.includes('Too Many Requests')) {
            console.warn('Rate limit hit during forward, switching provider...');
            switchProvider();
        }
    }
};

// Start Monitoring
(async () => {
    try {
        await monitorTransactions();
    } catch (err) {
        console.error('Error initializing monitoring:', err.message);
    }
})();
