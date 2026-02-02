import express from 'express';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(process.env.GIWA_RPC_URL);
const contractAddress = process.env.CONTRACT_ADDRESS;

const contractABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Mint(address indexed to, uint256 value)'
];

const contract = new ethers.Contract(contractAddress, contractABI, provider);


// 1. 트랜잭션조회 api (tx 기본 정보)
app.get('/api/tx/:hash', async ( req, res ) => {
    try {
        const tx = await provider.getTransaction(req.params.hash);

        if (!tx) {
            return returnError(res, 404, 'TX not found');
        }

        console.log('📝 tx : ', tx);

        res.json({
            hash : tx.hash,
            from: tx.from,
            to: tx.to,
            value: ethers.formatEther(tx.value),
            gasLimit : tx.gasLimit.toString(),
            gasPrice: tx.gasPrice?.toString(),
            nonce: tx.nonce,
            data: tx.data,
            blockNumber: tx.blockNumber
        });
    } catch (e) {
        handleError(res, e.message);
    }
})

// 2. 트랜잭션 영수증 api 
app.get('/api/tx/:hash/receipt', async (req, res) => {
    try {
        const receipt = await provider.getTransactionReceipt(req.params.hash);

        if (! receipt) {
            return returnError(res, 404, 'Receipt not found');
        }

        console.log('📝 receipt : ', receipt);


        res.json( {
            transactionHash : receipt.transactionHash,
            blockNumber: receipt.blockNumber,  
            status: receipt.status,
            gasUsed: receipt.gasUsed.toString(),
            cumulativeGasUsed: receipt.cumulativeGasUsed.toString(),
            logsCount: receipt.logs.length
        });
    } catch (e) {
        handleError(res, e.message);
    }
})

// 3. 블록 조회 
app.get('/api/block/:number', async (req, res) => {
    try {
        const block = await provider.getBlock(Number(req.params.number));

        console.log('📝 block : ', block);

        res.json({
            number: block.number,
            hash: block.hash,
            timestamp: block.timestamp,
            date : new Date(block.timestamp * 1000).toISOString(),
            txCount : block.transactions.length
        });
    } catch (e) {
        handleError(res, e.message);
    }
});

// 이벤트 로그 원본 그대로 보기
app.get('/api/tx/:hash/logs/raw', async (req, res) => {
    try {
        const receipt = await provider.getTransactionReceipt(req.params.hash);
        res.json(receipt.logs);
    } catch (e) {
        handleError(res, e.message);
    }
});

// 이벤트 파싱 
app.get('/api/tx/:hash/logs/parsed', async (req, res) => {
  try {
    const receipt = await provider.getTransactionReceipt(req.params.hash);

    const parsedLogs = receipt.logs
      // 1️⃣ 내 컨트랙트 로그만 필터링
      .filter(
        log => log.address.toLowerCase() === contract.target.toLowerCase()
      )
      // 2️⃣ ABI 기준으로 파싱
      .map(log => {
        try {
          const parsed = contract.interface.parseLog(log);

          const args = {};

          // 3️⃣ fragment.inputs 기준으로 "이름 있는 인자만" 뽑기
          parsed.fragment.inputs.forEach((input, index) => {
            const value = parsed.args[index];

            // 🔥 BigInt → string 변환 (JSON 에러 방지)
            args[input.name] =
              typeof value === 'bigint' ? value.toString() : value;
          });

          return {
            event: parsed.name, // ex) Transfer
            args               // ex) { from, to, value }
          };
        } catch (err) {
          // ABI에 없는 이벤트 / 다른 컨트랙트 로그
          return null;
        }
      })
      .filter(Boolean); // null 제거

    res.json(parsedLogs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});





export function handleError(res, message) {
    res.status(500).json({
        success: false,
        error: message
    });
}

function returnError(res, statusCode, message) {
    return res.status(statusCode).json({
        success: false,
        error: message
    });
}

// ============================================
// 서버 시작
// ============================================

const PORT = 4000;

app.listen(PORT, () => {
    console.log('🏃 Running ....');
})