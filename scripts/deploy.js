import hre from 'hardhat';
// hardhat 패키지에서 ehters.js 라이브러리만 가져옴
// 헬퍼 함수들도 많고 머 그래서 hardhat에 있는 ethers 라이브러리 많이 씀

/*
    (타임라인)
    1. deploy() 호출 
    | 트랜잭션 전송
    2. 트랜잭션이 mempool에 대기
    | 채굴자가 블록에 포함
    3. 블록 생성
    | 네트워크 확정
    4. waitForDeployment() 완료
*/

async function main() {
    console.log('Deploying SimpleToken to Giwa Sepolia...');

    // 배포할 토큰 정보 설정
    const tokenName = 'MyToken';
    const tokenSymbol = 'MTK';
    const decimals = 18;
    const initialSupply = 1000000;

    // 컨트랙트 배포
    const SimpleToken = await hre.ethers.getContractFactory('SimpleToken');
    // await 비동기 -> getContractFactory 끝날 때까지 대기
    // contracts/SimpleToken.sol 파일을 찾음 -> 컴파일 된 바이트코드와 ABI를 가져옴 
    // 여기서 '팩토리' = 컨트랙트를 만드는 공장

    // 실제 컨트랙트 배포 (같은 팩토리로 여러 개 배포 가능함)
    const token = await SimpleToken.deploy(
        tokenName,
        tokenSymbol,
        decimals,
        initialSupply
    );
    // 파라미터 => SimpleToken의 constructor에 전달할 인자

    // 배포 완료 대기 = 블록 확정 대기 = 블록에 포함되고 확정될 때까지 기다리기
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress(); // 배포된 컨트랙트 주소 가져오기

    console.log(" SimpleToken deployed to :", tokenAddress);
    console.log("Token Name:", tokenName);
    console.log("Token Symbol:", tokenSymbol);
    console.log("Decimals: ", decimals);
    console.log("Initial Supply:", initialSupply);

    // 배포자 주소 확인
    const [deployer] = await ethers.getSigners(); 
    // .getSigners() => 배열 반환함 [계정1, 계정2...]
    // 근데 const [deployer] 이 문법에 의해 첫 번째 계정만 가져오게 됨
    // deployer = accounts[0]
    // 왜 ? 첫 번째 계정이 배포자=컨트랙트소유주 이기 때문에 !!!

    console.log('Deployed by: ', deployer.address);

    console.log('Waiting for block confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 동안 잠시 멈추기
    /*
        [0초] contract.deploy() 실행
        ↓
        [1초] 트랜잭션 전송됨
        ↓
        [2초] waitForDeployment() 완료 ← "배포 트랜잭션이 블록에 포함됨!"
        ↓
        [하지만 아직 컨트랙트 상태가 완전히 동기화 안 됨!]
        ↓
        [3초] ← 이 사이에 잠깐 대기!
        ↓
        [5초] 이제 안전하게 balanceOf() 호출 가능! ✅
    */

    // 초기 잔액 확인
 try {
    const balance = await token.balanceOf(deployer.address);
    console.log('Deployer Balance:', ethers.formatUnits(balance, decimals));
  } catch (error) {
    console.log('Balance check skipped (contract still initializing)');
  }

    // .env 파일에 추가할 정보 출력
    console.log('\n Add this to your .env file:');
    console.log(`CONTRACT_ADDRESS=${tokenAddress}`);
}

main()
.then(() => process.exit(0)) // 성공하면 정상종료
.catch((error) => {
    console.error(error);
    process.exit(1);
}); // 에러면