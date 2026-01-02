const hre = require("hardhat");

async function main() {
    console.log("Deploying DEX AMM contracts...");

    // Deploy Token A
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA");
    await tokenA.deployed();
    console.log("Token A deployed to:", tokenA.address);

    // Deploy Token B
    const tokenB = await MockERC20.deploy("Token B", "TKB");
    await tokenB.deployed();
    console.log("Token B deployed to:", tokenB.address);

    // Deploy DEX
    const DEX = await hre.ethers.getContractFactory("DEX");
    const dex = await DEX.deploy(tokenA.address, tokenB.address);
    await dex.deployed();
    console.log("DEX deployed to:", dex.address);

    console.log("\nDeployment Summary:");
    console.log("===================");
    console.log("Token A:", tokenA.address);
    console.log("Token B:", tokenB.address);
    console.log("DEX:", dex.address);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
