import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Provider & Wallet
const provider = new ethers.JsonRpcProvider(
  process.env.GIWA_RPC_URL || 'https://sepolia-rpc.giwa.io'
);

const aWalletAddress = process.env.WALLET_ADDRESS_A;
const aPrivateKey = process.env.PRIVATE_KEY_A;
const bWalletAddress = process.env.WALLET_ADDRESS_B;
const bPrivateKey = process.env.PRIVATE_KEY_B;

const aWallet = new ethers.Wallet(aPrivateKey, provider);
const bWallet = new ethers.Wallet(bPrivateKey, provider);

// Contract ABI
const contractABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function mint(address to, uint256 amount) returns (bool)',
  'function burn(uint256 amount) returns (bool)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Mint(address indexed to, uint256 value)'
];

const aContract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, aWallet);
const bContract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, bWallet);


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', network: 'Giwa Sepolia' });
});

// 토큰 정보
app.get('/token/info', async (req, res) => {
  try {
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      aContract.name(),
      aContract.symbol(),
      aContract.decimals(),
      aContract.totalSupply()
    ]);

    res.json({
      success: true,
      data: {
        name,
        symbol,
        decimals: Number(decimals),
        totalSupply: ethers.formatUnits(totalSupply, decimals),
        contractAddress: process.env.CONTRACT_ADDRESS
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 잔액 조회
app.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }

    const balance = await aContract.balanceOf(address);
    const decimals = await aContract.decimals();

    res.json({
      success: true,
      data: {
        address,
        balance: ethers.formatUnits(balance, decimals),
        balanceRaw: balance.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 토큰 발행 (서버가 서명)
app.post('/mint', async (req, res) => {
  try {
    const { toAddress, amount } = req.body;

    if (!toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'toAddress and amount are required'
      });
    }

    if (!ethers.isAddress(toAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address'
      });
    }

    const decimals = await aContract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    console.log(`Minting ${amount} tokens to ${toAddress}...`);
    
    const tx = await aContract.mint(toAddress, amountInWei);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.hash);
    console.log();

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        toAddress,
        amount,
        blockNumber: receipt.blockNumber
      }
    });
  } catch (error) {
    console.error('Mint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});


// 토큰 송금 서버가 서명 - 송금자 지정하기
app.post('/transfer', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount } = req.body;

    if (!fromAddress || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fromAddress, toAddress and amount are required'
      });
    }

    if (!ethers.isAddress(toAddress) || !ethers.isAddress(fromAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address'
      });
    }

    // 송금할 수 있는 사용자인지 확인 - 서버가 개인키를 저장하고 있는 사용자만 fromAddress에 포함될 수 있음
    if (fromAddress.toLowerCase() !== aWalletAddress.toLowerCase() &&
        fromAddress.toLowerCase() !== bWalletAddress.toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: 'Unauthorized User'
          });
        }

    var contract;
    if (fromAddress.toLowerCase() === bWalletAddress.toLowerCase()) {
      contract = bContract;
    } else {
      contract = aContract;
    }

    const decimals = await contract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    console.log(`Transferring ${amount} tokens from ${fromAddress} to ${toAddress}...`);
    
    const tx = await contract.transfer(toAddress, amountInWei);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.hash);
    console.log();

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        fromAddress: aWallet.address,
        toAddress,
        amount,
        blockNumber: receipt.blockNumber
      }
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 허용량 설정 (서버가 서명)
app.post('/approve', async (req, res) => {
  try {
    const { msgSenderAddress, spenderAddress, amount } = req.body;

    if (!msgSenderAddress || !spenderAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'msgSenderAddress, spenderAddress and amount are required'
      });
    }

    if (!ethers.isAddress(spenderAddress) || !ethers.isAddress(msgSenderAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address'
      });
    }

    // 허용된 사용자인지 확인 - 서버가 privateKey를 관리하고 있는 유저인지 확인
    if (msgSenderAddress.toLowerCase() !== aWalletAddress.toLowerCase() &&
        msgSenderAddress.toLowerCase() !== bWalletAddress.toLowerCase()) {
          return res.status(400).json({
            success: false,
            error: 'Unauthorized User'
          });
    }

    const contract = (msgSenderAddress.toLocaleLowerCase() === bWalletAddress.toLowerCase()) ? bContract : aContract;
    const decimals = await contract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    console.log(`Approving ${msgSenderAddress}'s ${amount} tokens to ${spenderAddress}...`);
    
    const tx = await contract.approve(spenderAddress, amountInWei);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.hash);
    console.log();

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        spenderAddress,
        amount,
        blockNumber: receipt.blockNumber
      }
    });
  } catch (error) {
    console.error('Approve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 대리 송금 (서버가 서명)
app.post('/transfer-from', async (req, res) => {
  try {
    const { fromAddress, toAddress, amount } = req.body;

    if (!fromAddress || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: 'fromAddress, toAddress and amount are required'
      });
    }

    if (!ethers.isAddress(fromAddress) || !ethers.isAddress(toAddress)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid address'
      });
    }

    // 허용된 사용자인지 확인
    if ((fromAddress.toLowerCase() !== aWalletAddress.toLowerCase() &&
        fromAddress.toLowerCase() !== bWalletAddress.toLowerCase()) ||
        (toAddress.toLowerCase() !== aWalletAddress.toLowerCase() &&
        toAddress.toLowerCase() !== bWalletAddress.toLowerCase())) {
          return res.status(400).json({
            success: false,
            error: 'Unauthorized User'
          });
    }

    const contract = (toAddress.toLowerCase() === bWalletAddress.toLowerCase()) ? bContract : aContract;
    
    const decimals = await contract.decimals();
    const amountInWei = ethers.parseUnits(amount.toString(), decimals);

    console.log(`TransferFrom ${fromAddress} to ${toAddress}: ${amount} tokens...`);
    
    const tx = await contract.transferFrom(fromAddress, toAddress, amountInWei);
    console.log('Transaction sent:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('Transaction confirmed:', receipt.hash);
    console.log();

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        fromAddress,
        toAddress,
        amount,
        blockNumber: receipt.blockNumber
      }
    });
  } catch (error) {
    console.error('TransferFrom error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 허용량 조회
app.get('/allowance/:owner/:spender', async (req, res) => {
  try {
    const { owner, spender } = req.params;
    
    if (!ethers.isAddress(owner) || !ethers.isAddress(spender)) {
      return res.status(400).json({ success: false, error: 'Invalid address' });
    }

    const allowance = await aContract.allowance(owner, spender);
    const decimals = await aContract.decimals();

    res.json({
      success: true,
      data: {
        owner,
        spender,
        allowance: ethers.formatUnits(allowance, decimals),
        allowanceRaw: allowance.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 트랜잭션 조회
app.get('/transaction/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    const receipt = await provider.getTransactionReceipt(hash);
    
    if (!receipt) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    res.json({
      success: true,
      data: {
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status === 1 ? 'success' : 'failed',
        gasUsed: receipt.gasUsed.toString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/burn', async (req, res) => {
  try {
    const { msgSenderAddress, amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    if (!msgSenderAddress) {
      return res.status(400).json({
        success: false,
        error: 'msgSenderAddress is required'
      });
    }

    const contract = (msgSenderAddress.toLowerCase() === bWalletAddress.toLowerCase()) ? bContract : aContract;

    // decimals 반영
    const amountInWei = ethers.parseUnits(amount.toString(), await contract.decimals());

    const tx = await contract.burn(amountInWei);
    const receipt = await tx.wait();

    res.json({
      success: true,
      data: {
        txHash: receipt.hash,
        burnedAmount: amount,
        blockNumber: receipt.blockNumber
      }
    });
  } catch ( error ) {
    res.status(500).json({
      success: false,
      error: error.reason || error.message
    }
    );
  }
})

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📡 Connected to Giwa Sepolia`);
  console.log(`📝 Contract Address: ${process.env.CONTRACT_ADDRESS}`);
});