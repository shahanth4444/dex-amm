const hre = require("hardhat");

async function main() {
    console.log("\n🚀 STARTING DEX SIMULATION 🚀");
    console.log("================================\n");

    // 1. Deploy Contracts
    console.log("📝 Step 1: Deploying Contracts...");
    const [owner, trader] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Gold", "GLD");
    const tokenB = await MockERC20.deploy("Silver", "SLV");
    await tokenA.deployed();
    await tokenB.deployed();

    const DEX = await hre.ethers.getContractFactory("DEX");
    const dex = await DEX.deploy(tokenA.address, tokenB.address);
    await dex.deployed();

    console.log("   ✅ Tokens deployed:");
    console.log(`      - Gold (GLD): ${tokenA.address}`);
    console.log(`      - Silver (SLV): ${tokenB.address}`);
    console.log(`   ✅ DEX deployed at: ${dex.address}\n`);

    // 2. Setup Initial Balances
    console.log("💰 Step 2: Setting up Wallets...");
    const mintAmount = hre.ethers.utils.parseEther("10000");
    await tokenA.mint(owner.address, mintAmount);
    await tokenB.mint(owner.address, mintAmount);
    await tokenA.mint(trader.address, mintAmount);
    await tokenB.mint(trader.address, mintAmount);

    console.log("   ✅ Minted 10,000 GLD and SLV to Owner and Trader");
    console.log("   ✅ Approving DEX to spend tokens...\n");

    await tokenA.approve(dex.address, mintAmount);
    await tokenB.approve(dex.address, mintAmount);
    await tokenA.connect(trader).approve(dex.address, mintAmount);
    await tokenB.connect(trader).approve(dex.address, mintAmount);

    // 3. Add Initial Liquidity
    console.log("💧 Step 3: Owner Adding Initial Liquidity...");
    const amountA = hre.ethers.utils.parseEther("100");
    const amountB = hre.ethers.utils.parseEther("200");

    console.log(`   🔸 Adding: 100 GLD + 200 SLV`);
    await dex.addLiquidity(amountA, amountB);

    const reserves = await dex.getReserves();
    console.log(`   ✅ Liquidity Added!`);
    console.log(`   📊 Pool State:`);
    console.log(`      - Reserve GLD: ${hre.ethers.utils.formatEther(reserves._reserveA)}`);
    console.log(`      - Reserve SLV: ${hre.ethers.utils.formatEther(reserves._reserveB)}`);

    const initialPrice = await dex.getPrice();
    console.log(`      - Price: 1 GLD = ${hre.ethers.utils.formatEther(initialPrice)} SLV\n`);

    // 4. Perform a Swap
    console.log("🔄 Step 4: Trader Swapping GLD for SLV...");
    const swapAmount = hre.ethers.utils.parseEther("10");
    console.log(`   🔸 Trader Input: 10 GLD`);

    // Calculate expected output
    const expectedOut = await dex.getAmountOut(swapAmount, reserves._reserveA, reserves._reserveB);
    console.log(`   🔮 Expected Output: ${hre.ethers.utils.formatEther(expectedOut)} SLV`);

    // Execute swap
    await dex.connect(trader).swapAForB(swapAmount);
    console.log(`   ✅ Swap Complete!\n`);

    // 5. Check New State
    console.log("📈 Step 5: Post-Swap Analysis...");
    const newReserves = await dex.getReserves();
    const balances = await dex.getReserves();

    console.log(`   📊 New Pool State:`);
    console.log(`      - Reserve GLD: ${hre.ethers.utils.formatEther(newReserves._reserveA)} (Increased)`);
    console.log(`      - Reserve SLV: ${hre.ethers.utils.formatEther(newReserves._reserveB)} (Decreased)`);

    const newPrice = await dex.getPrice();
    console.log(`      - New Price: 1 GLD = ${hre.ethers.utils.formatEther(newPrice)} SLV`);
    console.log(`   💡 Price Impact: GLD is now cheaper (more supply in pool)!`);

    // Check Fee Accumulation
    const kOld = reserves._reserveA.mul(reserves._reserveB);
    const kNew = newReserves._reserveA.mul(newReserves._reserveB);

    console.log(`\n💵 Step 6: Fee Validation`);
    console.log(`   - K (Constant Product) before: ${kOld}`);
    console.log(`   - K (Constant Product) after:  ${kNew}`);
    if (kNew.gt(kOld)) {
        console.log(`   ✅ K increased! Fees collected correctly.`);
    } else {
        console.log(`   ❌ Error: K did not increase.`);
    }

    console.log("\n🎉 SIMULATION COMPLETE! The DEX is fully functional.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
