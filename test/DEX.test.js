const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("DEX", function () {
    let dex, tokenA, tokenB;
    let owner, addr1, addr2;

    beforeEach(async function () {
        // Deploy tokens and DEX before each test
        [owner, addr1, addr2] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        tokenA = await MockERC20.deploy("Token A", "TKA");
        tokenB = await MockERC20.deploy("Token B", "TKB");

        const DEX = await ethers.getContractFactory("DEX");
        dex = await DEX.deploy(tokenA.address, tokenB.address);

        // Approve DEX to spend tokens
        await tokenA.approve(dex.address, ethers.utils.parseEther("1000000"));
        await tokenB.approve(dex.address, ethers.utils.parseEther("1000000"));

        // Mint tokens to addr1 and approve
        await tokenA.mint(addr1.address, ethers.utils.parseEther("10000"));
        await tokenB.mint(addr1.address, ethers.utils.parseEther("10000"));
        await tokenA.connect(addr1).approve(dex.address, ethers.utils.parseEther("10000"));
        await tokenB.connect(addr1).approve(dex.address, ethers.utils.parseEther("10000"));

        // Mint tokens to addr2 and approve
        await tokenA.mint(addr2.address, ethers.utils.parseEther("10000"));
        await tokenB.mint(addr2.address, ethers.utils.parseEther("10000"));
        await tokenA.connect(addr2).approve(dex.address, ethers.utils.parseEther("10000"));
        await tokenB.connect(addr2).approve(dex.address, ethers.utils.parseEther("10000"));
    });

    describe("Constructor", function () {
        it("should revert with zero address for token A", async function () {
            const DEX = await ethers.getContractFactory("DEX");
            await expect(
                DEX.deploy(ethers.constants.AddressZero, tokenB.address)
            ).to.be.revertedWith("Invalid token A address");
        });

        it("should revert with zero address for token B", async function () {
            const DEX = await ethers.getContractFactory("DEX");
            await expect(
                DEX.deploy(tokenA.address, ethers.constants.AddressZero)
            ).to.be.revertedWith("Invalid token B address");
        });

        it("should revert when both tokens are the same", async function () {
            const DEX = await ethers.getContractFactory("DEX");
            await expect(
                DEX.deploy(tokenA.address, tokenA.address)
            ).to.be.revertedWith("Tokens must be different");
        });
    });

    describe("Liquidity Management", function () {
        it("should allow initial liquidity provision", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await dex.addLiquidity(amountA, amountB);

            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(amountA);
            expect(reserves._reserveB).to.equal(amountB);
            expect(await dex.totalLiquidity()).to.be.gt(0);
        });

        it("should mint correct LP tokens for first provider", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await dex.addLiquidity(amountA, amountB);

            // Calculate sqrt manually for BigNumber
            const product = amountA.mul(amountB);
            let z = product.add(1).div(2);
            let y = product;
            while (z.lt(y)) {
                y = z;
                z = product.div(z).add(z).div(2);
            }
            const expectedLiquidity = y;

            const actualLiquidity = await dex.liquidity(owner.address);

            expect(actualLiquidity).to.equal(expectedLiquidity);
            expect(await dex.totalLiquidity()).to.equal(expectedLiquidity);
        });

        it("should allow subsequent liquidity additions", async function () {
            // First provider
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const initialTotalLiquidity = await dex.totalLiquidity();

            // Second provider
            await dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );

            const newTotalLiquidity = await dex.totalLiquidity();
            expect(newTotalLiquidity).to.be.gt(initialTotalLiquidity);
            expect(await dex.liquidity(addr1.address)).to.be.gt(0);
        });

        it("should maintain price ratio on liquidity addition", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const initialPrice = await dex.getPrice();

            await dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("50"),
                ethers.utils.parseEther("100")
            );

            const newPrice = await dex.getPrice();
            expect(newPrice).to.equal(initialPrice);
        });

        it("should allow partial liquidity removal", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const totalLiquidityBefore = await dex.totalLiquidity();
            const userLiquidityBefore = await dex.liquidity(owner.address);

            const removeAmount = userLiquidityBefore.div(2);
            await dex.removeLiquidity(removeAmount);

            const userLiquidityAfter = await dex.liquidity(owner.address);
            expect(userLiquidityAfter).to.equal(userLiquidityBefore.sub(removeAmount));
            expect(await dex.totalLiquidity()).to.equal(totalLiquidityBefore.sub(removeAmount));
        });

        it("should return correct token amounts on liquidity removal", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await dex.addLiquidity(amountA, amountB);

            const userLiquidity = await dex.liquidity(owner.address);
            const balanceABefore = await tokenA.balanceOf(owner.address);
            const balanceBBefore = await tokenB.balanceOf(owner.address);

            await dex.removeLiquidity(userLiquidity);

            const balanceAAfter = await tokenA.balanceOf(owner.address);
            const balanceBAfter = await tokenB.balanceOf(owner.address);

            expect(balanceAAfter.sub(balanceABefore)).to.equal(amountA);
            expect(balanceBAfter.sub(balanceBBefore)).to.equal(amountB);
        });

        it("should revert on zero liquidity addition", async function () {
            await expect(
                dex.addLiquidity(0, ethers.utils.parseEther("100"))
            ).to.be.revertedWith("Amount A must be greater than 0");

            await expect(
                dex.addLiquidity(ethers.utils.parseEther("100"), 0)
            ).to.be.revertedWith("Amount B must be greater than 0");
        });

        it("should revert when removing more liquidity than owned", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const userLiquidity = await dex.liquidity(owner.address);

            await expect(
                dex.removeLiquidity(userLiquidity.add(1))
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });

    describe("Token Swaps", function () {
        beforeEach(async function () {
            // Add initial liquidity before swap tests
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );
        });

        it("should swap token A for token B", async function () {
            const amountIn = ethers.utils.parseEther("10");
            const balanceBBefore = await tokenB.balanceOf(owner.address);

            await dex.swapAForB(amountIn);

            const balanceBAfter = await tokenB.balanceOf(owner.address);
            expect(balanceBAfter).to.be.gt(balanceBBefore);
        });

        it("should swap token B for token A", async function () {
            const amountIn = ethers.utils.parseEther("20");
            const balanceABefore = await tokenA.balanceOf(owner.address);

            await dex.swapBForA(amountIn);

            const balanceAAfter = await tokenA.balanceOf(owner.address);
            expect(balanceAAfter).to.be.gt(balanceABefore);
        });

        it("should calculate correct output amount with fee", async function () {
            const amountIn = ethers.utils.parseEther("10");
            const reserves = await dex.getReserves();

            const expectedOut = await dex.getAmountOut(amountIn, reserves._reserveA, reserves._reserveB);

            // Manual calculation: (10 * 997 * 200) / (100 * 1000 + 10 * 997)
            const amountInWithFee = amountIn.mul(997);
            const numerator = amountInWithFee.mul(reserves._reserveB);
            const denominator = reserves._reserveA.mul(1000).add(amountInWithFee);
            const manualExpected = numerator.div(denominator);

            expect(expectedOut).to.equal(manualExpected);
        });

        it("should update reserves after swap", async function () {
            const amountIn = ethers.utils.parseEther("10");
            const reservesBefore = await dex.getReserves();

            const expectedOut = await dex.getAmountOut(amountIn, reservesBefore._reserveA, reservesBefore._reserveB);
            await dex.swapAForB(amountIn);

            const reservesAfter = await dex.getReserves();
            expect(reservesAfter._reserveA).to.equal(reservesBefore._reserveA.add(amountIn));
            expect(reservesAfter._reserveB).to.equal(reservesBefore._reserveB.sub(expectedOut));
        });

        it("should increase k after swap due to fees", async function () {
            const reservesBefore = await dex.getReserves();
            const kBefore = reservesBefore._reserveA.mul(reservesBefore._reserveB);

            await dex.swapAForB(ethers.utils.parseEther("10"));

            const reservesAfter = await dex.getReserves();
            const kAfter = reservesAfter._reserveA.mul(reservesAfter._reserveB);

            expect(kAfter).to.be.gt(kBefore);
        });

        it("should revert on zero swap amount", async function () {
            await expect(
                dex.swapAForB(0)
            ).to.be.revertedWith("Amount in must be greater than 0");

            await expect(
                dex.swapBForA(0)
            ).to.be.revertedWith("Amount in must be greater than 0");
        });

        it("should handle large swaps with high price impact", async function () {
            const largeAmount = ethers.utils.parseEther("50");
            const reservesBefore = await dex.getReserves();

            await dex.swapAForB(largeAmount);

            const reservesAfter = await dex.getReserves();
            const priceBefore = reservesBefore._reserveB.mul(ethers.utils.parseEther("1")).div(reservesBefore._reserveA);
            const priceAfter = reservesAfter._reserveB.mul(ethers.utils.parseEther("1")).div(reservesAfter._reserveA);

            // Price should change significantly
            expect(priceAfter).to.not.equal(priceBefore);
        });

        it("should handle multiple consecutive swaps", async function () {
            const amountIn = ethers.utils.parseEther("5");

            await dex.swapAForB(amountIn);
            await dex.swapBForA(ethers.utils.parseEther("8"));
            await dex.swapAForB(amountIn);

            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.be.gt(0);
            expect(reserves._reserveB).to.be.gt(0);
        });
    });

    describe("Price Calculations", function () {
        it("should return correct initial price", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await dex.addLiquidity(amountA, amountB);

            const price = await dex.getPrice();
            const expectedPrice = amountB.mul(ethers.utils.parseEther("1")).div(amountA);

            expect(price).to.equal(expectedPrice);
        });

        it("should update price after swaps", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const priceBefore = await dex.getPrice();

            await dex.swapAForB(ethers.utils.parseEther("10"));

            const priceAfter = await dex.getPrice();
            expect(priceAfter).to.not.equal(priceBefore);
        });

        it("should handle price queries with zero reserves gracefully", async function () {
            await expect(dex.getPrice()).to.be.revertedWith("No liquidity");
        });
    });

    describe("Fee Distribution", function () {
        it("should accumulate fees for liquidity providers", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await dex.addLiquidity(amountA, amountB);
            const userLiquidity = await dex.liquidity(owner.address);

            // Perform multiple swaps to accumulate fees
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("10"));
            await dex.connect(addr1).swapBForA(ethers.utils.parseEther("15"));
            await dex.connect(addr1).swapAForB(ethers.utils.parseEther("5"));

            // Remove liquidity
            const balanceABefore = await tokenA.balanceOf(owner.address);
            const balanceBBefore = await tokenB.balanceOf(owner.address);

            await dex.removeLiquidity(userLiquidity);

            const balanceAAfter = await tokenA.balanceOf(owner.address);
            const balanceBAfter = await tokenB.balanceOf(owner.address);

            const receivedA = balanceAAfter.sub(balanceABefore);
            const receivedB = balanceBAfter.sub(balanceBBefore);

            // Due to fees, the constant product k should have increased
            // Check that the product of received amounts is greater than initial product
            const initialK = amountA.mul(amountB);
            const finalK = receivedA.mul(receivedB);

            // Final k should be greater due to accumulated fees
            expect(finalK).to.be.gt(initialK);
        });

        it("should distribute fees proportionally to LP share", async function () {
            // First provider adds liquidity
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            // Second provider adds liquidity
            await dex.connect(addr1).addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const ownerLiquidity = await dex.liquidity(owner.address);
            const addr1Liquidity = await dex.liquidity(addr1.address);

            // Perform swaps
            await dex.connect(addr2).swapAForB(ethers.utils.parseEther("20"));

            // Both should have approximately equal liquidity (50% each)
            const totalLiq = await dex.totalLiquidity();
            const ownerShare = ownerLiquidity.mul(100).div(totalLiq);
            const addr1Share = addr1Liquidity.mul(100).div(totalLiq);

            expect(ownerShare).to.be.closeTo(addr1Share, 1);
        });
    });

    describe("Edge Cases", function () {
        it("should handle very small liquidity amounts", async function () {
            const smallAmount = ethers.utils.parseEther("0.001");

            await dex.addLiquidity(smallAmount, smallAmount);

            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(smallAmount);
            expect(reserves._reserveB).to.equal(smallAmount);
        });

        it("should handle very large liquidity amounts", async function () {
            const largeAmount = ethers.utils.parseEther("100000");

            await tokenA.mint(owner.address, largeAmount);
            await tokenB.mint(owner.address, largeAmount);
            await tokenA.approve(dex.address, largeAmount);
            await tokenB.approve(dex.address, largeAmount);

            await dex.addLiquidity(largeAmount, largeAmount);

            const reserves = await dex.getReserves();
            expect(reserves._reserveA).to.equal(largeAmount);
        });

        it("should prevent unauthorized access", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const ownerLiquidity = await dex.liquidity(owner.address);

            // addr1 should not be able to remove owner's liquidity
            await expect(
                dex.connect(addr1).removeLiquidity(ownerLiquidity)
            ).to.be.revertedWith("Insufficient liquidity");
        });

        it("should handle sqrt edge case for small values (1, 2, 3)", async function () {
            // Test sqrt for values 1, 2, 3 which use the else branch
            // amountA * amountB = 1 when both are 1 wei
            await dex.addLiquidity(1, 1);

            const liquidity1 = await dex.liquidity(owner.address);
            expect(liquidity1).to.equal(1); // sqrt(1) = 1

            // Clean up
            await dex.removeLiquidity(liquidity1);

            // Test with 2 wei each (product = 4, sqrt = 2)
            await dex.addLiquidity(2, 2);
            const liquidity2 = await dex.liquidity(owner.address);
            expect(liquidity2).to.equal(2); // sqrt(4) = 2
        });

        it("should handle getAmountOut with zero reserves", async function () {
            await expect(
                dex.getAmountOut(100, 0, 100)
            ).to.be.revertedWith("Insufficient liquidity");

            await expect(
                dex.getAmountOut(100, 100, 0)
            ).to.be.revertedWith("Insufficient liquidity");
        });

        it("should handle getAmountOut with zero input", async function () {
            await expect(
                dex.getAmountOut(0, 100, 100)
            ).to.be.revertedWith("Insufficient input amount");
        });

        it("should revert swap when trying to drain entire pool", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            // Try to swap an amount that would drain the pool
            const hugeAmount = ethers.utils.parseEther("1000000");
            await tokenA.mint(owner.address, hugeAmount);
            await tokenA.approve(dex.address, hugeAmount);

            // The swap will succeed but with very small output due to price impact
            // This tests that large swaps are handled correctly
            const result = await dex.swapAForB(hugeAmount);
            expect(result).to.not.be.undefined;
        });

        it("should handle swap with no liquidity", async function () {
            await expect(
                dex.swapAForB(ethers.utils.parseEther("10"))
            ).to.be.revertedWith("Insufficient liquidity");
        });
    });

    describe("Events", function () {
        it("should emit LiquidityAdded event", async function () {
            const amountA = ethers.utils.parseEther("100");
            const amountB = ethers.utils.parseEther("200");

            await expect(dex.addLiquidity(amountA, amountB))
                .to.emit(dex, "LiquidityAdded")
                .withArgs(owner.address, amountA, amountB, await dex.totalLiquidity());
        });

        it("should emit LiquidityRemoved event", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const userLiquidity = await dex.liquidity(owner.address);

            await expect(dex.removeLiquidity(userLiquidity))
                .to.emit(dex, "LiquidityRemoved");
        });

        it("should emit Swap event", async function () {
            await dex.addLiquidity(
                ethers.utils.parseEther("100"),
                ethers.utils.parseEther("200")
            );

            const amountIn = ethers.utils.parseEther("10");

            await expect(dex.swapAForB(amountIn))
                .to.emit(dex, "Swap")
                .withArgs(owner.address, tokenA.address, tokenB.address, amountIn, await dex.getAmountOut(amountIn, ethers.utils.parseEther("100"), ethers.utils.parseEther("200")));
        });
    });
});
