import '@nomicfoundation/hardhat-toolbox';
import dotenv from 'dotenv';

dotenv.config();

export default {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    giwaSepolia: {
      url: process.env.GIWA_RPC_URL || 'https://sepolia-rpc.giwa.io',
      chainId: 91342,
      accounts: process.env.PRIVATE_KEY_A ? [process.env.PRIVATE_KEY_A] : [],
      gasPrice: 'auto',
    },
    hardhat: {
      chainId: 31337,
    },
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};